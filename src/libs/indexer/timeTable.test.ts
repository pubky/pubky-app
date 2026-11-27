// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildTimeTable, cursorAt, estimateMs, mergeClock, type TimeSample } from './timeTable';

const NOW = 10_000;
/** A sample of its own writer unless named. */
const sample = (cursor: number, ms: number, writer = `w${cursor}`): TimeSample => ({
  cursor: BigInt(cursor),
  ms,
  writer,
});
const pairs = (table: readonly TimeSample[]) => table.map(({ cursor, ms }) => [Number(cursor), ms]);

describe('buildTimeTable', () => {
  it('sorts the samples by cursor', () => {
    expect(pairs(buildTimeTable([sample(30, 300), sample(10, 100), sample(20, 200)]))).toEqual([
      [10, 100],
      [20, 200],
      [30, 300],
    ]);
  });

  it('drops a backdated and a future-dated sample, keeping equal times', () => {
    const table = buildTimeTable(
      [sample(10, 100), sample(20, 200), sample(25, 1), sample(30, 200), sample(35, 1e15), sample(40, 400)],
      NOW,
    );

    expect(pairs(table)).toEqual([
      [10, 100],
      [20, 200],
      [30, 200],
      [40, 400],
    ]);
  });

  it('drops a sample dated after it was read, and between two claims keeps the later one', () => {
    expect(pairs(buildTimeTable([sample(10, 100), sample(20, 1e15), sample(30, 300)], NOW))).toEqual([
      [10, 100],
      [30, 300],
    ]);
    expect(pairs(buildTimeTable([sample(10, 100), sample(20, 900), sample(30, 300)]))).toEqual([
      [10, 100],
      [20, 900],
    ]);
  });

  it('cannot tell a lie at the end that agrees with the order', () => {
    expect(pairs(buildTimeTable([sample(10, 100), sample(20, 900)], NOW))).toEqual([
      [10, 100],
      [20, 900],
    ]);
  });

  it('is empty without samples', () => {
    expect(buildTimeTable([])).toEqual([]);
  });

  it("counts one writer's samples in a row as one claim, however many", () => {
    const honest = [1, 2, 3, 4].map((i) => sample(i * 10, 1000 + i, i % 2 === 0 ? 'ann' : 'ben'));
    // A move: hundreds of copies of old posts at the newest cursors, oldest first, all by one writer.
    const copies = Array.from({ length: 300 }, (_, i) => sample(100 + i, i, 'mover'));

    expect(pairs(buildTimeTable([...honest, ...copies]))).toEqual(pairs(honest));
  });

  it('keeps the run that ends later between two writers who disagree, however many samples the other has', () => {
    const run = Array.from({ length: 19 }, (_, i) => sample(10 + i, 1000 + i, 'ann'));
    const copies = Array.from({ length: 66 }, (_, i) => sample(100 + i, i, 'mover'));

    expect(pairs(buildTimeTable([...run, sample(50, 5, 'mover')]))).toEqual(pairs(run));
    expect(pairs(buildTimeTable([...run, ...copies]))).toEqual(pairs(run));
  });

  it('keeps every sample of a run that agrees, the more samples winning between chains as late', () => {
    const run = Array.from({ length: 10 }, (_, i) => sample(10 + i, 1000, 'ann'));

    expect(pairs(buildTimeTable(run))).toEqual(pairs(run));
  });

  it('keeps a run of one writer that agrees with everyone, however long', () => {
    const run = Array.from({ length: 50 }, (_, i) => sample(10 + i, 1000 + i, 'ann'));
    const table = buildTimeTable([sample(1, 900), ...run, sample(100, 2000), sample(101, 3, 'liar')]);

    expect(table).toHaveLength(52);
  });
});

describe('cursorAt', () => {
  const table = buildTimeTable([sample(10, 1000), sample(20, 2000), sample(40, 2000), sample(50, 3000)]);

  it('interpolates between the newest older sample and the next one', () => {
    expect(cursorAt(table, 1500)).toBe(BigInt(15));
    expect(cursorAt(table, 2000)).toBe(BigInt(20));
    expect(cursorAt(table, 2700)).toBe(BigInt(47));
  });

  it('places a time past the newest sample at it, and knows nothing below the oldest', () => {
    expect(cursorAt(table, 9000)).toBe(BigInt(50));
    expect(cursorAt(table, 1000)).toBeNull();
    expect(cursorAt([], 1)).toBeNull();
  });
});

describe('mergeClock', () => {
  const HOUR = 60 * 60 * 1000;

  it('keeps the first sample of each hour and the last one', () => {
    const merged = mergeClock(
      [sample(10, 0), sample(20, HOUR / 2)],
      [sample(30, HOUR), sample(40, HOUR + 1), sample(50, HOUR + 2)],
    );

    expect(pairs(merged)).toEqual([
      [10, 0],
      [30, HOUR],
      [50, HOUR + 2],
    ]);
  });

  it('drops what the merged table refuses and keeps the newest samples only', () => {
    const many = Array.from({ length: 2500 }, (_, i) => sample(i + 1, i * HOUR));
    const merged = mergeClock(many, [sample(5000, 3)]);

    expect(merged).toHaveLength(2000);
    expect(merged[merged.length - 1].cursor).toBe(BigInt(2500));
  });
});

describe('estimateMs', () => {
  const table = buildTimeTable([sample(10, 1000), sample(20, 2000), sample(40, 2000), sample(50, 3000)]);

  it('interpolates between the nearest samples and hits a sample exactly', () => {
    expect(estimateMs(table, BigInt(15))).toBe(1500);
    expect(estimateMs(table, BigInt(20))).toBe(2000);
    expect(estimateMs(table, BigInt(30))).toBe(2000);
    expect(estimateMs(table, BigInt(47))).toBe(2700);
  });

  it('clamps to the nearest sample past either end', () => {
    expect(estimateMs(table, BigInt(1))).toBe(1000);
    expect(estimateMs(table, BigInt(10))).toBe(1000);
    expect(estimateMs(table, BigInt(99))).toBe(3000);
  });

  it('knows nothing without samples', () => {
    expect(estimateMs([], BigInt(1))).toBeNull();
  });
});
