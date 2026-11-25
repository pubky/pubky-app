import { coverageOfRuns } from './coverage';
import { CURSOR_ZERO, isValidCursor } from './cursor';
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
 * Merges runs of one scope, in any order. An entry at cursor `c` is dead when some run covers `c` and holds
 * no entry for its path at `c` or later: a fold of a range containing `c` keeps the path's last event in that
 * range, so its absence means the path was deleted there by a run starting at the stream start, which drops
 * tombstones. Among the entries of a path that are not dead, the highest cursor wins.
 */
export function mergeRuns<D = unknown>(runs: readonly Run<D>[]): MergedRuns<D> {
  assertOneScope(runs);
  assertConsistentEvents(runs);

  const byPath = runs.map((run) => new Map(run.entries.map((entry) => [entry.path, entry] as const)));
  function isDead(entry: Entry<D>): boolean {
    return runs.some((run, i) => {
      if (entry.cursor <= run.tail || entry.cursor > run.head) return false;
      const own = byPath[i].get(entry.path);
      return own === undefined || own.cursor < entry.cursor;
    });
  }

  const winners = new Map<string, Entry<D>>();
  for (const run of runs) {
    for (const entry of run.entries) {
      const current = winners.get(entry.path);
      if (current !== undefined && current.cursor >= entry.cursor) continue;
      if (!isDead(entry)) winners.set(entry.path, entry);
    }
  }

  const entries = new Map<string, Entry<D>>();
  const live = new Map<string, RecordEntry<D>>();
  for (const [path, entry] of [...winners].sort(([a], [b]) => comparePaths(a, b))) {
    entries.set(path, entry);
    if (entry.kind === 'record') live.set(path, entry);
  }
  return { live, entries, coverage: coverageOfRuns(runs) };
}

/**
 * The merge of `runs` re-expressed as one run per contiguous range of its coverage, each winning entry in
 * the range holding its cursor. A range starting at the stream start drops its tombstones.
 */
export function compactRuns<D = unknown>(runs: readonly Run<D>[]): Run<D>[] {
  if (runs.length === 0) return [];
  const { entries, coverage } = mergeRuns(runs);
  const { author, homeserver, group } = runs[0];
  const winners = [...entries.values()];
  return coverage.map(({ tail, head }) => {
    const inRange = (entry: Entry<D>) => entry.cursor > tail && entry.cursor <= head;
    const kept = (entry: Entry<D>) => inRange(entry) && !(entry.kind === 'tombstone' && tail === CURSOR_ZERO);
    return { author, homeserver, group, tail, head, entries: winners.filter(kept) };
  });
}

/**
 * Forgets everything at or below `cutoff`: runs ending there go, runs spanning it start at `cutoff` and lose
 * their older entries. Eviction is oldest first only, hence one cutoff for the whole set.
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
