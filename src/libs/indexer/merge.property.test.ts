import { describe, expect, it } from 'vitest';
import { coverageOfRuns, covers, gaps } from './coverage';
import type { Entry, MergedRuns, Range, Run, RunMeta, StreamEvent } from './indexer.types';
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

/** Appends a delete of one live path, so at least one path ends deleted. */
function withFinalDelete(rng: Rng, history: History): History {
  const lastOf = lastEvents(history);
  const live = [...lastOf.values()].filter((event) => event.type === 'PUT');
  if (live.length === 0) return history;
  const n = history.n + 1;
  const { path } = live[int(rng, 0, live.length - 1)];
  return { n, events: [...history.events, { type: 'DEL', path, cursor: BigInt(n) }] };
}

/** The last event of every path, by replaying the whole history. */
function lastEvents(history: History): Map<string, StreamEvent> {
  const last = new Map<string, StreamEvent>();
  for (const event of history.events) last.set(event.path, event);
  return last;
}

/** Path to winning cursor of the paths live at the end of the history and above `floor`. */
function truth(history: History, floor = 0): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, event] of lastEvents(history)) {
    if (event.type === 'PUT' && event.cursor > BigInt(floor)) out[path] = event.cursor.toString();
  }
  return out;
}

function liveOf(merged: MergedRuns): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, entry] of merged.live) out[path] = entry.cursor.toString();
  return out;
}

function entriesOf(entries: Map<string, Entry>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, entry] of entries) out[path] = `${entry.kind}@${entry.cursor}`;
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

/** Ranges whose union is `(0, n]`, overlapping each other, some of them twice. */
function overlappingRanges(rng: Rng, n: number): Range[] {
  const widen = ({ tail, head }: Range) => {
    return range(Math.max(0, Number(tail) - int(rng, 0, 3)), Math.min(n, Number(head) + int(rng, 0, 3)));
  };
  const widened = partition(rng, n).map(widen);
  const extra = Array.from({ length: int(rng, 0, 3) }, () => randomRange(rng, n));
  const duplicated = Array.from({ length: int(rng, 0, 2) }, () => widened[int(rng, 0, widened.length - 1)]);
  return [...widened, ...extra, ...duplicated];
}

/** Any ranges inside `(0, n]`, gaps allowed. */
function scatteredRanges(rng: Rng, n: number): Range[] {
  return Array.from({ length: int(rng, 1, 6) }, () => randomRange(rng, n));
}

function forEachSeed(check: (rng: Rng, seed: number) => void): void {
  for (let seed = 1; seed <= ITERATIONS; seed++) check(seeded(seed), seed);
}

describe('merging folds of a random history', () => {
  it('rebuilds the live set from contiguous runs, merged in any order', () => {
    forEachSeed((rng, seed) => {
      const history = randomHistory(rng);
      const runs = partition(rng, history.n).map((r) => fold(history, r));

      expect(runs.flatMap(validateRun), `seed ${seed}`).toEqual([]);
      for (let i = 0; i < 3; i++) {
        expect(liveOf(mergeRuns(shuffled(rng, runs))), `seed ${seed}`).toEqual(truth(history));
      }
    });
  });

  it('rebuilds the live set from overlapping and duplicated runs', () => {
    forEachSeed((rng, seed) => {
      const history = randomHistory(rng);
      const runs = overlappingRanges(rng, history.n).map((r) => fold(history, r));

      for (let i = 0; i < 3; i++) {
        expect(liveOf(mergeRuns(shuffled(rng, runs))), `seed ${seed}`).toEqual(truth(history));
      }
    });
  });

  it('keeps exactly the paths whose last event is a write inside the kept newest runs', () => {
    forEachSeed((rng, seed) => {
      const history = randomHistory(rng);
      const ranges = partition(rng, history.n);
      const kept = ranges.slice(int(rng, ranges.length > 1 ? 1 : 0, ranges.length - 1));
      const live = liveOf(mergeRuns(shuffled(rng, kept.map((r) => fold(history, r)))));
      const deleted = [...lastEvents(history)].filter(([, event]) => event.type === 'DEL').map(([path]) => path);

      expect(live, `seed ${seed}`).toEqual(truth(history, Number(kept[0].tail)));
      expect(deleted.filter((path) => path in live), `seed ${seed}`).toEqual([]);
    });
  });

  it('never brings back a deleted path once any run covers its delete', () => {
    forEachSeed((rng, seed) => {
      const history = withFinalDelete(rng, randomHistory(rng));
      for (const [path, event] of lastEvents(history)) {
        if (event.type !== 'DEL') continue;
        const d = Number(event.cursor);
        const tail = int(rng, 0, d - 1);
        const ranges = [...scatteredRanges(rng, history.n), range(tail, int(rng, d, history.n))];
        const merged = mergeRuns(shuffled(rng, ranges).map((r) => fold(history, r)));

        expect(merged.live.has(path), `seed ${seed}, ${path} deleted at ${d}`).toBe(false);
      }
    });
  });
});

describe('compacting and evicting folds of a random history', () => {
  it('compacts into valid runs that merge to the same live set and coverage', () => {
    forEachSeed((rng, seed) => {
      const history = randomHistory(rng);
      const runs = scatteredRanges(rng, history.n).map((r) => fold(history, r));
      const merged = mergeRuns(runs);
      const compacted = compactRuns(runs);
      const recompacted = mergeRuns(compacted);

      expect(compacted.flatMap(validateRun), `seed ${seed}`).toEqual([]);
      expect(coverageOfRuns(compacted), `seed ${seed}`).toEqual(merged.coverage);
      expect(compacted, `seed ${seed}`).toHaveLength(merged.coverage.length);
      expect(liveOf(recompacted), `seed ${seed}`).toEqual(liveOf(merged));
      expect(recompacted.coverage, `seed ${seed}`).toEqual(merged.coverage);
    });
  });

  it('never changes the winner of a path whose winning cursor is above the cutoff', () => {
    forEachSeed((rng, seed) => {
      const history = randomHistory(rng);
      const runs = scatteredRanges(rng, history.n).map((r) => fold(history, r));
      const cutoff = BigInt(int(rng, 0, history.n));
      const evicted = evictBelow(runs, cutoff);
      const expected = new Map([...mergeRuns(runs).entries].filter(([, entry]) => entry.cursor > cutoff));

      expect(evicted.flatMap(validateRun), `seed ${seed}`).toEqual([]);
      expect(evicted.filter((run) => run.tail < cutoff), `seed ${seed}`).toEqual([]);
      expect(entriesOf(mergeRuns(evicted).entries), `seed ${seed}`).toEqual(entriesOf(expected));
    });
  });

  it('reports the gap between two runs that do not touch', () => {
    forEachSeed((rng, seed) => {
      const history = randomHistory(rng, 3);
      const tail1 = int(rng, 0, history.n - 3);
      const head1 = int(rng, tail1 + 1, history.n - 2);
      const tail2 = int(rng, head1 + 1, history.n - 1);
      const head2 = int(rng, tail2 + 1, history.n);
      const runs = shuffled(rng, [fold(history, range(tail1, head1)), fold(history, range(tail2, head2))]);
      const coverage = mergeRuns(runs).coverage;

      expect(coverage, `seed ${seed}`).toEqual([range(tail1, head1), range(tail2, head2)]);
      expect(gaps(coverage), `seed ${seed}`).toEqual([range(head1, tail2)]);
      expect(covers(coverage, BigInt(head1 + 1)), `seed ${seed}`).toBe(false);
      expect(covers(coverage, BigInt(tail2)), `seed ${seed}`).toBe(false);
    });
  });
});
