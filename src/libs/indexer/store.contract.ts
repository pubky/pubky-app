import { afterEach, describe, expect, it } from 'vitest';
import { InvalidIndexInputError } from './indexer.errors';
import type { Cursor, Entry, Run, RunMeta } from './indexer.types';
import { compactRuns, evictBelow, mergeRuns } from './merge';
import { GENERATED_META, int, randomCase, seeded, shuffled } from './merge.generators';
import { readScopesOf } from './readScopes';
import { comparePaths } from './run';
import { scopeId } from './store.helpers';
import { EMPTY_HOMESERVER_STATE, type IndexStore, type ScopeKey, type StoreBatch } from './store.types';

// Test-only: the behavior every `IndexStore` must have, registered once per implementation.

export interface Payload {
  n: number;
}

export const META: RunMeta = { author: 'alice', homeserver: 'hs1', group: 'posts' };
export const c = (n: number) => BigInt(n);
export const rec = (path: string, cursor: number, hash?: string): Entry<Payload> =>
  hash === undefined
    ? { kind: 'record', path, cursor: c(cursor), data: { n: cursor } }
    : { kind: 'record', path, cursor: c(cursor), hash, data: { n: cursor } };
export const tomb = (path: string, cursor: number): Entry<Payload> => ({ kind: 'tombstone', path, cursor: c(cursor) });
export const runWith = (tail: number, head: number, entries: Entry<Payload>[], meta: RunMeta = META): Run<Payload> => ({
  ...meta,
  tail: c(tail),
  head: c(head),
  entries,
});
/** A run whose only entry writes path `a` at its head. */
export const runOf = (tail: number, head: number, meta: RunMeta = META): Run<Payload> =>
  runWith(tail, head, [rec('a', head)], meta);

/** Scopes in a fixed order: the interface does not promise one. */
export const sortedScopes = (scopes: ScopeKey[]) => [...scopes].sort((a, b) => comparePaths(scopeId(a), scopeId(b)));

export interface ContractOptions {
  /** Random histories the equivalence property checks. */
  seeds: number;
}

/**
 * Registers the contract suite for one store implementation. `open` makes a fresh, empty store for each test;
 * `dispose` releases it afterwards.
 */
