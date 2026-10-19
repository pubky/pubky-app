import type { Session } from '@synonymdev/pubky';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { HttpMethod } from '@/libs/http/http.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { asOpaque } from '@/test-utils/type-assertions';
import { HomeserverService } from './homeserver';
import {
  HOMESERVER_PUBLISH_CONFLICT_MESSAGE,
  HOMESERVER_WRITE_MAX_ATTEMPTS,
  installHomeserverWriteRetryDependenciesForTests,
  isHomeserverPublishConflict,
  retryHomeserverWriteAfterReread,
} from './write-retry';

const mockState = vi.hoisted(() => ({
  putJson: vi.fn(),
  putBytes: vi.fn(),
  delete: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@/libs/logger/logger', () => ({
  Logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@synonymdev/pubky', () => {
  const createSdk = () => ({
    client: { fetch: (...args: unknown[]) => mockState.fetch(...args) },
    publicStorage: { get: vi.fn(), exists: vi.fn(), list: vi.fn() },
  });
  const MockPubky = vi.fn().mockImplementation(createSdk);
  // @ts-expect-error testnet is a static constructor on the SDK class
  MockPubky.testnet = vi.fn().mockImplementation(createSdk);
  // @ts-expect-error withClient is a static constructor on the SDK class
  MockPubky.withClient = vi.fn().mockImplementation(createSdk);
  return { Pubky: MockPubky, Client: vi.fn(), resolvePubky: (url: string) => url };
});

const USER = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y';
const PROFILE_URL = `pubky://${USER}/pub/pubky.app/profile.json`;
const PROFILE_PATH = '/pub/pubky.app/profile.json';
const BLOB_URL = `pubky://${USER}/pub/pubky.app/blobs/0000`;
const PUBLIC_URL = 'https://homeserver.example/pub/file.json';

function session(): Session {
  return asOpaque<Session>({
    info: { publicKey: { z32: () => USER } },
    storage: {
      putJson: (...args: unknown[]) => mockState.putJson(...args),
      putBytes: (...args: unknown[]) => mockState.putBytes(...args),
      delete: (...args: unknown[]) => mockState.delete(...args),
      get: vi.fn(),
      exists: vi.fn(),
      list: vi.fn(),
    },
  });
}

function requestError(statusCode: number): Error {
  return Object.assign(new Error(`Request failed: Server responded with an error: ${statusCode}`), {
    name: 'RequestError',
    data: { statusCode },
  });
}

/** The SDK's 0.16 rejection for a homeserver 409: the response body follows the status. */
function conflictError(body: string): Error {
  return Object.assign(new Error(`Request failed: Server responded with an error: 409 Conflict - ${body}`), {
    name: 'RequestError',
    data: { statusCode: 409 },
  });
}

describe('homeserver writes route through the shared retry policy', () => {
  let sleep: ReturnType<typeof vi.fn<(delayMs: number) => Promise<void>>>;

  beforeEach(() => {
    // The SDK client is a process-wide singleton. A previous test can leave a
    // client whose fetch is not this file's mock.
    Reflect.set(HomeserverService, 'pubkySdk', null);
    useAuthStore.setState({
      session: session(),
      currentUserPubky: USER,
      generation: 'generation-1',
      restoreStatus: 'ready',
      sessionReference: null,
      isLoggingOut: false,
    });
    mockState.putJson.mockReset().mockResolvedValue(undefined);
    mockState.putBytes.mockReset().mockResolvedValue(undefined);
    mockState.delete.mockReset().mockResolvedValue(undefined);
    mockState.fetch.mockReset();
    sleep = vi.fn<(delayMs: number) => Promise<void>>().mockResolvedValue();
    installHomeserverWriteRetryDependenciesForTests({ sleep, random: () => 0, now: () => 0 });
  });

  afterEach(() => {
    installHomeserverWriteRetryDependenciesForTests(null);
    useAuthStore.setState({ session: null, currentUserPubky: null, generation: '', isLoggingOut: false });
    vi.restoreAllMocks();
  });

  it('retries an owned PUT refused by the publish conflict and replays the JSON it was given', async () => {
    const body = { name: 'Alice', bio: 'one' };
    mockState.putJson
      .mockImplementationOnce(async () => {
        body.bio = 'mutated';
        throw conflictError(HOMESERVER_PUBLISH_CONFLICT_MESSAGE);
      })
      .mockResolvedValueOnce(undefined);

    await HomeserverService.request({ method: HttpMethod.PUT, url: PROFILE_URL, bodyJson: body });

    expect(mockState.putJson).toHaveBeenCalledTimes(2);
    expect(mockState.putJson).toHaveBeenNthCalledWith(2, PROFILE_PATH, { name: 'Alice', bio: 'one' });
    expect(sleep).toHaveBeenCalledExactlyOnceWith(125);
  });

  it('hands the SDK the body with its undefined properties, as it did before retries', async () => {
    const body = { content: 'hi', kind: 'short', parent: undefined };
    mockState.putJson.mockRejectedValueOnce(requestError(503)).mockResolvedValueOnce(undefined);

    await HomeserverService.request({ method: HttpMethod.PUT, url: PROFILE_URL, bodyJson: body });

    for (const [, sent] of mockState.putJson.mock.calls) {
      expect(Object.keys(sent as object)).toEqual(['content', 'kind', 'parent']);
      expect(sent).not.toBe(body);
    }
  });

  it.each([429, 500, 503])('retries an owned PUT on %i and then succeeds', async (status) => {
    mockState.putJson.mockRejectedValueOnce(requestError(status)).mockResolvedValueOnce(undefined);

    await HomeserverService.request({ method: HttpMethod.PUT, url: PROFILE_URL, bodyJson: { name: 'Alice' } });

    expect(mockState.putJson).toHaveBeenCalledTimes(2);
  });

  it('stops at the attempt cap and throws the final status as an AppError', async () => {
    mockState.putJson.mockRejectedValue(requestError(503));

    await expect(
      HomeserverService.request({ method: HttpMethod.PUT, url: PROFILE_URL, bodyJson: { name: 'Alice' } }),
    ).rejects.toMatchObject({ context: { statusCode: 503 } });
    expect(mockState.putJson).toHaveBeenCalledTimes(HOMESERVER_WRITE_MAX_ATTEMPTS);
  });

  it.each([
    ['a path collision', 409, conflictError('File/folder path collision')],
    ['an unknown lock token', 409, conflictError('No lock with this token on this path')],
    ['a bare 409', 409, requestError(409)],
    ['a 412', 412, requestError(412)],
    ['a 423', 423, requestError(423)],
  ])('does not retry %s', async (_name, statusCode, error) => {
    mockState.putJson.mockRejectedValue(error);

    await expect(
      HomeserverService.request({ method: HttpMethod.PUT, url: PROFILE_URL, bodyJson: { name: 'Alice' } }),
    ).rejects.toMatchObject({ context: { statusCode } });
    expect(mockState.putJson).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it.each([
    ['the publish conflict', 409, () => conflictError(HOMESERVER_PUBLISH_CONFLICT_MESSAGE)],
    ['a 429', 429, () => requestError(429)],
    ['a 503', 503, () => requestError(503)],
  ])('makes one attempt for a fenced write and surfaces %s for its re-read loop', async (name, statusCode, error) => {
    mockState.putJson.mockRejectedValue(error());
    mockState.putBytes.mockRejectedValue(error());
    const fence = HomeserverService.createWriteFence();

    const thrown = await HomeserverService.request({
      method: HttpMethod.PUT,
      url: PROFILE_URL,
      bodyJson: { name: 'Alice' },
      fence,
    }).catch((caught: unknown) => caught);
    await expect(HomeserverService.putBlob({ url: BLOB_URL, blob: new Uint8Array([1]), fence })).rejects.toThrow();

    expect(mockState.putJson).toHaveBeenCalledOnce();
    expect(mockState.putBytes).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
    expect(thrown).toMatchObject({ context: { statusCode } });
    expect(isHomeserverPublishConflict(thrown)).toBe(name === 'the publish conflict');
  });

  it('retries an owned DELETE on 503 and makes one attempt when asked to', async () => {
    mockState.delete.mockRejectedValueOnce(requestError(503)).mockResolvedValueOnce(undefined);
    await HomeserverService.delete(PROFILE_URL);
    expect(mockState.delete).toHaveBeenCalledTimes(2);

    mockState.delete.mockReset().mockRejectedValue(requestError(503));
    await expect(HomeserverService.delete(PROFILE_URL, { singleAttempt: true })).rejects.toThrow();
    expect(mockState.delete).toHaveBeenCalledOnce();
  });

  it('deleteIdempotent keeps its three attempts instead of multiplying them with the write policy', async () => {
    vi.useFakeTimers();
    try {
      mockState.delete.mockRejectedValue(requestError(503));
      const rejection = expect(HomeserverService.deleteIdempotent(PROFILE_URL)).rejects.toThrow();
      await vi.runAllTimersAsync();
      await rejection;
      expect(mockState.delete).toHaveBeenCalledTimes(3);
      expect(sleep).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries an owned blob PUT with the original bytes even if the caller mutates them', async () => {
    const blob = new Uint8Array([1, 2, 3]);
    mockState.putBytes
      .mockImplementationOnce(async () => {
        blob[0] = 9;
        throw conflictError(HOMESERVER_PUBLISH_CONFLICT_MESSAGE);
      })
      .mockResolvedValueOnce(undefined);

    await HomeserverService.putBlob({ url: BLOB_URL, blob });

    expect(mockState.putBytes).toHaveBeenCalledTimes(2);
    expect(Array.from(mockState.putBytes.mock.calls[1][1] as Uint8Array)).toEqual([1, 2, 3]);
  });

  it('does not retry a blob path collision', async () => {
    mockState.putBytes.mockRejectedValue(conflictError('File/folder path collision'));

    await expect(HomeserverService.putBlob({ url: BLOB_URL, blob: new Uint8Array([1]) })).rejects.toMatchObject({
      context: { statusCode: 409 },
    });
    expect(mockState.putBytes).toHaveBeenCalledOnce();
  });

  it('retries a non-owned PUT on a 429 response with Retry-After and on the publish conflict body', async () => {
    useAuthStore.setState({ session: null });
    mockState.fetch
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'retry-after': '2' } }))
      .mockResolvedValueOnce(new Response(HOMESERVER_PUBLISH_CONFLICT_MESSAGE, { status: 409 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await HomeserverService.request({ method: HttpMethod.PUT, url: PUBLIC_URL, bodyJson: { a: 1 } });

    expect(mockState.fetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[2_000], [250]]);
    expect(mockState.fetch.mock.calls[2][1]).toMatchObject({ method: HttpMethod.PUT, body: '{"a":1}' });
  });

  it('does not retry a non-owned PUT refused with a path collision', async () => {
    useAuthStore.setState({ session: null });
    mockState.fetch.mockResolvedValue(new Response('File/folder path collision', { status: 409 }));

    await expect(
      HomeserverService.request({ method: HttpMethod.PUT, url: PUBLIC_URL, bodyJson: { a: 1 } }),
    ).rejects.toMatchObject({ context: { statusCode: 409 } });
    expect(mockState.fetch).toHaveBeenCalledOnce();
  });

  describe('writes to one file run in order', () => {
    const OTHER_URL = `pubky://${USER}/pub/pubky.app/tags/OTHER`;

    it('starts a second write to the same path only after the first settled, retries included', async () => {
      let releaseRetry!: () => void;
      sleep.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseRetry = resolve;
          }),
      );
      mockState.putJson.mockRejectedValueOnce(requestError(503));

      const first = HomeserverService.request({ method: HttpMethod.PUT, url: PROFILE_URL, bodyJson: { v: 1 } });
      await vi.waitFor(() => expect(releaseRetry).toBeTypeOf('function'));
      const second = HomeserverService.request({ method: HttpMethod.DELETE, url: PROFILE_URL });
      const other = HomeserverService.request({ method: HttpMethod.PUT, url: OTHER_URL, bodyJson: { v: 3 } });
      await other;
      expect(mockState.delete).not.toHaveBeenCalled();
      releaseRetry();
      await Promise.all([first, second]);

      expect(mockState.putJson.mock.calls.map(([path]) => path)).toEqual([
        PROFILE_PATH,
        '/pub/pubky.app/tags/OTHER',
        PROFILE_PATH,
      ]);
      expect(mockState.delete.mock.invocationCallOrder[0]).toBeGreaterThan(
        mockState.putJson.mock.invocationCallOrder[2],
      );
    });

    it('starts a write with nothing ahead of it in the caller tick', () => {
      void HomeserverService.request({ method: HttpMethod.PUT, url: PROFILE_URL, bodyJson: { v: 1 } });
      expect(mockState.putJson).toHaveBeenCalledOnce();
    });

    it('sends nothing for a queued write once logout began while it waited', async () => {
      let releaseRetry!: () => void;
      sleep.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseRetry = resolve;
          }),
      );
      mockState.putJson.mockRejectedValueOnce(requestError(503));

      const first = HomeserverService.request({ method: HttpMethod.PUT, url: PROFILE_URL, bodyJson: { v: 1 } });
      await vi.waitFor(() => expect(releaseRetry).toBeTypeOf('function'));
      const queued = HomeserverService.putBlob({ url: PROFILE_URL, blob: new Uint8Array([1]) });
      useAuthStore.setState({ isLoggingOut: true });
      releaseRetry();

      await expect(first).rejects.toMatchObject({ code: AuthErrorCode.SESSION_EXPIRED });
      await expect(queued).rejects.toMatchObject({ code: AuthErrorCode.SESSION_EXPIRED });
      expect(mockState.putJson).toHaveBeenCalledOnce();
      expect(mockState.putBytes).not.toHaveBeenCalled();
    });

    it('lets a write after a failed one run', async () => {
      mockState.putJson.mockRejectedValueOnce(requestError(400));
      const first = HomeserverService.request({ method: HttpMethod.PUT, url: PROFILE_URL, bodyJson: { v: 1 } });
      const second = HomeserverService.request({ method: HttpMethod.PUT, url: PROFILE_URL, bodyJson: { v: 2 } });

      await expect(first).rejects.toMatchObject({ context: { statusCode: 400 } });
      await expect(second).resolves.toBeUndefined();
      expect(mockState.putJson).toHaveBeenLastCalledWith(PROFILE_PATH, { v: 2 });
    });
  });

  it('checks a guardFirstPass fence from its first pass', () => {
    const fence = HomeserverService.createWriteFence({ guardFirstPass: true });
    fence.enter(0);
    useAuthStore.setState({ isLoggingOut: true });

    expect(() => fence.enter(0)).toThrow(expect.objectContaining({ code: AuthErrorCode.SESSION_EXPIRED }));
    expect(() => fence.assertCurrent()).toThrow(expect.objectContaining({ code: AuthErrorCode.SESSION_EXPIRED }));
    expect(() => HomeserverService.createWriteFence().enter(0)).not.toThrow();
  });

  describe('a retry never outlives the session that started it', () => {
    it.each([
      ['logout begins', () => useAuthStore.setState({ isLoggingOut: true })],
      ['the session is replaced', () => useAuthStore.setState({ session: session() })],
      ['the account generation changes', () => useAuthStore.setState({ generation: 'generation-2' })],
    ])('stops before the retry when %s', async (_name, change) => {
      mockState.putJson.mockRejectedValueOnce(requestError(503)).mockResolvedValueOnce(undefined);
      sleep.mockImplementationOnce(async () => {
        change();
      });

      await expect(
        HomeserverService.request({ method: HttpMethod.PUT, url: PROFILE_URL, bodyJson: { name: 'Alice' } }),
      ).rejects.toMatchObject({ code: AuthErrorCode.SESSION_EXPIRED });
      expect(mockState.putJson).toHaveBeenCalledOnce();
    });

    it('stops a blob retry when logout begins', async () => {
      mockState.putBytes.mockRejectedValueOnce(requestError(500)).mockResolvedValueOnce(undefined);
      sleep.mockImplementationOnce(async () => {
        useAuthStore.setState({ isLoggingOut: true });
      });

      await expect(HomeserverService.putBlob({ url: BLOB_URL, blob: new Uint8Array([1]) })).rejects.toMatchObject({
        code: AuthErrorCode.SESSION_EXPIRED,
      });
      expect(mockState.putBytes).toHaveBeenCalledOnce();
    });

    it('stops a read-check-write before its next pass when logout begins during the backoff', async () => {
      mockState.putJson.mockRejectedValue(conflictError(HOMESERVER_PUBLISH_CONFLICT_MESSAGE));
      sleep.mockImplementationOnce(async () => {
        useAuthStore.setState({ isLoggingOut: true });
      });
      const read = vi.fn(async () => ({ name: 'Alice' }));
      const fence = HomeserverService.createWriteFence();

      await expect(
        retryHomeserverWriteAfterReread(fence, async () => {
          const bodyJson = await read();
          await HomeserverService.request({
            method: HttpMethod.PUT,
            url: PROFILE_URL,
            bodyJson,
            fence,
          });
        }),
      ).rejects.toMatchObject({ code: AuthErrorCode.SESSION_EXPIRED });
      expect(read).toHaveBeenCalledOnce();
      expect(mockState.putJson).toHaveBeenCalledOnce();
    });

    it.each([
      ['logout begins', () => useAuthStore.setState({ isLoggingOut: true })],
      ['the session is replaced', () => useAuthStore.setState({ session: session() })],
      ['the account generation changes', () => useAuthStore.setState({ generation: 'generation-2' })],
    ])('does not start the write of a later pass when %s during its read', async (_name, change) => {
      const fence = HomeserverService.createWriteFence();
      fence.enter(1);
      change();

      await expect(
        HomeserverService.request({ method: HttpMethod.PUT, url: PROFILE_URL, bodyJson: { a: 1 }, fence }),
      ).rejects.toMatchObject({ code: AuthErrorCode.SESSION_EXPIRED });
      await expect(
        HomeserverService.putBlob({ url: BLOB_URL, blob: new Uint8Array([1]), fence }),
      ).rejects.toMatchObject({ code: AuthErrorCode.SESSION_EXPIRED });
      expect(mockState.putJson).not.toHaveBeenCalled();
      expect(mockState.putBytes).not.toHaveBeenCalled();
    });

    it('leaves the first pass of a read-check-write as any write, even while logout is in progress', async () => {
      const fence = HomeserverService.createWriteFence();
      useAuthStore.setState({ isLoggingOut: true });
      fence.enter(0);

      await HomeserverService.request({ method: HttpMethod.PUT, url: PROFILE_URL, bodyJson: { a: 1 }, fence });

      expect(mockState.putJson).toHaveBeenCalledOnce();
    });

    it('still makes the first attempt while logout is in progress, as before retries existed', async () => {
      useAuthStore.setState({ isLoggingOut: true });

      await HomeserverService.request({ method: HttpMethod.PUT, url: PROFILE_URL, bodyJson: { name: 'Alice' } });

      expect(mockState.putJson).toHaveBeenCalledOnce();
    });
  });
});
