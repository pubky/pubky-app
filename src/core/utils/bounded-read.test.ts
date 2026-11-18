import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOMESERVER_SYNC_READ_TIMEOUT_MS } from '@/config/network';
import { AppError } from '@/libs/error/error';
import { ServerErrorCode, TimeoutErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { awaitBounded, whenAbandonedReadSettles } from './bounded-read';

const MS = 1_000;

describe('awaitBounded', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns what a read that answers in time returns, and leaves no timer behind', async () => {
    const read = Promise.withResolvers<string[]>();

    const bounded = awaitBounded(read.promise, { ms: MS, operation: 'fetchMutedUsers' });
    await vi.advanceTimersByTimeAsync(MS - 1);
    read.resolve(['listed']);

    await expect(bounded).resolves.toEqual(['listed']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rethrows the failure of a read that fails in time as it is, and leaves no timer behind', async () => {
    const failure = new AppError({
      category: ErrorCategory.Server,
      code: ServerErrorCode.INTERNAL_ERROR,
      message: 'Failed to GET homeserver: 500',
      service: ErrorService.Homeserver,
      operation: 'list',
    });

    await expect(awaitBounded(Promise.reject(failure), { ms: MS, operation: 'fetchBookmarks' })).rejects.toBe(failure);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects with REQUEST_TIMEOUT once the bound has passed, not before, and what the read answers later changes nothing', async () => {
    const read = Promise.withResolvers<string[]>();
    let settled: unknown = null;
    const bounded = awaitBounded(read.promise, {
      ms: MS,
      operation: 'fetchFeeds',
      context: { baseDirectory: 'pubky://owner/priv/social/v1/feeds/' },
    }).then(
      (value) => (settled = { value }),
      (error: unknown) => (settled = { error }),
    );

    await vi.advanceTimersByTimeAsync(MS - 1);
    expect(settled).toBeNull();

    await vi.advanceTimersByTimeAsync(1);
    await bounded;
    expect(settled).toEqual({
      error: expect.objectContaining({
        category: ErrorCategory.Timeout,
        code: TimeoutErrorCode.REQUEST_TIMEOUT,
        service: ErrorService.Homeserver,
        operation: 'fetchFeeds',
        context: { baseDirectory: 'pubky://owner/priv/social/v1/feeds/', timeoutMs: MS },
      }),
    });
    expect((settled as { error: unknown }).error).toBeInstanceOf(AppError);
    expect(vi.getTimerCount()).toBe(0);

    // The abandoned read answers now: the wait has ended, so the answer reaches nobody.
    read.resolve(['late']);
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toEqual({ error: expect.any(AppError) });
  });

  it('waits HOMESERVER_SYNC_READ_TIMEOUT_MS unless told otherwise', async () => {
    let settled = false;
    const bounded = awaitBounded(new Promise<never>(() => {}), { operation: 'fetchMutedUsers' }).catch(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(HOMESERVER_SYNC_READ_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await bounded;
    expect(settled).toBe(true);
  });

  // Vitest fails the run on an unhandled rejection, so this pins that the abandoned read's late failure is held.
  it('lets a read that fails after the bound has passed fail nowhere', async () => {
    const read = Promise.withResolvers<string[]>();
    const bounded = awaitBounded(read.promise, { ms: MS, operation: 'fetchMutedUsers' }).catch(
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(MS);
    expect(await bounded).toMatchObject({ code: TimeoutErrorCode.REQUEST_TIMEOUT });

    read.reject(new Error('the homeserver answered 500, late'));
    await vi.advanceTimersByTimeAsync(0);

    expect(await bounded).toMatchObject({ code: TimeoutErrorCode.REQUEST_TIMEOUT });
  });
});

describe('whenAbandonedReadSettles', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const abandon = async (read: Promise<string[]>) => {
    const bounded = awaitBounded(read, { ms: MS, operation: 'fetchMutedUsers' }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(MS);
    return await bounded;
  };

  it.each([
    ['answers', (read: PromiseWithResolvers<string[]>) => read.resolve(['late'])],
    ['fails', (read: PromiseWithResolvers<string[]>) => read.reject(new Error('the homeserver answered 500, late'))],
  ])('resolves for the timeout awaitBounded ended its wait with once the abandoned read %s', async (_name, settle) => {
    const read = Promise.withResolvers<string[]>();
    const settled = whenAbandonedReadSettles(await abandon(read.promise));
    expect(settled).toBeInstanceOf(Promise);
    let done = false;
    void settled?.then(() => (done = true));

    await vi.advanceTimersByTimeAsync(MS * 10);
    expect(done).toBe(false);

    settle(read);
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
    await expect(settled).resolves.toBeUndefined();
  });

  it('is undefined for a REQUEST_TIMEOUT the read itself settled with, and for any other value', async () => {
    const answered408 = new AppError({
      category: ErrorCategory.Timeout,
      code: TimeoutErrorCode.REQUEST_TIMEOUT,
      message: 'Request timeout',
      service: ErrorService.Homeserver,
      operation: 'request',
      context: { statusCode: 408 },
    });
    const rethrown = await awaitBounded(Promise.reject(answered408), { ms: MS, operation: 'fetchMutedUsers' }).catch(
      (error: unknown) => error,
    );

    expect(rethrown).toBe(answered408);
    expect(whenAbandonedReadSettles(rethrown)).toBeUndefined();
    expect(whenAbandonedReadSettles(new Error('Homeserver read timed out'))).toBeUndefined();
    expect(whenAbandonedReadSettles(undefined)).toBeUndefined();
    expect(whenAbandonedReadSettles('REQUEST_TIMEOUT')).toBeUndefined();
  });
});
