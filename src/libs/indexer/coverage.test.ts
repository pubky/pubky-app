import { describe, expect, it } from 'vitest';
import { addRange, coverageOfRuns, covers, gaps, normalizeCoverage } from './coverage';
import { InvalidIndexInputError } from './indexer.errors';
import type { Range, Run } from './indexer.types';

const range = (tail: number, head: number): Range => ({ tail: BigInt(tail), head: BigInt(head) });

const run = (tail: number, head: number): Run => ({
  author: 'alice',
  homeserver: 'hs1',
  group: 'posts',
  ...range(tail, head),
  entries: [],
});

describe('normalizeCoverage', () => {
  it('sorts disjoint ranges and keeps them apart', () => {
    const sorted = [range(0, 3), range(5, 7), range(10, 12)];

    expect(normalizeCoverage([sorted[2], sorted[0], sorted[1]])).toEqual(sorted);
  });

  it('merges adjacent ranges, since (a, b] and (b, c] leave no cursor uncovered', () => {
    expect(normalizeCoverage([range(3, 6), range(0, 3)])).toEqual([range(0, 6)]);
  });

  it('merges overlapping and contained ranges', () => {
    expect(normalizeCoverage([range(0, 5), range(4, 9), range(1, 2), range(9, 10)])).toEqual([range(0, 10)]);
  });

  it('does not mutate its input', () => {
    const input = [range(0, 5), range(5, 8)];

    normalizeCoverage(input);

    expect(input).toEqual([range(0, 5), range(5, 8)]);
  });

  it('returns an empty coverage for no ranges', () => {
    expect(normalizeCoverage([])).toEqual([]);
  });

  it('throws on an empty or inverted range', () => {
    expect(() => normalizeCoverage([range(3, 3)])).toThrow(InvalidIndexInputError);
    expect(() => normalizeCoverage([range(0, 2), range(5, 4)])).toThrow(InvalidIndexInputError);
  });
});

describe('addRange', () => {
  it('adds a range and normalizes the result', () => {
    expect(addRange([range(0, 3), range(8, 10)], range(3, 8))).toEqual([range(0, 10)]);
    expect(addRange([range(0, 3)], range(5, 6))).toEqual([range(0, 3), range(5, 6)]);
  });
});

describe('covers', () => {
  it('excludes the tail and includes the head', () => {
    const coverage = [range(2, 4), range(6, 8)];

    expect(covers(coverage, BigInt(2))).toBe(false);
    expect(covers(coverage, BigInt(3))).toBe(true);
    expect(covers(coverage, BigInt(4))).toBe(true);
    expect(covers(coverage, BigInt(5))).toBe(false);
    expect(covers(coverage, BigInt(8))).toBe(true);
    expect(covers(coverage, BigInt(9))).toBe(false);
    expect(covers([], BigInt(1))).toBe(false);
  });
});

describe('gaps', () => {
  it('returns the uncovered ranges between the lowest tail and the highest head', () => {
    expect(gaps([range(12, 15), range(0, 3), range(5, 7)])).toEqual([range(3, 5), range(7, 12)]);
  });

  it('finds no gap in a contiguous or empty coverage', () => {
    expect(gaps([range(0, 3), range(3, 9)])).toEqual([]);
    expect(gaps([range(4, 9)])).toEqual([]);
    expect(gaps([])).toEqual([]);
  });
});

describe('coverageOfRuns', () => {
  it('is the normalized union of the run ranges', () => {
    expect(coverageOfRuns([run(5, 9), run(0, 5), run(12, 20), run(14, 16)])).toEqual([range(0, 9), range(12, 20)]);
    expect(coverageOfRuns([])).toEqual([]);
  });
});
