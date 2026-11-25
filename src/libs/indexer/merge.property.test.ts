import { describe, expect, it } from 'vitest';
import { coverageOfRuns, covers, gaps } from './coverage';
import type { Cursor, MergedRuns, Range, Run, RunMeta, StreamEvent } from './indexer.types';
import { compactRuns, evictBelow, mergeRuns } from './merge';
import { foldEvents, validateRun } from './run';

// Fixed seeds, so a failure names the seed that reproduces it.
const ITERATIONS = 300;
const META: RunMeta = { author: 'alice', homeserver: 'hs1', group: 'posts' };

type Rng = () => number;

/** mulberry32: small, fast and good enough to shuffle test inputs. */
function seeded(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A uniform integer in `[lo, hi]`. */
const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = int(rng, 0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

interface History {
  n: number;
  events: StreamEvent[];
}

/** One author's events over cursors `1..n`: first writes, edits, deletes and writes after a delete. */
function randomHistory(rng: Rng, minLength = 1): History {
  const n = int(rng, minLength, 60);
  const pathCount = int(rng, 1, 8);
  const live = new Set<string>();
  const events: StreamEvent[] = [];
  for (let i = 1; i <= n; i++) {
    const path = `posts/${int(rng, 0, pathCount - 1)}`;
    if (live.has(path) && rng() < 0.4) {
      events.push({ type: 'DEL', path, cursor: BigInt(i) });
      live.delete(path);
    } else {
      events.push({ type: 'PUT', path, cursor: BigInt(i), hash: `h${i}` });
      live.add(path);
    }
  }
  return { n, events };
}

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

const range = (tail: number, head: number): Range => ({ tail: BigInt(tail), head: BigInt(head) });

function fold(history: History, { tail, head }: Range): Run {
  const events = history.events.filter((event) => event.cursor > tail && event.cursor <= head);
  return foldEvents(META, tail, head, events);
}

/** `(0, n]` cut into contiguous ranges, oldest first. */
function partition(rng: Rng, n: number): Range[] {
  const cuts = new Set<number>();
  const count = int(rng, 0, Math.min(n - 1, 6));
  while (cuts.size < count) cuts.add(int(rng, 1, n - 1));
  const points = [0, ...[...cuts].sort((a, b) => a - b), n];
  return points.slice(1).map((head, i) => range(points[i], head));
}

function randomRange(rng: Rng, n: number): Range {
  const tail = int(rng, 0, n - 1);
  return range(tail, int(rng, tail + 1, n));
}

/** A non-empty random subset of a split of `(0, n]`, with some ranges twice and some overlapping extras. */
function randomSubset(rng: Rng, n: number): Range[] {
  const parts = partition(rng, n);
  const kept = parts.filter(() => rng() < 0.5);
  if (kept.length === 0) kept.push(parts[int(rng, 0, parts.length - 1)]);
  const duplicated = Array.from({ length: int(rng, 0, 2) }, () => kept[int(rng, 0, kept.length - 1)]);
  const extra = Array.from({ length: int(rng, 0, 2) }, () => randomRange(rng, n));
  return [...kept, ...duplicated, ...extra];
}

/** A random history and the folds of a random subset of its ranges. */
function randomCase(rng: Rng): { history: History; runs: Run[] } {
  const history = randomHistory(rng);
  return { history, runs: randomSubset(rng, history.n).map((r) => fold(history, r)) };
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

      expect(deleted.filter(([path]) => merged.live.has(path)).map(([path]) => path), `seed ${seed}`).toEqual([]);
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
