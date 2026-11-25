import { coverageOfRuns } from './coverage';
import { isValidCursor } from './cursor';
import { InvalidIndexInputError } from './indexer.errors';
import type { Cursor, Entry, MergedRuns, RecordEntry, Run } from './indexer.types';
import { assertValidRun, comparePaths } from './run';

function assertOneScope<D>(runs: readonly Run<D>[]): void {
  for (const run of runs) {
    assertValidRun(run);
    const first = runs[0];
    if (run.author !== first.author || run.homeserver !== first.homeserver || run.group !== first.group) {
      throw new InvalidIndexInputError('runs of different authors, homeservers or groups cannot be combined');
    }
  }
}

function sameEvent<D>(a: Entry<D>, b: Entry<D>): boolean {
  if (a.kind !== 'record' || b.kind !== 'record') return a.kind === b.kind;
  return a.hash === undefined || b.hash === undefined || a.hash === b.hash;
}

/** Entries at the same path and cursor are the same event, so they must agree. */
function assertConsistentEvents<D>(runs: readonly Run<D>[]): void {
  const seen = new Map<string, Entry<D>>();
  for (const run of runs) {
    for (const entry of run.entries) {
      const key = `${entry.cursor}\u0000${entry.path}`;
      const other = seen.get(key);
      if (other === undefined) seen.set(key, entry);
      else if (!sameEvent(other, entry)) {
        throw new InvalidIndexInputError(`runs disagree about ${entry.path} at cursor ${entry.cursor}`);
      }
    }
  }
}

/**
 * Merges runs of one scope, in any order: per path the entry with the highest cursor wins. Only winners
 * inside the top contiguous range of the coverage are served as live, because a gap below it may hide a
 * delete of anything older.
 */
export function mergeRuns<D = unknown>(runs: readonly Run<D>[]): MergedRuns<D> {
  assertOneScope(runs);
  assertConsistentEvents(runs);

  const winners = new Map<string, Entry<D>>();
  for (const run of runs) {
    for (const entry of run.entries) {
      const current = winners.get(entry.path);
      if (current === undefined || entry.cursor > current.cursor) winners.set(entry.path, entry);
    }
  }

  const coverage = coverageOfRuns(runs);
  const trusted = coverage.length === 0 ? null : { ...coverage[coverage.length - 1] };
  const entries = new Map<string, Entry<D>>();
  const live = new Map<string, RecordEntry<D>>();
  for (const [path, entry] of [...winners].sort(([a], [b]) => comparePaths(a, b))) {
    entries.set(path, entry);
    if (entry.kind === 'record' && trusted !== null && entry.cursor > trusted.tail) live.set(path, entry);
  }
  return { entries, live, coverage, trusted };
}

/** The merge of `runs` re-expressed as one run per contiguous range of its coverage, tombstones included. */
export function compactRuns<D = unknown>(runs: readonly Run<D>[]): Run<D>[] {
  if (runs.length === 0) return [];
  const { entries, coverage } = mergeRuns(runs);
  const { author, homeserver, group } = runs[0];
  const winners = [...entries.values()];
  return coverage.map(({ tail, head }) => {
    const inRange = (entry: Entry<D>) => entry.cursor > tail && entry.cursor <= head;
    return { author, homeserver, group, tail, head, entries: winners.filter(inRange) };
  });
}

/**
 * Forgets everything at or below `cutoff`: runs ending there go, runs spanning it start at `cutoff` and lose
 * their older entries. Eviction is oldest first only, hence one cutoff for the whole set. Re-folding an
 * evicted range later brings its tombstones back with it.
 */
export function evictBelow<D = unknown>(runs: readonly Run<D>[], cutoff: Cursor): Run<D>[] {
  if (!isValidCursor(cutoff)) throw new InvalidIndexInputError(`cutoff ${cutoff} is out of range`);
  assertOneScope(runs);
  const trim = (run: Run<D>): Run<D> => {
    if (run.tail >= cutoff) return run;
    return { ...run, tail: cutoff, entries: run.entries.filter((entry) => entry.cursor > cutoff) };
  };
  return runs.filter((run) => run.head > cutoff).map(trim);
}
