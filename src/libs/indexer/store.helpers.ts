import { addRange } from './coverage';
import { isValidCursor } from './cursor';
import { InvalidIndexInputError } from './indexer.errors';
import type { Coverage, Cursor, Entry, MergedRuns, Range, RecordEntry, Run } from './indexer.types';
import { replaces, sameEvent } from './merge';
import { assertValidRun, comparePaths } from './run';
import {
  EMPTY_HOMESERVER_STATE,
  type HomeserverPatch,
  type HomeserverState,
  type ReadAt,
  type ScopeKey,
  type StoreBatch,
} from './store.types';

// Rules every `IndexStore` applies the same way, so the stores differ only in where they keep the data.

export const scopeId = ({ author, homeserver, group }: ScopeKey) => JSON.stringify([author, homeserver, group]);

export const scopeOf = ({ author, homeserver, group }: ScopeKey): ScopeKey => ({ author, homeserver, group });

/** Throws unless every run and cutoff of the batch is valid. */
export function assertValidBatch<D>(batch: StoreBatch<D>): void {
  for (const { cutoff } of batch.evictions ?? []) {
    if (!isValidCursor(cutoff)) throw new InvalidIndexInputError(`cutoff ${cutoff} is out of range`);
  }
  for (const run of batch.applyRuns ?? []) assertValidRun(run);
  for (const { cursor } of batch.recordData ?? []) {
    if (!isValidCursor(cursor)) throw new InvalidIndexInputError(`record cursor ${cursor} is out of range`);
  }
}

/** The stored entry with `data` when it is the record at `cursor`, else `null`: it was replaced since. */
export function withData<D>(stored: Entry<D> | undefined, cursor: Cursor, data: D): RecordEntry<D> | null {
  return stored?.kind === 'record' && stored.cursor === cursor ? { ...stored, data } : null;
}

export interface AppliedRun<D> {
  /** The run's entries that beat the stored entry of their path, the only rows to write. */
  changed: Entry<D>[];
  coverage: Coverage;
}

/**
 * What merging `run` into its scope changes, given the scope's stored entry of a path and its coverage. Per path
 * the higher cursor wins. At an equal cursor the stored entry stays, unless it has no data and the run's copy has:
 * a run read from a saved index, which holds no data, never erases a stored body. `mergeRuns` picks the same way.
 */
export function applyRun<D>(
  run: Run<D>,
  stored: (path: string) => Entry<D> | undefined,
  coverage: readonly Range[],
): AppliedRun<D> {
  const changed: Entry<D>[] = [];
  for (const entry of run.entries) {
    const current = stored(entry.path);
    if (current !== undefined && entry.cursor === current.cursor && !sameEvent(current, entry)) {
      throw new InvalidIndexInputError(`runs disagree about ${entry.path} at cursor ${entry.cursor}`);
    }
    if (replaces(current, entry)) changed.push(entry);
  }
  return { changed, coverage: addRange(coverage, run) };
}

/** A stored scope in the shape and path order `mergeRuns` gives. */
export function scopeState<D>(entries: Iterable<Entry<D>>, coverage: Coverage): MergedRuns<D> {
  const trusted = coverage.length === 0 ? null : { ...coverage[coverage.length - 1] };
  const byPath = new Map<string, Entry<D>>();
  const live = new Map<string, RecordEntry<D>>();
  for (const entry of [...entries].sort((a, b) => comparePaths(a.path, b.path))) {
    byPath.set(entry.path, entry);
    if (entry.kind === 'record' && trusted !== null && entry.cursor > trusted.tail) live.set(entry.path, entry);
  }
  return { entries: byPath, live, coverage, trusted };
}

/** The scope as one run per contiguous range, as `compactRuns` gives it. */
export function runsOfScope<D>(scope: ScopeKey, { entries, coverage }: MergedRuns<D>): Run<D>[] {
  const winners = [...entries.values()];
  return coverage.map(({ tail, head }) => ({
    ...scopeOf(scope),
    tail,
    head,
    entries: winners.filter((entry) => entry.cursor > tail && entry.cursor <= head),
  }));
}

/** A window end an eviction at `cutoff` keeps: one above it. */
export const keptEnd = (end: Cursor | undefined, cutoff: Cursor): Cursor | undefined =>
  end !== undefined && end > cutoff ? end : undefined;

/** `coverage` without anything at or below `cutoff`, as the pure `evictBelow` trims runs. */
export function evictCoverage(coverage: readonly Range[], cutoff: Cursor): Coverage {
  return coverage
    .filter(({ head }) => head > cutoff)
    .map(({ tail, head }) => ({ tail: tail >= cutoff ? tail : cutoff, head }));
}

/** A stored homeserver state in the current shape, `EMPTY_HOMESERVER_STATE` for none. */
export function homeserverStateOf(stored: Partial<HomeserverState> | undefined): HomeserverState {
  return {
    highWater: stored?.highWater ?? null,
    epoch: stored?.epoch ?? EMPTY_HOMESERVER_STATE.epoch,
    failure: stored?.failure ?? null,
  };
}

/** `current` with the fields `patch` sets; a field left out keeps its value, and the mark only rises. */
export function patchedState(current: Readonly<HomeserverState>, patch: HomeserverPatch): HomeserverState {
  const { highWater } = patch;
  const rises = highWater !== undefined && (current.highWater === null || highWater.cursor > current.highWater.cursor);
  return {
    highWater: rises ? highWater : current.highWater,
    epoch: current.epoch,
    failure: patch.failure !== undefined ? patch.failure : current.failure,
  };
}

/** The state a deletion leaves: the next epoch, no mark. */
export const deletedState = (current: Readonly<HomeserverState>): HomeserverState => ({
  highWater: null,
  epoch: current.epoch + 1,
  failure: current.failure,
});

/** Whether every epoch the batch read under is still current. */
export const readsCurrent = (readAt: readonly ReadAt[] | undefined, epochOf: (homeserver: string) => number) =>
  (readAt ?? []).every(({ homeserver, epoch }) => epochOf(homeserver) === epoch);
