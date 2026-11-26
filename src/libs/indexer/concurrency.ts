import { IndexerAbortedError, RateLimitedError, RequestTimeoutError } from './indexer.errors';

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

/** Foreground calls answer what someone waits for; background calls keep what is shown current and complete. */
export type Priority = 'foreground' | 'background';

const PRIORITIES: readonly Priority[] = ['foreground', 'background'];

export interface RequestGate {
  /**
   * Runs `call` once its key has a free slot and its route is open, or rejects with `IndexerAbortedError` if `signal`
   * fires while it waits. A call that started runs to its end: the gate never interrupts one for another.
   */
  run<T>(key: string, priority: Priority, call: () => Promise<T>, signal?: AbortSignal, route?: string): Promise<T>;
}

/** How the gate tells time and waits, injected so tests control both. */
export interface GateClock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

/** The pace of a route once a server refused it: the next start allowed, the gap between starts, the refusal. */
interface Pace {
  next: number;
  spacing: number;
  refusedAt: number;
}

/** The first gap between starts after a refusal, doubled by each refusal of a call started after the last one. */
const PACE_FIRST_MS = 1000;
const PACE_MAX_MS = 8 * 1000;
/** A full token bucket of any per-minute quota refills within a minute: past it without a refusal, the pace ends. */
const PACE_CALM_MS = 60 * 1000;

/**
 * Admits at most `limit` calls per key at once, in arrival order within a priority and foreground first. A
 * background call starts only while no foreground call is ready to, and leaves one slot free when there are two or
 * more, so a foreground call arriving while the others run starts at once.
 *
 * A call rejected with `RateLimitedError` closes its key's route for every call of it, until the wait the server
 * named or else the route's gap, and from then on its calls start one per gap: a server's token bucket refills one
 * token at a time, and a refusal says it is empty. Each refusal of a call that started after the last one doubles the
 * gap, up to its max; calls that were in flight together count once. A minute without a refusal ends the pace.
 */
export function createRequestGate(limit: number, clock: GateClock = { now: Date.now, sleep }): RequestGate {
  interface Waiting {
    route: string;
    start: () => void;
  }
  interface Lane {
    active: number;
    waiting: Record<Priority, Waiting[]>;
    paces: Map<string, Pace>;
    /** When a drain is scheduled for a paced call, if one is. */
    wakeAt: number | null;
  }
  const backgroundLimit = Math.max(1, limit - 1);
  const lanes = new Map<string, Lane>();
  const laneOf = (key: string): Lane => {
    const known = lanes.get(key);
    if (known !== undefined) return known;
    const lane: Lane = { active: 0, waiting: { foreground: [], background: [] }, paces: new Map(), wakeAt: null };
    lanes.set(key, lane);
    return lane;
  };
  /** When the route may start a call next; the pace ends once calm. */
  const dueAt = (lane: Lane, route: string, now: number): number => {
    const pace = lane.paces.get(route);
    if (pace === undefined) return now;
    if (now - pace.refusedAt >= PACE_CALM_MS) {
      lane.paces.delete(route);
      return now;
    }
    return pace.next;
  };
  const drain = (lane: Lane) => {
    const now = clock.now();
    let wake: number | null = null;
    for (const rank of PRIORITIES) {
      const queue = lane.waiting[rank];
      const cap = rank === 'foreground' ? limit : backgroundLimit;
      let ready = false;
      for (let i = 0; i < queue.length;) {
        const due = dueAt(lane, queue[i].route, now);
        if (due > now) {
          wake = wake === null || due < wake ? due : wake;
          i += 1;
          continue;
        }
        if (lane.active >= cap) {
          ready = true;
          break;
        }
        const [entry] = queue.splice(i, 1);
        const pace = lane.paces.get(entry.route);
        if (pace !== undefined) pace.next = now + pace.spacing;
        entry.start();
      }
      if (ready) break;
    }
    if (wake !== null && (lane.wakeAt === null || wake < lane.wakeAt)) {
      const at = wake;
      lane.wakeAt = at;
      void clock.sleep(at - now).then(() => {
        if (lane.wakeAt === at) lane.wakeAt = null;
        drain(lane);
      });
    }
  };
  const refuse = (lane: Lane, route: string, startedAt: number, retryAfterMs: number | undefined) => {
    const now = clock.now();
    const known = lane.paces.get(route);
    // In flight before the last refusal: that one already said the bucket was empty.
    if (known !== undefined && startedAt <= known.refusedAt && now - known.refusedAt < PACE_CALM_MS) return;
    const spacing = known === undefined ? PACE_FIRST_MS : Math.min(known.spacing * 2, PACE_MAX_MS);
    lane.paces.set(route, { spacing, refusedAt: now, next: now + (retryAfterMs ?? spacing) });
  };
  return {
    run<T>(key: string, priority: Priority, call: () => Promise<T>, signal?: AbortSignal, route = ''): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        if (signal?.aborted) {
          reject(new IndexerAbortedError({ cause: signal.reason }));
          return;
        }
        const lane = laneOf(key);
        const waiting = lane.waiting[priority];
        const onAbort = () => {
          waiting.splice(waiting.indexOf(entry), 1);
          reject(new IndexerAbortedError({ cause: signal?.reason }));
        };
        const entry: Waiting = { route, start };
        function start() {
          signal?.removeEventListener('abort', onAbort);
          lane.active += 1;
          const startedAt = clock.now();
          let pending: Promise<T>;
          try {
            pending = call();
          } catch (error) {
            pending = Promise.reject(error);
          }
          void pending
            .then(resolve, (error: unknown) => {
              if (error instanceof RateLimitedError) refuse(lane, route, startedAt, error.retryAfterMs);
              reject(error);
            })
            .finally(() => {
              lane.active -= 1;
              drain(lane);
            });
        }
        waiting.push(entry);
        signal?.addEventListener('abort', onAbort, { once: true });
        drain(lane);
      });
    },
  };
}

export function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
