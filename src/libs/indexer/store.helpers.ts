import { addRange } from './coverage';
import { isValidCursor } from './cursor';
import { InvalidIndexInputError } from './indexer.errors';
import type { Coverage, Cursor, Entry, MergedRuns, Range, RecordEntry, Run } from './indexer.types';
import { replaces, sameEvent } from './merge';
import { assertValidRun, comparePaths } from './run';
import type { HomeserverState, ScopeKey, StoreBatch } from './store.types';

// Rules every `IndexStore` applies the same way, so the stores differ only in where they keep the data.

export const scopeId = ({ author, homeserver, group }: ScopeKey) => JSON.stringify([author, homeserver, group]);

export const scopeOf = ({ author, homeserver, group }: ScopeKey): ScopeKey => ({ author, homeserver, group });

/** Throws unless every run and cutoff of the batch is valid. */
export function assertValidBatch<D>(batch: StoreBatch<D>): void {
  for (const { cutoff } of batch.evictions ?? []) {
    if (!isValidCursor(cutoff)) throw new InvalidIndexInputError(`cutoff ${cutoff} is out of range`);
  }
  for (const run of batch.applyRuns ?? []) assertValidRun(run);
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

/** `coverage` without anything at or below `cutoff`, as the pure `evictBelow` trims runs. */
export function evictCoverage(coverage: readonly Range[], cutoff: Cursor): Coverage {
  return coverage
    .filter(({ head }) => head > cutoff)
    .map(({ tail, head }) => ({ tail: tail >= cutoff ? tail : cutoff, head }));
}

/** `current` with the fields `patch` sets; a field left out keeps its value. */
export function patchedState(current: Readonly<HomeserverState>, patch: Partial<HomeserverState>): HomeserverState {
  return {
    highWater: patch.highWater !== undefined ? patch.highWater : current.highWater,
    windowStart: patch.windowStart !== undefined ? patch.windowStart : current.windowStart,
    failure: patch.failure !== undefined ? patch.failure : current.failure,
  };
}
