import type { Cursor } from '../indexer.types';

/** One event of a homeserver whose write time is known: a post version's cursor and the time in its edit id. */
export interface TimeSample {
  cursor: Cursor;
  ms: number;
}

const compareSamples = (a: TimeSample, b: TimeSample): number =>
  a.cursor < b.cursor ? -1 : a.cursor > b.cursor ? 1 : a.ms - b.ms;

/**
 * The samples of one homeserver sorted by cursor, keeping the longest subsequence whose time never decreases.
 * Cursors grow with time, so a sample that breaks the order lied about its time: a backdated or future-dated id,
 * or a version written again later. A lie at either end of the table cannot be told from the truth.
 */
export function buildTimeTable(samples: Iterable<TimeSample>): TimeSample[] {
  const sorted = [...samples].sort(compareSamples);
  // Patience sorting: `ends[k]` holds the index of the lowest time ending a kept run of length k + 1.
  const ends: number[] = [];
  const previous: number[] = [];
  sorted.forEach(({ ms }, i) => {
    let low = 0;
    let high = ends.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (sorted[ends[middle]].ms <= ms) low = middle + 1;
      else high = middle;
    }
    previous[i] = low > 0 ? ends[low - 1] : -1;
    ends[low] = i;
  });
  const kept: TimeSample[] = [];
  for (let i = ends.length > 0 ? ends[ends.length - 1] : -1; i !== -1; i = previous[i]) kept.push(sorted[i]);
  return kept.reverse();
}

/**
 * The estimated time of an event at `cursor`: interpolated between the nearest samples below and above, the
 * nearest sample's time past either end, `null` without samples.
 */
export function estimateMs(table: readonly TimeSample[], cursor: Cursor): number | null {
  if (table.length === 0) return null;
  let low = 0;
  let high = table.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (table[middle].cursor < cursor) low = middle + 1;
    else high = middle;
  }
  if (low === table.length) return table[table.length - 1].ms;
  const above = table[low];
  if (low === 0 || above.cursor === cursor) return above.ms;
  const below = table[low - 1];
  const fraction = Number(cursor - below.cursor) / Number(above.cursor - below.cursor);
  return Math.round(below.ms + (above.ms - below.ms) * fraction);
}
