import { IndexerAbortedError, RequestTimeoutError } from './indexer.errors';

/** Runs `callback` after `ms` and returns the function that cancels it. */
export type Schedule = (callback: () => void, ms: number) => () => void;

export const timerSchedule: Schedule = (callback, ms) => {
  const timer = setTimeout(callback, ms);
  return () => clearTimeout(timer);
};

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new IndexerAbortedError({ cause: signal.reason });
}

/** Resolves after `ms`, or rejects with `IndexerAbortedError` as soon as `signal` fires. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new IndexerAbortedError({ cause: signal.reason }));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new IndexerAbortedError({ cause: signal?.reason }));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Settles as `promise` does, or rejects with `IndexerAbortedError` as soon as `signal` fires. */
export function untilAborted<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal === undefined) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new IndexerAbortedError({ cause: signal.reason }));
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

/**
 * Runs `call` with a signal that aborts after `ms`, rejecting with `RequestTimeoutError`, or when `signal` fires,
 * rejecting with `IndexerAbortedError`. Either settles at once, so a call that ignores its signal and never returns
 * holds up nobody; its late outcome is dropped.
 */
export function withDeadline<T>(
  call: (signal: AbortSignal) => Promise<T>,
  ms: number,
  schedule: Schedule,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new IndexerAbortedError({ cause: signal.reason }));
      return;
    }
    const controller = new AbortController();
    let cancelTimer: () => void = () => undefined;
    function cleanUp() {
      cancelTimer();
      signal?.removeEventListener('abort', onAbort);
    }
    function end(error: Error) {
      cleanUp();
      controller.abort(error);
      reject(error);
    }
    function onAbort() {
      end(new IndexerAbortedError({ cause: signal?.reason }));
    }
    cancelTimer = schedule(() => end(new RequestTimeoutError(ms)), ms);
    signal?.addEventListener('abort', onAbort, { once: true });
    let pending: Promise<T>;
    try {
      pending = call(controller.signal);
    } catch (error) {
      pending = Promise.reject(error);
    }
    pending.then(
      (value) => {
        cleanUp();
        resolve(value);
      },
      (error: unknown) => {
        cleanUp();
        reject(error);
      },
    );
  });
}

/**
 * Maps `items` with at most `limit` calls in flight, results in input order. After the first rejection no new
 * call starts and the whole map rejects with it.
 */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const i = next;
      next += 1;
      try {
        results[i] = await fn(items[i]);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

export function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
