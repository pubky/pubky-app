import type { Range, Run, RunMeta, StreamEvent } from './indexer.types';
import { foldEvents } from './run';

// Test-only: seeded random histories and folds of their ranges, shared by the property suites.

export const GENERATED_META: RunMeta = { author: 'alice', homeserver: 'hs1', group: 'posts' };

export type Rng = () => number;

/** mulberry32: small, fast and good enough to shuffle test inputs. */
export function seeded(seed: number): Rng {
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
export const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = int(rng, 0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface History {
  n: number;
  events: StreamEvent[];
}

/** One author's events over cursors `1..n`: first writes, edits, deletes and writes after a delete. */
export function randomHistory(rng: Rng, minLength = 1): History {
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

export const range = (tail: number, head: number): Range => ({ tail: BigInt(tail), head: BigInt(head) });

export function fold<D = unknown>(history: History, { tail, head }: Range, meta: RunMeta = GENERATED_META): Run<D> {
  const events = history.events.filter((event) => event.cursor > tail && event.cursor <= head);
  return foldEvents<D>(meta, tail, head, events);
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
export function randomSubset(rng: Rng, n: number): Range[] {
  const parts = partition(rng, n);
  const kept = parts.filter(() => rng() < 0.5);
  if (kept.length === 0) kept.push(parts[int(rng, 0, parts.length - 1)]);
  const duplicated = Array.from({ length: int(rng, 0, 2) }, () => kept[int(rng, 0, kept.length - 1)]);
  const extra = Array.from({ length: int(rng, 0, 2) }, () => randomRange(rng, n));
  return [...kept, ...duplicated, ...extra];
}

/** A random history and the folds of a random subset of its ranges. */
export function randomCase<D = unknown>(
  rng: Rng,
  meta: RunMeta = GENERATED_META,
): { history: History; runs: Run<D>[] } {
  const history = randomHistory(rng);
  return { history, runs: randomSubset(rng, history.n).map((r) => fold<D>(history, r, meta)) };
}
