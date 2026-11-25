// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildTimeTable, estimateMs, type TimeSample } from './timeTable';

const sample = (cursor: number, ms: number): TimeSample => ({ cursor: BigInt(cursor), ms });
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
    const table = buildTimeTable([
      sample(10, 100),
      sample(20, 200),
      sample(25, 1),
      sample(30, 200),
      sample(35, 1e15),
      sample(40, 400),
    ]);

    expect(pairs(table)).toEqual([
      [10, 100],
      [20, 200],
      [30, 200],
      [40, 400],
    ]);
  });

  it('drops a future-dated sample once a later honest one arrives, but cannot tell one at the end', () => {
    expect(pairs(buildTimeTable([sample(10, 100), sample(20, 1e15), sample(30, 300)]))).toEqual([
      [10, 100],
      [30, 300],
    ]);
    expect(pairs(buildTimeTable([sample(10, 100), sample(20, 1e15)]))).toEqual([
      [10, 100],
      [20, 1e15],
    ]);
  });

  it('is empty without samples', () => {
    expect(buildTimeTable([])).toEqual([]);
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
