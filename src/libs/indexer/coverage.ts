import { assertRange, compareCursors } from './cursor';
import type { Coverage, Cursor, Range, Run } from './indexer.types';

/** Sorts the ranges and merges overlapping and adjacent ones: `(a, b]` and `(b, c]` become `(a, c]`. */
export function normalizeCoverage(ranges: readonly Range[]): Coverage {
  for (const range of ranges) assertRange(range.tail, range.head);
  const sorted = [...ranges].sort((a, b) => compareCursors(a.tail, b.tail));
  const coverage: Coverage = [];
  for (const { tail, head } of sorted) {
    const last = coverage[coverage.length - 1];
    if (last !== undefined && tail <= last.head) {
      if (head > last.head) last.head = head;
    } else {
      coverage.push({ tail, head });
    }
  }
  return coverage;
}

export function addRange(coverage: readonly Range[], range: Range): Coverage {
  return normalizeCoverage([...coverage, range]);
}

export function covers(coverage: readonly Range[], cursor: Cursor): boolean {
  return coverage.some(({ tail, head }) => tail < cursor && cursor <= head);
}

/** The uncovered ranges strictly between the lowest tail and the highest head. */
export function gaps(coverage: readonly Range[]): Coverage {
  const normalized = normalizeCoverage(coverage);
  return normalized.slice(1).map((range, i) => ({ tail: normalized[i].head, head: range.tail }));
}

export function coverageOfRuns<D>(runs: readonly Run<D>[]): Coverage {
  return normalizeCoverage(runs);
}
