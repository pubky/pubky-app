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

/** Resolves after `ms` on `schedule`, or rejects with `IndexerAbortedError` as soon as `signal` fires. */
export function sleep(ms: number, signal?: AbortSignal, schedule: Schedule = timerSchedule): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new IndexerAbortedError({ cause: signal.reason }));
      return;
    }
    const onAbort = () => {
      cancel();
      reject(new IndexerAbortedError({ cause: signal?.reason }));
    };
    const cancel = schedule(() => {
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

/** Foreground calls answer what someone waits for; background calls only fill in what is shown already. */
export type Priority = 'foreground' | 'background';

export interface RequestGate {
  /**
   * Runs `call` once its key has a free slot, or rejects with `IndexerAbortedError` if `signal` fires while it waits.
   * A call that started runs to its end: the gate never interrupts one for another.
   */
  run<T>(key: string, priority: Priority, call: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}

/**
 * Admits at most `limit` calls per key at once, in arrival order within a priority and foreground first. A
 * background call starts only while no foreground call waits, and leaves one slot free when there are two or more,
 * so a foreground call arriving while background ones run starts at once.
 */
export function createRequestGate(limit: number): RequestGate {
  interface Lane {
    active: number;
    foreground: Array<() => void>;
    background: Array<() => void>;
  }
  const backgroundLimit = Math.max(1, limit - 1);
  const lanes = new Map<string, Lane>();
  const laneOf = (key: string): Lane => {
    const known = lanes.get(key);
    if (known !== undefined) return known;
    const lane: Lane = { active: 0, foreground: [], background: [] };
    lanes.set(key, lane);
    return lane;
  };
  return {
    run<T>(key: string, priority: Priority, call: () => Promise<T>, signal?: AbortSignal): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        if (signal?.aborted) {
          reject(new IndexerAbortedError({ cause: signal.reason }));
          return;
        }
        const lane = laneOf(key);
        const waiting = priority === 'foreground' ? lane.foreground : lane.background;
        const drain = () => {
          while (lane.foreground.length > 0 && lane.active < limit) lane.foreground.shift()?.();
          while (lane.foreground.length === 0 && lane.background.length > 0 && lane.active < backgroundLimit) {
            lane.background.shift()?.();
          }
        };
        const onAbort = () => {
          waiting.splice(waiting.indexOf(start), 1);
          reject(new IndexerAbortedError({ cause: signal?.reason }));
        };
        function start() {
          signal?.removeEventListener('abort', onAbort);
          lane.active += 1;
          let pending: Promise<T>;
          try {
            pending = call();
          } catch (error) {
            pending = Promise.reject(error);
          }
          void pending.then(resolve, reject).finally(() => {
            lane.active -= 1;
            drain();
          });
        }
        waiting.push(start);
        signal?.addEventListener('abort', onAbort, { once: true });
        drain();
      });
    },
  };
}

export function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