export function describeIndexStoreContract<S extends IndexStore<Payload>>(
  name: string,
  open: () => S,
  dispose?: (store: S) => Promise<void>,
  options: ContractOptions = { seeds: 200 },
): void {
  describe(`${name} store contract`, () => {
    const opened: S[] = [];
    const fresh = () => {
      const store = open();
      opened.push(store);
      return store;
    };

    afterEach(async () => {
      for (const store of opened.splice(0)) await dispose?.(store);
    });

    /** Asserts the stored scope is exactly what the pure functions make of `runs`. */
    async function expectScopeOf(store: S, scope: ScopeKey, runs: Run<Payload>[], label = '') {
      expect(await store.readScope(scope), label).toEqual(mergeRuns(runs));
      expect(await store.readCoverage(scope), label).toEqual(mergeRuns(runs).coverage);
      expect(await store.exportRuns(scope), label).toEqual(compactRuns(runs));
    }

    it('reads nothing from an empty store', async () => {
      const store = fresh();

      await expectScopeOf(store, META, []);
      expect(await store.listScopes()).toEqual([]);
      expect(await store.readUserHomeserver('alice')).toBeNull();
      expect(await store.readHomeserverState('hs1')).toEqual(EMPTY_HOMESERVER_STATE);
      expect(await store.readScopeMembers('alice')).toEqual(new Map());
    });

    it('merges runs into their scopes and lists the scopes', async () => {
      const store = fresh();
      const other: RunMeta = { ...META, group: 'graph' };

      await store.applyRuns([runOf(0, 2), runOf(0, 1, other)]);
      await store.applyRuns([runOf(2, 4)]);

      await expectScopeOf(store, META, [runOf(0, 2), runOf(2, 4)]);
      expect(await store.exportRuns(META)).toEqual([runOf(0, 4)]);
      await expectScopeOf(store, other, [runOf(0, 1, other)]);
      expect(sortedScopes(await store.listScopes())).toEqual(sortedScopes([META, other]));
    });

    it('reads many scopes at once as it reads each, in the order asked, sharing nothing', async () => {
      const store = fresh();
      const other: RunMeta = { ...META, author: 'bob' };
      const missing: RunMeta = { ...META, group: 'graph' };
      const runs = [runWith(0, 10, [rec('a', 4), tomb('b', 7)]), runWith(20, 30, [rec('c', 25)])];
      await store.applyRuns([...runs, runOf(0, 3, other)]);

      const read = await readScopesOf(store, [other, missing, META, other]);

      expect(read).toEqual([
        mergeRuns([runOf(0, 3, other)]),
        mergeRuns([]),
        mergeRuns(runs),
        mergeRuns([runOf(0, 3, other)]),
      ]);
      read[0].entries.clear();
      read[0].coverage.length = 0;
      expect(read[3]).toEqual(mergeRuns([runOf(0, 3, other)]));
      expect(await readScopesOf(store, [])).toEqual([]);
    });

    it('keeps the highest cursor per path, tombstones included, and serves only above a gap', async () => {
      const store = fresh();
      const runs = [
        runWith(0, 10, [rec('a', 4), rec('b', 5)]),
        runWith(20, 30, [tomb('a', 25), rec('c', 22)]),
        runWith(10, 20, [rec('a', 15), rec('b', 12)]),
      ];

      await store.applyRuns(runs.slice(0, 2));
      const split = await store.readScope(META);
      expect(split.coverage).toEqual([
        { tail: c(0), head: c(10) },
        { tail: c(20), head: c(30) },
      ]);
      expect([...split.live.keys()]).toEqual(['c']);
      expect(await store.exportRuns(META)).toHaveLength(2);
      await expectScopeOf(store, META, runs.slice(0, 2));

      await store.applyRuns(runs.slice(2));
      const joined = await store.readScope(META);
      expect(joined.entries.get('a')).toEqual(tomb('a', 25));
      expect([...joined.live.keys()]).toEqual(['b', 'c']);
      await expectScopeOf(store, META, runs);
    });

    it('rejects a run that disagrees with a stored event, changing nothing', async () => {
      const store = fresh();
      const first = runWith(0, 10, [rec('a', 5, 'h1')]);
      await store.applyRuns([first]);

      // The first run of the batch applies cleanly; the throw must undo it too.
      for (const conflicting of [tomb('a', 5), rec('a', 5, 'h2')]) {
        const batch: StoreBatch<Payload> = {
          applyRuns: [runWith(10, 12, [rec('b', 12)]), runWith(0, 10, [conflicting])],
          userHomeservers: [{ user: 'alice', value: { homeserver: 'hs1', resolvedAt: 5 } }],
        };
        await expect(store.commit(batch)).rejects.toThrow(InvalidIndexInputError);
      }
      await expectScopeOf(store, META, [first]);
      expect(await store.readUserHomeserver('alice')).toBeNull();

      await store.applyRuns([runWith(0, 10, [rec('a', 5)])]);
      await expectScopeOf(store, META, [first]);
    });

    it('keeps scopes apart by author, homeserver and group', async () => {
      const store = fresh();
      const scopes: RunMeta[] = [
        META,
        { ...META, author: 'bob' },
        { ...META, homeserver: 'hs2' },
        { ...META, group: 'graph' },
      ];
      await store.applyRuns(scopes.map((scope, i) => runOf(0, i + 1, scope)));

      for (const [i, scope] of scopes.entries()) await expectScopeOf(store, scope, [runOf(0, i + 1, scope)]);
      expect(sortedScopes(await store.listScopes())).toEqual(sortedScopes(scopes));
    });

    it('deletes every scope of a homeserver only', async () => {
      const store = fresh();
      const elsewhere: RunMeta = { ...META, homeserver: 'hs2' };
      await store.applyRuns([runOf(0, 2), runOf(0, 2, { ...META, author: 'bob' }), runOf(0, 3, elsewhere)]);

      await store.deleteHomeserver('hs1');

      expect(await store.listScopes()).toEqual([elsewhere]);
      await expectScopeOf(store, META, []);
      await expectScopeOf(store, elsewhere, [runOf(0, 3, elsewhere)]);
    });

    it('sets record data only on the record still stored at that cursor, as its one-event run would', async () => {
      const store = fresh();
      const bare = (path: string, cursor: number): Entry<Payload> => ({ kind: 'record', path, cursor: c(cursor) });
      const elsewhere: RunMeta = { ...META, homeserver: 'hs2' };
      const runs = [
        runWith(0, 10, [bare('a', 4), tomb('b', 7), bare('d', 9)]),
        runWith(0, 3, [bare('a', 3)], elsewhere),
      ];
      await store.applyRuns(runs);
      const fill = (scope: RunMeta, path: string, cursor: number) => ({
        scope,
        path,
        cursor: c(cursor),
        data: { n: cursor },
      });

      await store.commit({
        // The record at its cursor; a tombstone; an older cursor of a path; a path and a scope never stored.
        recordData: [
          fill(META, 'a', 4),
          fill(META, 'b', 7),
          fill(META, 'd', 8),
          fill(META, 'e', 5),
          fill({ ...META, author: 'bob' }, 'a', 4),
        ],
      });

      await expectScopeOf(store, META, [runs[0], runWith(3, 4, [rec('a', 4)])]);
      expect(sortedScopes(await store.listScopes())).toEqual(sortedScopes([META, elsewhere]));
      await store.deleteHomeserver('hs2');
      await store.commit({ recordData: [fill(elsewhere, 'a', 3)] });
      expect(await store.listScopes()).toEqual([META]);
      await expect(store.commit({ recordData: [fill(META, 'a', -1)] })).rejects.toThrow(InvalidIndexInputError);
    });

    it('evicts at or below a cutoff as the pure eviction does, and drops a scope evicted whole', async () => {
      const store = fresh();
      const other: RunMeta = { ...META, author: 'bob' };
      const runs = [runWith(0, 10, [rec('a', 4), tomb('b', 10)]), runWith(15, 30, [rec('a', 20), rec('c', 16)])];
      await store.applyRuns([...runs, runOf(0, 3, other)]);

      await store.evictBelow(META, c(16));

      const evicted = evictBelow(compactRuns(runs), c(16));
      expect(evicted).toEqual([runWith(16, 30, [rec('a', 20)])]);
      await expectScopeOf(store, META, evicted);
      await expectScopeOf(store, other, [runOf(0, 3, other)]);

      await store.evictBelow(META, c(30));
      await expectScopeOf(store, META, []);
      expect(await store.listScopes()).toEqual([other]);
      await expect(store.evictBelow(other, c(-1))).rejects.toThrow(InvalidIndexInputError);
      await expectScopeOf(store, other, [runOf(0, 3, other)]);
    });

    it('applies the same run twice without changing anything', async () => {
      const store = fresh();
      const runs = [runWith(0, 10, [rec('a', 4), tomb('b', 7)]), runWith(20, 30, [rec('b', 25)])];
      await store.applyRuns(runs);
      const scope = await store.readScope(META);
      const exported = await store.exportRuns(META);

      await store.applyRuns(runs);
      await store.applyRuns(exported);

      expect(await store.readScope(META)).toEqual(scope);
      expect(await store.exportRuns(META)).toEqual(exported);
    });

    it('copies runs on the way in and out', async () => {
      const store = fresh();
      const run = runWith(0, 2, [rec('a', 1), tomb('b', 2)]);
      await store.applyRuns([run]);

      run.entries.length = 0;
      run.head = c(9);
      const read = await store.readScope(META);
      read.entries.clear();
      read.live.clear();
      read.coverage.length = 0;
      (await store.readCoverage(META)).length = 0;
      const exported = await store.exportRuns(META);
      exported[0].entries.length = 0;
      exported[0].head = c(9);

      await expectScopeOf(store, META, [runWith(0, 2, [rec('a', 1), tomb('b', 2)])]);
    });

    it('copies every other value on the way in and out', async () => {
      const store = fresh();
      const user = { homeserver: 'hs1', resolvedAt: 5 };
      const highWater = { cursor: c(9), author: 'alice' };
      const members = new Map([['alice', 0]]);
      await store.writeUserHomeserver('alice', user);
      await store.patchHomeserverState('hs1', { highWater });
      await store.writeScopeMembers('alice', members);

      user.resolvedAt = 6;
      highWater.cursor = c(10);
      members.set('bob', 1);
      const readUser = await store.readUserHomeserver('alice');
      if (readUser !== null) readUser.resolvedAt = 7;
      const readState = await store.readHomeserverState('hs1');
      if (readState.highWater !== null) readState.highWater.cursor = c(11);
      readState.failure = { failures: 1, retryAt: 1 };
      (await store.readScopeMembers('alice')).set('carol', 2);

      expect(await store.readUserHomeserver('alice')).toEqual({ homeserver: 'hs1', resolvedAt: 5 });
      expect(await store.readHomeserverState('hs1')).toEqual({
        ...EMPTY_HOMESERVER_STATE,
        highWater: { cursor: c(9), author: 'alice' },
      });
      expect(await store.readScopeMembers('alice')).toEqual(new Map([['alice', 0]]));
    });

    it('rejects an invalid run, changing nothing', async () => {
      const store = fresh();

      await expect(store.commit({ applyRuns: [runOf(0, 2), runOf(3, 3)] })).rejects.toThrow(InvalidIndexInputError);
      await expect(store.applyRuns([runOf(0, 2), runWith(0, 2, [rec('a', 3)])])).rejects.toThrow(
        InvalidIndexInputError,
      );
      expect(await store.listScopes()).toEqual([]);
    });

    it('applies a commit whole or not at all', async () => {
      const store = fresh();
      await store.applyRuns([runOf(0, 2)]);
      const batch: StoreBatch<Payload> = {
        deleteHomeservers: ['hs1'],
        userHomeservers: [{ user: 'alice', value: { homeserver: 'hs1', resolvedAt: 5 } }],
        homeserverStates: [{ homeserver: 'hs1', patch: { failure: { failures: 1, retryAt: 60 } } }],
        scopeMembers: [{ seed: 'alice', members: new Map([['alice', 0]]) }],
      };

      await expect(store.commit({ ...batch, applyRuns: [runOf(2, 4), runOf(5, 5)] })).rejects.toThrow(
        InvalidIndexInputError,
      );
      await expectScopeOf(store, META, [runOf(0, 2)]);
      expect(await store.readUserHomeserver('alice')).toBeNull();
      expect(await store.readHomeserverState('hs1')).toEqual(EMPTY_HOMESERVER_STATE);
      expect(await store.readScopeMembers('alice')).toEqual(new Map());

      await store.commit({ ...batch, applyRuns: [runOf(2, 4)] });
      await expectScopeOf(store, META, [runOf(2, 4)]);
      expect(await store.readUserHomeserver('alice')).toEqual({ homeserver: 'hs1', resolvedAt: 5 });
      expect((await store.readHomeserverState('hs1')).failure).toEqual({ failures: 1, retryAt: 60 });
      expect(await store.readScopeMembers('alice')).toEqual(new Map([['alice', 0]]));
    });

    it('applies a commit in order: deletions, evictions, then runs', async () => {
      const store = fresh();
      await store.applyRuns([runOf(0, 2)]);

      await store.commit({
        deleteHomeservers: ['hs1'],
        evictions: [{ scope: META, cutoff: c(3) }],
        applyRuns: [runOf(2, 5)],
      });

      await expectScopeOf(store, META, [runOf(2, 5)]);
    });

    it('keeps homeserver state fields a patch leaves out, per homeserver', async () => {
      const store = fresh();

      await store.patchHomeserverState('hs1', { highWater: { cursor: c(9), author: 'alice' } });
      await store.patchHomeserverState('hs1', { failure: { failures: 1, retryAt: 60 } });
      await store.patchHomeserverState('hs2', { windowStart: { cursor: c(3), foundAt: 7 } });
      await store.commit({
        homeserverStates: [
          { homeserver: 'hs1', patch: { failure: null } },
          { homeserver: 'hs1', patch: { windowStart: { cursor: c(4), foundAt: 8 } } },
        ],
      });

      expect(await store.readHomeserverState('hs1')).toEqual({
        highWater: { cursor: c(9), author: 'alice' },
        windowStart: { cursor: c(4), foundAt: 8 },
        failure: null,
      });
      expect(await store.readHomeserverState('hs2')).toEqual({
        ...EMPTY_HOMESERVER_STATE,
        windowStart: { cursor: c(3), foundAt: 7 },
      });
    });

    it('stores user homeservers and scope members per key, the last write winning', async () => {
      const store = fresh();

      await store.commit({
        userHomeservers: [{ user: 'bob', value: { homeserver: null, resolvedAt: 5 } }],
        scopeMembers: [{ seed: 'alice', members: new Map([['alice', 0]]) }],
      });
      await store.writeUserHomeserver('carol', { homeserver: 'hs2', resolvedAt: 6 });
      await store.writeScopeMembers(
        'alice',
        new Map([
          ['alice', 0],
          ['bob', 1],
        ]),
      );

      expect(await store.readUserHomeserver('bob')).toEqual({ homeserver: null, resolvedAt: 5 });
      expect(await store.readUserHomeserver('carol')).toEqual({ homeserver: 'hs2', resolvedAt: 6 });
      expect(await store.readUserHomeserver('dave')).toBeNull();
      expect(await store.readScopeMembers('alice')).toEqual(
        new Map([
          ['alice', 0],
          ['bob', 1],
        ]),
      );
      expect(await store.readScopeMembers('bob')).toEqual(new Map());
    });

    it(`equals the pure merge after every run of two scopes applied in any order (${options.seeds} seeds)`, async () => {
      const other: RunMeta = { ...GENERATED_META, author: 'bob' };
      for (let seed = 1; seed <= options.seeds; seed++) {
        const rng = seeded(seed);
        const store = fresh();
        const cases = [randomCase<Payload>(rng), randomCase<Payload>(rng, other)];
        const applied = new Map<ScopeKey, Run<Payload>[]>([
          [GENERATED_META, []],
          [other, []],
        ]);
        const scopeOfRun = (run: Run<Payload>) => (run.author === other.author ? other : GENERATED_META);

        for (const run of shuffled(rng, [...cases[0].runs, ...cases[1].runs])) {
          await store.applyRuns([run]);
          applied.get(scopeOfRun(run))?.push(run);
          for (const [scope, runs] of applied) await expectScopeOf(store, scope, runs, `seed ${seed}`);
        }

        const cutoff: Cursor = c(int(rng, 0, cases[0].history.n));
        const evicted = evictBelow(compactRuns(applied.get(GENERATED_META) ?? []), cutoff);
        await store.evictBelow(GENERATED_META, cutoff);
        await expectScopeOf(store, GENERATED_META, evicted, `seed ${seed} cutoff ${cutoff}`);
        await expectScopeOf(store, other, applied.get(other) ?? [], `seed ${seed}`);
      }
    }, 60_000);
  });
}
