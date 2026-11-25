import { describe, expect, it } from 'vitest';
import { coverageOfRuns, covers, gaps } from './coverage';
import type { Cursor, MergedRuns, Range, StreamEvent } from './indexer.types';
import { compactRuns, evictBelow, mergeRuns } from './merge';
import {
  fold,
  type History,
  int,
  randomCase,
  randomHistory,
  range,
  type Rng,
  seeded,
  shuffled,
} from './merge.generators';
import { validateRun } from './run';

// Fixed seeds, so a failure names the seed that reproduces it.
const ITERATIONS = 300;

/** The last event of every path at or below `upTo`, by replaying the history. */
function lastEvents(history: History, upTo: Cursor): Map<string, StreamEvent> {
  const last = new Map<string, StreamEvent>();
  for (const event of history.events) if (event.cursor <= upTo) last.set(event.path, event);
  return last;
}

/**
 * What any set of runs must serve: per path, its last event at or below the trusted head, live when it is a
 * PUT above the trusted tail.
 */
function expectedLive(history: History, trusted: Range | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (trusted === null) return out;
  for (const [path, event] of lastEvents(history, trusted.head)) {
    if (event.type === 'PUT' && event.cursor > trusted.tail) out[path] = `${event.cursor}:${event.hash}`;
  }
  return out;
}

function liveOf(merged: MergedRuns): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, entry] of merged.live) out[path] = `${entry.cursor}:${entry.hash}`;
  return out;
}

function forEachSeed(check: (rng: Rng, seed: number) => void): void {
  for (let seed = 1; seed <= ITERATIONS; seed++) check(seeded(seed), seed);
}

describe('merging folds of a random history', () => {
  it('serves exactly the paths whose last event up to the trusted head is a PUT above its tail', () => {
    forEachSeed((rng, seed) => {
      const { history, runs } = randomCase(rng);
      const merged = mergeRuns(runs);
      const coverage = coverageOfRuns(runs);
      const highestHead = runs.reduce((head, run) => (run.head > head ? run.head : head), BigInt(0));

      expect(runs.flatMap(validateRun), `seed ${seed}`).toEqual([]);
      expect(merged.trusted, `seed ${seed}`).toEqual(coverage[coverage.length - 1]);
      expect(merged.trusted?.head, `seed ${seed}`).toBe(highestHead);
      expect(liveOf(merged), `seed ${seed}`).toEqual(expectedLive(history, merged.trusted));
    });
  });

  it('gives the same result in any order', () => {
    forEachSeed((rng, seed) => {
      const { runs } = randomCase(rng);
      const merged = mergeRuns(runs);

      for (let i = 0; i < 3; i++) {
        expect(mergeRuns(shuffled(rng, runs)), `seed ${seed}`).toEqual(merged);
      }
    });
  });

  it('never serves a path whose last event up to the trusted head is a DEL', () => {
    forEachSeed((rng, seed) => {
      const { history, runs } = randomCase(rng);
      const merged = mergeRuns(runs);
      const trustedHead = merged.trusted?.head ?? BigInt(0);
      const deleted = [...lastEvents(history, trustedHead)].filter(([, event]) => event.type === 'DEL');

      expect(
        deleted.filter(([path]) => merged.live.has(path)).map(([path]) => path),
        `seed ${seed}`,
      ).toEqual([]);
    });
  });
});

describe('compacting and evicting folds of a random history', () => {
  it('compacts into valid runs that merge to the same result, and compacting again changes nothing', () => {
    forEachSeed((rng, seed) => {
      const { runs } = randomCase(rng);
      const compacted = compactRuns(runs);

      expect(compacted.flatMap(validateRun), `seed ${seed}`).toEqual([]);
      expect(mergeRuns(compacted), `seed ${seed}`).toEqual(mergeRuns(runs));
      expect(compactRuns(compacted), `seed ${seed}`).toEqual(compacted);
    });
  });

  it('serves the remaining coverage after eviction, and re-folding the evicted ranges restores all', () => {
    forEachSeed((rng, seed) => {
      const { history, runs } = randomCase(rng);
      const cutoff = BigInt(int(rng, 0, history.n));
      const evicted = evictBelow(runs, cutoff);
      const afterEviction = mergeRuns(evicted);
      const refolded = runs
        .filter((run) => run.tail < cutoff)
        .map((run) => fold(history, { tail: run.tail, head: run.head < cutoff ? run.head : cutoff }));

      expect(evicted.flatMap(validateRun), `seed ${seed}`).toEqual([]);
      expect(liveOf(afterEviction), `seed ${seed}`).toEqual(expectedLive(history, afterEviction.trusted));
      expect(mergeRuns(shuffled(rng, [...evicted, ...refolded])), `seed ${seed}`).toEqual(mergeRuns(runs));
    });
  });

  it('reports the gap between two runs, trusts the upper one and keeps the lower one in entries', () => {
    forEachSeed((rng, seed) => {
      const history = randomHistory(rng, 3);
      const tail1 = int(rng, 0, history.n - 3);
      const head1 = int(rng, tail1 + 1, history.n - 2);
      const tail2 = int(rng, head1 + 1, history.n - 1);
      const head2 = int(rng, tail2 + 1, history.n);
      const lower = fold(history, range(tail1, head1));
      const upper = fold(history, range(tail2, head2));
      const merged = mergeRuns(shuffled(rng, [lower, upper]));
      const upperPaths = new Set(upper.entries.map((entry) => entry.path));

      expect(merged.coverage, `seed ${seed}`).toEqual([range(tail1, head1), range(tail2, head2)]);
      expect(gaps(merged.coverage), `seed ${seed}`).toEqual([range(head1, tail2)]);
      expect(covers(merged.coverage, BigInt(tail2)), `seed ${seed}`).toBe(false);
      expect(merged.trusted, `seed ${seed}`).toEqual(range(tail2, head2));
      for (const entry of lower.entries.filter((e) => !upperPaths.has(e.path))) {
        expect(merged.entries.get(entry.path), `seed ${seed}`).toEqual(entry);
        expect(merged.live.has(entry.path), `seed ${seed}`).toBe(false);
      }
    });
  });
});
