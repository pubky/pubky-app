import { describe, expect, it } from 'vitest';
import type { Run } from './indexer.types';
import { createMemoryStore } from './memoryStore';
import { holds, knownOf, unknownRuns, withApplied } from './savedIndex.known';
import { c, META, type Payload, rec, runWith } from './store.contract';

const bare = (path: string, cursor: number) => ({ kind: 'record' as const, path, cursor: c(cursor) });

/** A store holding the batches of runs of META, and what is known once the first was applied. */
async function sharedAfter(runs: Run<Payload>[][]) {
  const store = createMemoryStore<Payload>();
  await store.patchHomeserverState('hs1', { epoch: 'c1.a' });
  await store.applyRuns(runs[0]);
  const known = knownOf(await store.exportScopes([META], { runs: false }), META);
  for (const more of runs.slice(1)) await store.applyRuns(more);
  const read = await store.exportScopes([META], { runs: true });
  return { store, known, read };
}

describe('what a writer knows the saved files hold', () => {
  it('lacks only the part above the known head where only the top grew', async () => {
    const { known, read } = await sharedAfter([[runWith(0, 10, [rec('a', 4)])], [runWith(10, 20, [rec('b', 15)])]]);

    expect(holds(known, read, META)).toBe(false);
    expect(unknownRuns(known, read, META).runs).toEqual([runWith(10, 20, [rec('b', 15)])]);
  });

  it('lacks a whole range read below the known one, which alone would not be a valid run', async () => {
    const { known, read } = await sharedAfter([[runWith(10, 20, [rec('b', 15)])], [runWith(0, 10, [rec('a', 4)])]]);

    expect(unknownRuns(known, read, META).runs).toEqual([runWith(0, 20, [rec('a', 4), rec('b', 15)])]);
  });

  it('lacks data set on a known record as the run of its one event', async () => {
    const { store, known } = await sharedAfter([[runWith(0, 10, [bare('a', 4), rec('b', 7)])]]);
    await store.commit({ recordData: [{ scope: META, path: 'a', cursor: c(4), data: { n: 4 } }] });
    const read = await store.exportScopes([META], { runs: true });

    expect(unknownRuns(known, read, META).runs).toEqual([runWith(3, 4, [rec('a', 4)])]);
  });

  it('lacks everything read from another log, and nothing once what files brought is applied', async () => {
    const { store, read } = await sharedAfter([[runWith(0, 10, [rec('a', 4)])]]);
    const other = { epoch: 'r9.z', stamp: 99, also: [], ranges: [['0', '10']] as Array<[string, string]> };

    expect(unknownRuns(other, read, META).runs).toEqual([runWith(0, 10, [rec('a', 4)])]);
    const stamp = (await store.commit({ applyRuns: [runWith(10, 12, [rec('c', 11)])] })) ?? -1;
    const applied = withApplied(knownOf(read, META), 'c1.a', stamp, [{ tail: c(10), head: c(12) }]);
    const after = await store.exportScopes([META], { runs: true });
    const unknown = unknownRuns(applied, after, META);
    expect(unknown.runs).toEqual([]);
    expect(unknown.compacted).toEqual({ ...applied, stamp, also: [] });
    expect(holds(unknown.compacted, after, META)).toBe(true);
  });
});
