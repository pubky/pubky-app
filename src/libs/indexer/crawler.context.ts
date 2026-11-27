import type { Priority } from './concurrency';
import { CURSOR_ZERO } from './cursor';
import type { Epoch } from './epoch';
import type { Coverage, Cursor } from './indexer.types';
import type { HighWater, ReadAt } from './store.types';
import type { TimeSample } from './timeTable';
import type { AuthoredStreamEvent } from './transport.types';

// What the crawler's parts share: the state of one operation and the cursor helpers they read coverage with.

export const ONE = BigInt(1);

/** What one operation learned about homeservers, so each is checked once per operation. */
export interface OperationContext {
  signal?: AbortSignal;
  /** Where its requests queue at each homeserver. */
  priority: Priority;
  /** Each homeserver's restore check, shared by the reads of the operation that run together. */
  checked: Map<string, Promise<boolean>>;
  /** The epoch of each homeserver its reads are made under, stated by every commit of what they read. */
  epochs: Map<string, Epoch>;
  /** The newest event read from each homeserver. */
  highWater: Map<string, HighWater>;
  /** Each homeserver's stored clock with every dated write read since, the clock its window reads go by. */
  clocks: Map<string, TimeSample[]>;
  /** The dated writes read from each homeserver that no commit has stored yet. */
  unsaved: Map<string, TimeSample[]>;
  /** Homeservers failed or backing off, skipped for the rest of the operation. */
  failed: Set<string>;
}

export const contextOf = (signal?: AbortSignal, priority: Priority = 'foreground'): OperationContext => ({
  signal,
  priority,
  checked: new Map(),
  epochs: new Map(),
  highWater: new Map(),
  clocks: new Map(),
  unsaved: new Map(),
  failed: new Set(),
});

export type Counter = 'lookups' | 'streamRequests' | 'bodyRequests' | 'events';

export const headOf = (coverage: Coverage): Cursor | null =>
  coverage.length === 0 ? null : coverage[coverage.length - 1].head;

export const highestOf = (events: readonly AuthoredStreamEvent[]): Cursor =>
  events.reduce((high, event) => (event.cursor > high ? event.cursor : high), CURSOR_ZERO);

export const lowestOf = (events: readonly AuthoredStreamEvent[]): Cursor | null =>
  events.reduce<Cursor | null>((low, event) => (low === null || event.cursor < low ? event.cursor : low), null);

/** The tail of the top contiguous range, the only trusted one. */
export const topTailOf = (coverage: Coverage): Cursor | null =>
  coverage.length === 0 ? null : coverage[coverage.length - 1].tail;

export const fromHead = (head: Cursor | null) => head ?? CURSOR_ZERO;

/** What a commit of the operation's reads of the homeserver states: their epoch. */
export const readAtOf = (ctx: OperationContext, homeserver: string): { readAt?: ReadAt[] } => {
  const epoch = ctx.epochs.get(homeserver);
  return epoch === undefined ? {} : { readAt: [{ homeserver, epoch }] };
};

/**
 * What a commit of runs read from the homeserver states: their epoch, the newest event read, the dated writes read
 * since the last such commit, a success.
 */
export const readStateOf = (ctx: OperationContext, homeserver: string) => {
  const highWater = ctx.highWater.get(homeserver);
  const clock = ctx.unsaved.get(homeserver) ?? [];
  ctx.unsaved.delete(homeserver);
  return {
    ...readAtOf(ctx, homeserver),
    homeserverStates: [
      {
        homeserver,
        patch: {
          ...(highWater === undefined ? {} : { highWater }),
          ...(clock.length === 0 ? {} : { clock }),
          failure: null,
        },
      },
    ],
  };
};
