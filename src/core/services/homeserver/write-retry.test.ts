import { describe, expect, it, vi } from 'vitest';
import { httpStatusCodeToError } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import {
  HOMESERVER_PUBLISH_CONFLICT_MESSAGE,
  HOMESERVER_WRITE_MAX_ATTEMPTS,
  isHomeserverPublishConflict,
  retryHomeserverWrite,
  retryHomeserverWriteAfterReread,
} from './write-retry';

function requestError(statusCode: number, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(`status ${statusCode}`), {
    name: 'RequestError',
    data: { statusCode, ...extra },
  });
}

/** The SDK's rejection: `Display` of `RequestError::Server`, with the response body after the status. */
function serverError(statusCode: number, reason: string, body: string): Error {
  return Object.assign(new Error(`Request failed: Server responded with an error: ${statusCode} ${reason} - ${body}`), {
    name: 'RequestError',
    data: { statusCode },
  });
}

const publishConflict = () => serverError(409, 'Conflict', HOMESERVER_PUBLISH_CONFLICT_MESSAGE);
const pathCollision = () => serverError(409, 'Conflict', 'File/folder path collision');

describe('retryHomeserverWrite', () => {
  it('retries 429 and honours Retry-After delta-seconds', async () => {
    const operation = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(requestError(429, { headers: new Headers({ 'retry-after': '2' }) }))
      .mockResolvedValueOnce();
    const sleep = vi.fn<(delayMs: number) => Promise<void>>().mockResolvedValue();

    await retryHomeserverWrite(HttpMethod.PUT, operation, { sleep, random: () => 0 });

    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it('uses jittered exponential backoff for 429 without Retry-After', async () => {
    const operation = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(requestError(429))
      .mockRejectedValueOnce(requestError(429))
      .mockResolvedValueOnce();
    const sleep = vi.fn<(delayMs: number) => Promise<void>>().mockResolvedValue();

    await retryHomeserverWrite(HttpMethod.PUT, operation, { sleep, random: () => 0.25 });

    expect(sleep.mock.calls).toEqual([[188], [375]]);
  });

  it('retries a 500 PUT with the identical operation and then succeeds', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(requestError(500))
      .mockResolvedValueOnce('stored');

    await expect(
      retryHomeserverWrite(HttpMethod.PUT, operation, { sleep: async () => {}, random: () => 0 }),
    ).resolves.toBe('stored');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('stops at the bounded attempt cap and preserves the final error', async () => {
    const finalError = requestError(503);
    const operation = vi.fn<() => Promise<void>>().mockRejectedValue(finalError);

    await expect(
      retryHomeserverWrite(HttpMethod.DELETE, operation, { sleep: async () => {}, random: () => 0 }),
    ).rejects.toBe(finalError);
    expect(operation).toHaveBeenCalledTimes(HOMESERVER_WRITE_MAX_ATTEMPTS);
  });

  it('makes one attempt and never sleeps with maxRetries 0', async () => {
    const finalError = requestError(503);
    const operation = vi.fn<() => Promise<void>>().mockRejectedValue(finalError);
    const sleep = vi.fn<(delayMs: number) => Promise<void>>().mockResolvedValue();

    await expect(
      retryHomeserverWrite(HttpMethod.PUT, operation, { sleep, random: () => 0, maxRetries: 0 }),
    ).rejects.toBe(finalError);
    expect(operation).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it('clamps a pathological Retry-After to the bounded wait', async () => {
    const operation = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(requestError(429, { retryAfter: '999999' }))
      .mockResolvedValueOnce();
    const sleep = vi.fn<(delayMs: number) => Promise<void>>().mockResolvedValue();

    await retryHomeserverWrite(HttpMethod.PUT, operation, { sleep, random: () => 0 });

    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(30_000);
  });

  it.each([
    ['a 400', requestError(400)],
    ['a 401', requestError(401)],
    ['a 404', requestError(404)],
    ['a status-less transport failure', Object.assign(new Error('error sending request'), { name: 'RequestError' })],
  ])('does not retry %s', async (_name, error) => {
    const operation = vi.fn<() => Promise<void>>().mockRejectedValue(error);
    const sleep = vi.fn<(delayMs: number) => Promise<void>>();

    await expect(retryHomeserverWrite(HttpMethod.PUT, operation, { sleep })).rejects.toBe(error);
    expect(operation).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it('runs a method other than PUT or DELETE once', async () => {
    const operation = vi.fn<() => Promise<void>>().mockRejectedValue(requestError(503));

    await expect(retryHomeserverWrite(HttpMethod.POST, operation, { sleep: async () => {} })).rejects.toThrow();
    expect(operation).toHaveBeenCalledOnce();
  });

  it('starts the first attempt in the caller tick and stops when the guard throws before a retry', async () => {
    const guardError = new Error('session ended');
    const operation = vi.fn<() => Promise<void>>().mockRejectedValue(requestError(503));
    const beforeAttempt = vi.fn((attempt: number) => {
      if (attempt > 0) throw guardError;
    });

    const pending = retryHomeserverWrite(HttpMethod.PUT, operation, { sleep: async () => {}, beforeAttempt });
    expect(operation).toHaveBeenCalledOnce();

    await expect(pending).rejects.toBe(guardError);
    expect(operation).toHaveBeenCalledOnce();
    expect(beforeAttempt.mock.calls).toEqual([[0], [1]]);
  });

  it('retries a 503 DELETE response and honours Retry-After HTTP-date on 429', async () => {
    const retryAt = new Date(12_000).toUTCString();
    const operation = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'retry-after': retryAt } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const sleep = vi.fn<(delayMs: number) => Promise<void>>().mockResolvedValue();

    const response = await retryHomeserverWrite(HttpMethod.DELETE, operation, {
      sleep,
      random: () => 0,
      now: () => 10_000,
    });

    expect(response.status).toBe(204);
    expect(sleep.mock.calls).toEqual([[125], [2_000]]);
  });

  describe('409', () => {
    it('retries the publish conflict with the exponential backoff and then succeeds', async () => {
      const operation = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(publishConflict())
        .mockRejectedValueOnce(publishConflict())
        .mockResolvedValueOnce('stored');
      const sleep = vi.fn<(delayMs: number) => Promise<void>>().mockResolvedValue();

      await expect(retryHomeserverWrite(HttpMethod.PUT, operation, { sleep, random: () => 0 })).resolves.toBe('stored');

      expect(operation).toHaveBeenCalledTimes(3);
      expect(sleep.mock.calls).toEqual([[125], [250]]);
    });

    it('stops retrying the publish conflict at the attempt cap and preserves the final error', async () => {
      const finalError = publishConflict();
      const operation = vi.fn<() => Promise<void>>().mockRejectedValue(finalError);

      await expect(
        retryHomeserverWrite(HttpMethod.PUT, operation, { sleep: async () => {}, random: () => 0 }),
      ).rejects.toBe(finalError);
      expect(operation).toHaveBeenCalledTimes(HOMESERVER_WRITE_MAX_ATTEMPTS);
    });

    it.each([
      ['a path collision', pathCollision()],
      ['an unknown lock token', serverError(409, 'Conflict', 'No lock with this token on this path')],
      ['a 409 with no body', requestError(409)],
    ])('does not retry %s', async (_name, error) => {
      const operation = vi.fn<() => Promise<void>>().mockRejectedValue(error);
      const sleep = vi.fn<(delayMs: number) => Promise<void>>();

      await expect(retryHomeserverWrite(HttpMethod.PUT, operation, { sleep })).rejects.toBe(error);
      expect(operation).toHaveBeenCalledOnce();
      expect(sleep).not.toHaveBeenCalled();
    });

    it.each([
      ['412 lock token mismatch', serverError(412, 'Precondition Failed', 'The If header does not name the live lock')],
      ['423 locked', serverError(423, 'Locked', 'Resource is locked')],
    ])('does not retry a %s', async (_name, error) => {
      const operation = vi.fn<() => Promise<void>>().mockRejectedValue(error);

      await expect(retryHomeserverWrite(HttpMethod.PUT, operation, { sleep: async () => {} })).rejects.toBe(error);
      expect(operation).toHaveBeenCalledOnce();
    });

    it('reads a fetch response body to tell the publish conflict from a path collision, leaving it readable', async () => {
      const operation = vi
        .fn<() => Promise<Response>>()
        .mockResolvedValueOnce(new Response(HOMESERVER_PUBLISH_CONFLICT_MESSAGE, { status: 409 }))
        .mockResolvedValueOnce(new Response('File/folder path collision', { status: 409 }));
      const sleep = vi.fn<(delayMs: number) => Promise<void>>().mockResolvedValue();

      const response = await retryHomeserverWrite(HttpMethod.PUT, operation, { sleep, random: () => 0 });

      expect(operation).toHaveBeenCalledTimes(2);
      expect(sleep).toHaveBeenCalledOnce();
      expect(response.status).toBe(409);
      await expect(response.text()).resolves.toBe('File/folder path collision');
    });
  });

  describe('an AppError from a homeserver write', () => {
    const appError = (statusCode: number, message: string) =>
      httpStatusCodeToError(statusCode, message, ErrorService.Homeserver, 'request', 'pubky://user/pub/file.json');

    it('retries a 503 and the publish conflict by the status in its context', async () => {
      const operation = vi
        .fn<() => Promise<void>>()
        .mockRejectedValueOnce(appError(503, 'Service Unavailable'))
        .mockRejectedValueOnce(appError(409, publishConflict().message))
        .mockResolvedValueOnce();

      await retryHomeserverWrite(HttpMethod.PUT, operation, { sleep: async () => {}, random: () => 0 });

      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('does not retry its path collision', async () => {
      const error = appError(409, pathCollision().message);
      const operation = vi.fn<() => Promise<void>>().mockRejectedValue(error);

      await expect(retryHomeserverWrite(HttpMethod.PUT, operation, { sleep: async () => {} })).rejects.toBe(error);
      expect(operation).toHaveBeenCalledOnce();
    });

    it('honours the Retry-After a 429 carries', async () => {
      const error = httpStatusCodeToError(429, 'Too Many Requests', ErrorService.Homeserver, 'request', 'url', 3);
      const operation = vi.fn<() => Promise<void>>().mockRejectedValueOnce(error).mockResolvedValueOnce();
      const sleep = vi.fn<(delayMs: number) => Promise<void>>().mockResolvedValue();

      await retryHomeserverWrite(HttpMethod.PUT, operation, { sleep, random: () => 0 });

      expect(sleep).toHaveBeenCalledWith(3_000);
    });
  });
});

describe('isHomeserverPublishConflict', () => {
  it('needs both the 409 and the homeserver message', () => {
    expect(isHomeserverPublishConflict(publishConflict())).toBe(true);
    expect(isHomeserverPublishConflict(pathCollision())).toBe(false);
    expect(isHomeserverPublishConflict(requestError(409))).toBe(false);
    expect(
      isHomeserverPublishConflict(serverError(500, 'Internal Server Error', HOMESERVER_PUBLISH_CONFLICT_MESSAGE)),
    ).toBe(false);
    expect(isHomeserverPublishConflict(new Error(HOMESERVER_PUBLISH_CONFLICT_MESSAGE))).toBe(false);
  });
});

describe('retryHomeserverWriteAfterReread', () => {
  const openFence = () => ({ enter: vi.fn<(pass: number) => void>(), assertCurrent: vi.fn<() => void>() });

  it('runs the read and the write again after a publish conflict', async () => {
    let published = 'v1';
    const reads: string[] = [];
    const readAndWrite = vi.fn(async () => {
      reads.push(published);
      if (reads.length === 1) {
        published = 'late';
        throw publishConflict();
      }
      return `${published}+edit`;
    });
    const sleep = vi.fn<(delayMs: number) => Promise<void>>().mockResolvedValue();
    const fence = openFence();

    await expect(retryHomeserverWriteAfterReread(fence, readAndWrite, { sleep, random: () => 0 })).resolves.toBe(
      'late+edit',
    );

    expect(reads).toEqual(['v1', 'late']);
    expect(sleep).toHaveBeenCalledWith(125);
    expect(fence.enter.mock.calls).toEqual([[0], [1]]);
    expect(readAndWrite.mock.calls).toEqual([[0], [1]]);
  });

  it('does not run again after a real conflict or a 400', async () => {
    for (const error of [pathCollision(), requestError(409), requestError(400)]) {
      const readAndWrite = vi.fn<() => Promise<void>>().mockRejectedValue(error);
      const sleep = vi.fn<(delayMs: number) => Promise<void>>();

      await expect(retryHomeserverWriteAfterReread(openFence(), readAndWrite, { sleep })).rejects.toBe(error);
      expect(readAndWrite).toHaveBeenCalledOnce();
      expect(sleep).not.toHaveBeenCalled();
    }
  });

  it('starts over from the read on 429, 500 and 503 too, honouring Retry-After', async () => {
    const readAndWrite = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(requestError(429, { retryAfter: 2 }))
      .mockRejectedValueOnce(requestError(500))
      .mockResolvedValueOnce('stored');
    const sleep = vi.fn<(delayMs: number) => Promise<void>>().mockResolvedValue();

    await expect(retryHomeserverWriteAfterReread(openFence(), readAndWrite, { sleep, random: () => 0 })).resolves.toBe(
      'stored',
    );
    expect(readAndWrite.mock.calls).toEqual([[0], [1], [2]]);
    expect(sleep.mock.calls).toEqual([[2_000], [250]]);
  });

  it('stops before the next pass when the fence throws', async () => {
    const ended = new Error('session ended');
    const fence = openFence();
    fence.enter.mockImplementation((pass) => {
      if (pass > 0) throw ended;
    });
    const readAndWrite = vi.fn<() => Promise<void>>().mockRejectedValue(publishConflict());

    await expect(
      retryHomeserverWriteAfterReread(fence, readAndWrite, { sleep: async () => {}, random: () => 0 }),
    ).rejects.toBe(ended);
    expect(readAndWrite).toHaveBeenCalledOnce();
  });

  it('stops at the attempt cap and preserves the final conflict', async () => {
    const finalError = publishConflict();
    const readAndWrite = vi.fn<() => Promise<void>>().mockRejectedValue(finalError);

    await expect(
      retryHomeserverWriteAfterReread(openFence(), readAndWrite, { sleep: async () => {}, random: () => 0 }),
    ).rejects.toBe(finalError);
    expect(readAndWrite).toHaveBeenCalledTimes(HOMESERVER_WRITE_MAX_ATTEMPTS);
  });
});
