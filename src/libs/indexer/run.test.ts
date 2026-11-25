import { describe, expect, it, vi } from 'vitest';
import { InvalidIndexInputError } from './indexer.errors';
import type { Entry, Run, RunMeta, StreamEvent } from './indexer.types';
import { comparePaths, foldEvents, validateRun } from './run';

const META: RunMeta = { author: 'alice', homeserver: 'hs1', group: 'posts' };
const c = (n: number) => BigInt(n);
const put = (path: string, cursor: number, hash = `h${cursor}`): StreamEvent => ({
  type: 'PUT',
  path,
  cursor: c(cursor),
  hash,
});
const del = (path: string, cursor: number): StreamEvent => ({ type: 'DEL', path, cursor: c(cursor) });
const runOf = (tail: number, head: number, entries: Entry[]): Run => ({
  ...META,
  tail: c(tail),
  head: c(head),
  entries,
});

describe('foldEvents', () => {
  it('keeps the highest cursor per path, whatever the arrival order', () => {
    const events = [put('a', 7), put('b', 3), put('a', 4), put('b', 9), put('a', 5)];

    expect(foldEvents(META, c(2), c(10), events).entries).toEqual([
      { kind: 'record', path: 'a', cursor: c(7), hash: 'h7' },
      { kind: 'record', path: 'b', cursor: c(9), hash: 'h9' },
    ]);
  });

  it('turns a last DEL into a tombstone inside a range that starts after the stream start', () => {
    const run = foldEvents(META, c(2), c(10), [put('a', 3), del('a', 6), del('b', 4)]);

    expect(run).toEqual({
      ...META,
      tail: c(2),
      head: c(10),
      entries: [
        { kind: 'tombstone', path: 'a', cursor: c(6) },
        { kind: 'tombstone', path: 'b', cursor: c(4) },
      ],
    });
  });

  it('drops tombstones from a range that starts at the stream start', () => {
    const run = foldEvents(META, c(0), c(10), [put('a', 3), del('a', 6), put('b', 4)]);

    expect(run.entries).toEqual([{ kind: 'record', path: 'b', cursor: c(4), hash: 'h4' }]);
  });

  it('keeps a PUT after a DEL as a record', () => {
    const run = foldEvents(META, c(0), c(10), [put('a', 8), del('a', 6), put('a', 3)]);

    expect(run.entries).toEqual([{ kind: 'record', path: 'a', cursor: c(8), hash: 'h8' }]);
  });

  it('sorts entries by UTF-16 code unit, not by locale or code point', () => {
    const events = ['b', 'a', 'B', '\uffff', '\u{1f600}'].map((path, i) => put(path, i + 1));

    const paths = foldEvents(META, c(0), c(10), events).entries.map((entry) => entry.path);

    expect(paths).toEqual(['B', 'a', 'b', '\u{1f600}', '\uffff']);
  });

  it('asks dataOf for the payload of winning PUTs only', () => {
    const dataOf = vi.fn((event: StreamEvent) => ({ size: event.path.length }));

    const run = foldEvents(META, c(0), c(10), [put('ab', 2), put('ab', 5), put('c', 1), del('c', 3)], dataOf);

    expect(run.entries).toEqual([{ kind: 'record', path: 'ab', cursor: c(5), hash: 'h5', data: { size: 2 } }]);
    expect(dataOf).toHaveBeenCalledTimes(1);
  });

  it('omits hash and data when there are none', () => {
    const run = foldEvents(META, c(0), c(2), [{ type: 'PUT', path: 'a', cursor: c(1) }]);

    expect(run.entries[0]).toStrictEqual({ kind: 'record', path: 'a', cursor: c(1) });
  });

  it('folds no events into an empty run that still speaks for its range', () => {
    expect(foldEvents(META, c(4), c(9), [])).toEqual(runOf(4, 9, []));
  });

  it('throws on an event outside (tail, head]', () => {
    expect(() => foldEvents(META, c(2), c(10), [put('a', 2)])).toThrow(InvalidIndexInputError);
    expect(() => foldEvents(META, c(2), c(10), [put('a', 11)])).toThrow(InvalidIndexInputError);
  });

  it('throws on an empty or inverted range', () => {
    expect(() => foldEvents(META, c(5), c(5), [])).toThrow(InvalidIndexInputError);
    expect(() => foldEvents(META, c(6), c(5), [])).toThrow(InvalidIndexInputError);
  });

  it('throws on a PUT and a DEL of one path at one cursor', () => {
    expect(() => foldEvents(META, c(0), c(10), [put('a', 4), del('a', 4)])).toThrow(InvalidIndexInputError);
  });

  it('always builds a valid run', () => {
    const run = foldEvents(META, c(3), c(20), [put('z', 4), del('m', 9), put('a', 12), put('m', 5)]);

    expect(validateRun(run)).toEqual([]);
  });
});

describe('validateRun', () => {
  it('accepts a valid run, empty or not', () => {
    const run = runOf(2, 9, [
      { kind: 'tombstone', path: 'a', cursor: c(3) },
      { kind: 'record', path: 'b', cursor: c(9) },
    ]);

    expect(validateRun(runOf(0, 1, []))).toEqual([]);
    expect(validateRun(run)).toEqual([]);
  });

  it('reports an empty or inverted range', () => {
    expect(validateRun(runOf(5, 5, []))).toHaveLength(1);
    expect(validateRun(runOf(6, 5, []))).toHaveLength(1);
  });

  it('reports a negative tail', () => {
    expect(validateRun(runOf(-1, 5, []))).toHaveLength(1);
  });

  it('reports entries outside (tail, head]', () => {
    const run = runOf(2, 9, [
      { kind: 'record', path: 'a', cursor: c(2) },
      { kind: 'record', path: 'b', cursor: c(10) },
    ]);

    expect(validateRun(run)).toHaveLength(2);
  });

  it('reports a path with two entries and entries out of path order', () => {
    const duplicate = runOf(0, 9, [
      { kind: 'record', path: 'a', cursor: c(2) },
      { kind: 'record', path: 'a', cursor: c(3) },
    ]);
    const unsorted = runOf(0, 9, [
      { kind: 'record', path: 'b', cursor: c(2) },
      { kind: 'record', path: 'a', cursor: c(3) },
    ]);

    expect(validateRun(duplicate)).toEqual([expect.stringContaining('more than one entry')]);
    expect(validateRun(unsorted)).toEqual([expect.stringContaining('out of path order')]);
  });
});

describe('comparePaths', () => {
  it('orders by code unit', () => {
    expect(['b', 'B', 'a'].sort(comparePaths)).toEqual(['B', 'a', 'b']);
    expect(comparePaths('x', 'x')).toBe(0);
  });
});
