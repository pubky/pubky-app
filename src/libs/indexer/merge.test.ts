import { describe, expect, it } from 'vitest';
import { InvalidIndexInputError } from './indexer.errors';
import type { Entry, MergedRuns, Range, RecordEntry, Run, RunMeta, TombstoneEntry } from './indexer.types';
import { compactRuns, evictBelow, mergeRuns } from './merge';
import { validateRun } from './run';

const META: RunMeta = { author: 'alice', homeserver: 'hs1', group: 'posts' };
const c = (n: number) => BigInt(n);
const rec = (path: string, cursor: number): RecordEntry => ({
  kind: 'record',
  path,
  cursor: c(cursor),
  hash: `h${cursor}`,
});
const tomb = (path: string, cursor: number): TombstoneEntry => ({ kind: 'tombstone', path, cursor: c(cursor) });
const range = (tail: number, head: number): Range => ({ tail: c(tail), head: c(head) });
const runOf = (tail: number, head: number, entries: Entry[], meta: RunMeta = META): Run => ({
  ...meta,
  ...range(tail, head),
  entries,
});

/** Path to `kind@cursor` of every winner, so a failing comparison reads at a glance. */
function winners(merged: MergedRuns): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, entry] of merged.entries) out[path] = `${entry.kind}@${entry.cursor}`;
  return out;
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  const out: T[][] = [];
  items.forEach((item, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) out.push([item, ...tail]);
  });
  return out;
}

describe('mergeRuns', () => {
  it('merges no runs into nothing, with no trusted range', () => {
    expect(mergeRuns([])).toEqual({ entries: new Map(), live: new Map(), coverage: [], trusted: null });
  });

  it.each(['author', 'homeserver', 'group'] as const)('throws on runs of different %s', (field) => {
    const other = runOf(10, 20, [], { ...META, [field]: 'other' });

    expect(() => mergeRuns([runOf(0, 10, []), other])).toThrow(InvalidIndexInputError);
  });

  it('throws on an invalid run', () => {
    expect(() => mergeRuns([runOf(0, 10, [rec('b', 2), rec('a', 3)])])).toThrow(InvalidIndexInputError);
  });

  it('lets a later record supersede an earlier one', () => {
    const merged = mergeRuns([runOf(0, 10, [rec('a', 4)]), runOf(10, 20, [rec('a', 15)])]);

    expect(merged.live).toEqual(new Map([['a', rec('a', 15)]]));
  });

  it('lets a later tombstone hide an earlier record, keeping it among the entries', () => {
    const merged = mergeRuns([runOf(0, 10, [rec('a', 4), rec('b', 5)]), runOf(10, 20, [tomb('a', 12)])]);

    expect([...merged.live.keys()]).toEqual(['b']);
    expect(winners(merged)).toEqual({ a: 'tombstone@12', b: 'record@5' });
  });

  it('lets a tombstone from a range at the stream start hide an older record', () => {
    // a was put at 3 and deleted at 6.
    const merged = mergeRuns([runOf(0, 4, [rec('a', 3)]), runOf(0, 8, [tomb('a', 6)])]);

    expect(winners(merged)).toEqual({ a: 'tombstone@6' });
    expect(merged.live.size).toBe(0);
  });

  it('keeps a record that no later entry supersedes', () => {
    const merged = mergeRuns([runOf(0, 10, [rec('a', 4)]), runOf(10, 20, [])]);

    expect([...merged.live.keys()]).toEqual(['a']);
  });

  it('agrees with itself over overlapping and duplicated runs', () => {
    const a = runOf(0, 10, [rec('a', 4), rec('b', 9)]);
    const b = runOf(5, 15, [rec('b', 9), rec('c', 12)]);

    expect(winners(mergeRuns([a, b, a, b]))).toEqual({ a: 'record@4', b: 'record@9', c: 'record@12' });
  });

  it('serves only winners inside the top contiguous range, keeping older ones among the entries', () => {
    const merged = mergeRuns([runOf(0, 5, [rec('a', 2), rec('b', 4)]), runOf(8, 12, [rec('b', 10), rec('c', 9)])]);

    expect(merged.trusted).toEqual(range(8, 12));
    expect([...merged.live.keys()]).toEqual(['b', 'c']);
    expect(winners(merged)).toEqual({ a: 'record@2', b: 'record@10', c: 'record@9' });
  });

  it('throws when runs disagree about the kind of one event, in every order', () => {
    const runs = [runOf(4, 10, [rec('a', 5)]), runOf(4, 10, [tomb('a', 5)]), runOf(10, 20, [rec('a', 15)])];

    for (const order of permutations(runs)) {
      expect(() => mergeRuns(order)).toThrow(InvalidIndexInputError);
    }
  });

  it('throws when runs disagree about the hash of one event', () => {
    const other: RecordEntry = { ...rec('a', 5), hash: 'other' };

    expect(() => mergeRuns([runOf(4, 10, [rec('a', 5)]), runOf(4, 10, [other])])).toThrow(InvalidIndexInputError);
  });

  it('gives the same result in every order', () => {
    const runs = [
      runOf(0, 6, [rec('a', 2), rec('b', 6)]),
      runOf(4, 12, [rec('b', 6), tomb('c', 11), rec('d', 8)]),
      runOf(12, 20, [rec('a', 14)]),
      runOf(0, 9, [rec('a', 2), rec('b', 6), rec('d', 8)]),
    ];
    const expected = mergeRuns(runs);

    expect(winners(expected)).toEqual({ a: 'record@14', b: 'record@6', c: 'tombstone@11', d: 'record@8' });
    expect([...expected.live.keys()]).toEqual(['a', 'b', 'd']);
    expect(expected.trusted).toEqual(range(0, 20));
    for (const order of permutations(runs)) {
      expect(mergeRuns(order)).toEqual(expected);
    }
  });

  it('reports the coverage of the runs, gaps included', () => {
    const merged = mergeRuns([runOf(0, 5, []), runOf(8, 9, []), runOf(5, 6, [])]);

    expect(merged.coverage).toEqual([range(0, 6), range(8, 9)]);
    expect(merged.trusted).toEqual(range(8, 9));
  });
});

