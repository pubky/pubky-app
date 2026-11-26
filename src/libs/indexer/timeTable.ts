import type { Cursor } from './indexer.types';

/** One write of a homeserver whose time is known: its cursor, the time its path claims, and who wrote it. */
export interface TimeSample {
  cursor: Cursor;
  ms: number;
  writer: string;
}

const HOUR_MS = 60 * 60 * 1000;
/** Samples a stored clock keeps, the newest: at one an hour, far more than any window. */
const CLOCK_MAX_SAMPLES = 2000;

const compareSamples = (a: TimeSample, b: TimeSample): number =>
  a.cursor < b.cursor ? -1 : a.cursor > b.cursor ? 1 : a.ms - b.ms;

/** Prefix maximum over time ranks of the chains' scores; on a tie the chain ending at the later time wins. */
function bestTree(size: number, sorted: readonly TimeSample[], score: readonly number[]) {
  const tree = new Array<number>(size + 1).fill(-1);
  const better = (i: number, j: number) =>
    j === -1 || score[i] > score[j] || (score[i] === score[j] && sorted[i].ms > sorted[j].ms);
  return {
    best(rank: number): number {
      let found = -1;
      for (let at = rank + 1; at > 0; at -= at & -at) if (tree[at] !== -1 && better(tree[at], found)) found = tree[at];
      return found;
    },
    add(rank: number, i: number, touched?: number[]) {
      for (let at = rank + 1; at <= size; at += at & -at) {
        if (!better(i, tree[at])) continue;
        tree[at] = i;
        touched?.push(at);
      }
    },
    clear(touched: readonly number[]) {
      for (const at of touched) tree[at] = -1;
    },
  };
}

/**
 * The samples of one homeserver sorted by cursor, keeping the subsequence whose time never decreases that most
 * writers agree on. Cursors grow with time, so a sample that breaks the order lied about its time: a backdated or
 * future-dated id, a version written again later, a copy of an old post. One writer's samples in a row, with no other
 * writer's between them, count as one claim: a burst of edits or a move of hundreds of old posts comes from one clock,
 * so it weighs as much as one write of anyone else. Between as many claims the table that ends later wins, since
 * backdating a burst is common and dating one ahead is not, and assuming the log newer only makes a window read
 * more; then the one with more samples. A sample dated after `nowMs`, when it was read at the latest, is a lie.
 * Any other lie at either end of the table cannot be told from the truth.
 */
export function buildTimeTable(samples: Iterable<TimeSample>, nowMs = Number.POSITIVE_INFINITY): TimeSample[] {
  const sorted: TimeSample[] = [];
  // One cursor is one event.
  for (const sample of [...samples].sort(compareSamples)) {
    if (sample.ms > nowMs) continue;
    if (sorted.length === 0 || sorted[sorted.length - 1].cursor !== sample.cursor) sorted.push(sample);
  }
  const times = [...new Set(sorted.map(({ ms }) => ms))].sort((a, b) => a - b);
  const rankOf = new Map(times.map((ms, rank) => [ms, rank]));
  const rank = (i: number) => rankOf.get(sorted[i].ms) ?? 0;
  // Claims first, then samples.
  const claim = sorted.length + 1;
  const score: number[] = [];
  const previous: number[] = [];
  const all = bestTree(times.length, sorted, score);
  const run = bestTree(times.length, sorted, score);
  for (let start = 0; start < sorted.length;) {
    let stop = start;
    while (stop < sorted.length && sorted[stop].writer === sorted[start].writer) stop += 1;
    // A sample extends a chain within its run at no new claim, or any chain from before the run as a new one.
    const touched: number[] = [];
    for (let i = start; i < stop; i += 1) {
      const before = all.best(rank(i));
      const within = run.best(rank(i));
      const fromBefore = (before === -1 ? 0 : score[before]) + claim + 1;
      const fromWithin = within === -1 ? -1 : score[within] + 1;
      score[i] = Math.max(fromBefore, fromWithin);
      previous[i] = fromWithin > fromBefore ? within : before;
      run.add(rank(i), i, touched);
    }
    run.clear(touched);
    for (let i = start; i < stop; i += 1) all.add(rank(i), i);
    start = stop;
  }
  let last = -1;
  for (let i = 0; i < sorted.length; i += 1) {
    const claims = Math.floor(score[i] / claim);
    const lastClaims = last === -1 ? -1 : Math.floor(score[last] / claim);
    const later =
      last !== -1 &&
      claims === lastClaims &&
      (sorted[i].ms > sorted[last].ms || (sorted[i].ms === sorted[last].ms && score[i] > score[last]));
    if (claims > lastClaims || later) last = i;
  }
  const kept: TimeSample[] = [];
  for (let i = last; i !== -1; i = previous[i]) kept.push(sorted[i]);
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

/**
 * The cursor the table places at `ms`, the inverse of `estimateMs`: interpolated between the newest sample older
 * than `ms` and the next one, the newest sample's cursor when every sample is older. `null` while no sample is older:
 * what was written at `ms` may then lie below everything the table knows.
 */
export function cursorAt(table: readonly TimeSample[], ms: number): Cursor | null {
  let low = 0;
  let high = table.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (table[middle].ms < ms) low = middle + 1;
    else high = middle;
  }
  if (low === 0) return null;
  const below = table[low - 1];
  if (low === table.length) return below.cursor;
  const above = table[low];
  const fraction = (ms - below.ms) / (above.ms - below.ms);
  return below.cursor + BigInt(Math.floor(Number(above.cursor - below.cursor) * fraction));
}

/**
 * The table of a stored clock and new samples, thinned to the first sample of each hour, the last kept too, and to
 * the newest `CLOCK_MAX_SAMPLES`: enough to place a cursor near the window to the hour, small enough to store.
 */
export function mergeClock(stored: readonly TimeSample[], added: readonly TimeSample[]): TimeSample[] {
  // No time of reading here: whoever reads the clock drops what it dates after then.
  const table = buildTimeTable([...stored, ...added]);
  const hourOf = (i: number) => Math.floor(table[i].ms / HOUR_MS);
  return table
    .filter((_, i) => i === 0 || i === table.length - 1 || hourOf(i) !== hourOf(i - 1))
    .slice(-CLOCK_MAX_SAMPLES);
}
