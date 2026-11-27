import type { FakeNetwork } from './fakeNetwork';
import type { Coordination, CoordinationMessage, Schedule } from './runtime.types';
import type { IndexerTransport } from './transport.types';

// Test-only: fake time, a fake set of tabs, and a transport that shows whether two crawls ever overlap.

/** Lets every pending promise chain finish: the fakes answer without real timers, so a few turns drain them. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 3; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

interface Timer {
  at: number;
  id: number;
  callback: () => void;
}

export function fakeTime(start: number) {
  const clock = { now: start };
  let timers: Timer[] = [];
  let nextId = 0;

  const schedule: Schedule = (callback, ms) => {
    const id = nextId;
    nextId += 1;
    timers.push({ at: clock.now + ms, id, callback });
    return () => {
      timers = timers.filter((timer) => timer.id !== id);
    };
  };

  const nextDue = (end: number): Timer | undefined =>
    timers.filter((timer) => timer.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];

  /** Moves the clock and fires the timers due on the way, without letting any promise run in between. */
  function jump(ms: number): void {
    const end = clock.now + ms;
    for (let due = nextDue(end); due !== undefined; due = nextDue(end)) {
      const fired = due;
      timers = timers.filter((timer) => timer !== fired);
      clock.now = fired.at;
      fired.callback();
    }
    clock.now = end;
  }

  /** Moves the clock, firing each due timer and letting the work it starts finish before the next. */
  async function advance(ms: number): Promise<void> {
    const end = clock.now + ms;
    await settle();
    for (let due = nextDue(end); due !== undefined; due = nextDue(end)) {
      const fired = due;
      timers = timers.filter((timer) => timer !== fired);
      clock.now = fired.at;
      fired.callback();
      await settle();
    }
    clock.now = end;
  }

  return { clock, schedule, jump, advance, pending: () => timers.length };
}

/** Tabs sharing locks and a channel, each joining with its own `Coordination`. */
export function createTabs() {
  const locks = new Map<string, { held: boolean; waiters: Array<() => void> }>();
  const tabs = new Set<Set<(message: CoordinationMessage) => void>>();
  return {
    join(): Coordination {
      const own = new Set<(message: CoordinationMessage) => void>();
      tabs.add(own);
      return {
        runExclusive(name, task) {
          const lock = locks.get(name) ?? { held: false, waiters: [] };
          locks.set(name, lock);
          return new Promise<void>((resolve, reject) => {
            const run = () => {
              lock.held = true;
              void task()
                .then(resolve, reject)
                .finally(() => {
                  lock.held = false;
                  lock.waiters.shift()?.();
                });
            };
            if (lock.held) lock.waiters.push(run);
            else run();
          });
        },
        post(message) {
          const copy = structuredClone(message);
          for (const listeners of tabs) {
            if (listeners === own) continue;
            queueMicrotask(() => {
              for (const listener of listeners) listener(copy);
            });
          }
        },
        subscribe(listener) {
          own.add(listener);
          return () => {
            own.delete(listener);
          };
        },
      };
    },
  };
}

export interface TrackedRead {
  users: string[];
  paths: string[];
  reverse: boolean;
}

/**
 * The network behind a transport that logs stream reads and counts the reads in flight. Each read yields a few
 * times first, so a second crawl running at once would get its own read in meanwhile.
 */
export function tracked(network: FakeNetwork) {
  const state = { reads: [] as TrackedRead[], inFlight: 0, peak: 0, failures: 0 };
  const transport: IndexerTransport = {
    resolveHomeserver: (user) => network.resolveHomeserver(user),
    readEvents: async (request) => {
      state.reads.push({
        users: request.users.map(({ user }) => user),
        paths: [...request.paths],
        reverse: request.reverse,
      });
      state.inFlight += 1;
      state.peak = Math.max(state.peak, state.inFlight);
      try {
        for (let i = 0; i < 5; i += 1) await Promise.resolve();
        if (state.failures > 0) {
          state.failures -= 1;
          throw new Error('transport broke');
        }
        return await network.readEvents(request);
      } finally {
        state.inFlight -= 1;
      }
    },
    getPublic: (request) => network.getPublic(request),
    indexFiles: network.indexFiles,
  };
  return { transport, state };
}