describe('compactRuns', () => {
  it('compacts no runs into none', () => {
    expect(compactRuns([])).toEqual([]);
  });

  it('builds one run per contiguous range of the coverage', () => {
    const runs = [
      runOf(0, 10, [rec('a', 4), rec('b', 6)]),
      runOf(5, 15, [rec('b', 6), rec('c', 12)]),
      runOf(20, 30, [tomb('d', 25)]),
    ];

    expect(compactRuns(runs)).toEqual([
      runOf(0, 15, [rec('a', 4), rec('b', 6), rec('c', 12)]),
      runOf(20, 30, [tomb('d', 25)]),
    ]);
  });

  it('keeps tombstones, also in a range that starts at the stream start', () => {
    const deleted = runOf(5, 10, [tomb('a', 7)]);

    expect(compactRuns([runOf(0, 5, [rec('a', 2)]), deleted])).toEqual([runOf(0, 10, [tomb('a', 7)])]);
  });

  it('builds valid runs that merge to the same result', () => {
    const runs = [runOf(0, 6, [rec('a', 6), rec('z', 3)]), runOf(6, 12, [tomb('z', 9)]), runOf(15, 18, [])];
    const compacted = compactRuns(runs);

    expect(compacted.flatMap(validateRun)).toEqual([]);
    expect(mergeRuns(compacted)).toEqual(mergeRuns(runs));
  });
});

describe('evictBelow', () => {
  it('removes runs ending at or below the cutoff and trims the run spanning it', () => {
    const runs = [runOf(0, 3, [rec('a', 1)]), runOf(3, 5, [rec('b', 5)]), runOf(3, 10, [rec('c', 4), rec('d', 8)])];

    expect(evictBelow(runs, c(5))).toEqual([runOf(5, 10, [rec('d', 8)])]);
  });

  it('leaves runs above the cutoff untouched', () => {
    const above = runOf(6, 9, [rec('a', 7)]);

    expect(evictBelow([above], c(6))).toEqual([above]);
    expect(evictBelow([above], c(0))).toEqual([above]);
  });

  it('keeps a delete above the cutoff in force when the evicted range is folded again', () => {
    // a was put at 2 and deleted at 7.
    const evicted = evictBelow([runOf(0, 10, [tomb('a', 7)])], c(4));

    expect(mergeRuns([...evicted, runOf(0, 4, [rec('a', 2)])]).live.size).toBe(0);
  });

  it('throws on runs of different scopes and on an out of range cutoff', () => {
    const other = runOf(5, 9, [], { ...META, author: 'bob' });

    expect(() => evictBelow([runOf(0, 5, []), other], c(1))).toThrow(InvalidIndexInputError);
    expect(() => evictBelow([runOf(0, 5, [])], c(-1))).toThrow(InvalidIndexInputError);
  });
});
