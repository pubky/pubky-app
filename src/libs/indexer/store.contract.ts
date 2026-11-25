import { afterEach, describe, expect, it } from 'vitest';
import { InvalidIndexInputError } from './indexer.errors';
import type { Run, RunMeta } from './indexer.types';
import { comparePaths } from './run';
import { scopeId } from './store.helpers';
import { EMPTY_HOMESERVER_STATE, type IndexStore, type ScopeKey, type StoreBatch } from './store.types';

// Test-only: the behavior every `IndexStore` must have, registered once per implementation.

export interface Payload {
  n: number;
}

export const META: RunMeta = { author: 'alice', homeserver: 'hs1', group: 'posts' };
export const c = (n: number) => BigInt(n);
export const runOf = (tail: number, head: number, meta: RunMeta = META): Run<Payload> => ({
  ...meta,
  tail: c(tail),
  head: c(head),
  entries: [{ kind: 'record', path: 'a', cursor: c(head), data: { n: head } }],
});

/** Scopes in a fixed order: the interface does not promise one. */
export const sortedScopes = (scopes: ScopeKey[]) => [...scopes].sort((a, b) => comparePaths(scopeId(a), scopeId(b)));

/**
 * Registers the contract suite for one store implementation. `open` makes a fresh, empty store for each test;
 * `dispose` releases it afterwards.
 */
export function describeIndexStoreContract<S extends IndexStore<Payload>>(
  name: string,
  open: () => S,
  dispose?: (store: S) => Promise<void>,
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

    it('reads nothing from an empty store', async () => {
      const store = fresh();

      expect(await store.readRuns(META)).toEqual([]);
      expect(await store.listScopes()).toEqual([]);
      expect(await store.readUserHomeserver('alice')).toBeNull();
      expect(await store.readHomeserverState('hs1')).toEqual(EMPTY_HOMESERVER_STATE);
      expect(await store.readScopeMembers('alice')).toEqual(new Map());
    });

    it('appends runs per scope, in order, and lists the scopes', async () => {
      const store = fresh();
      const other: RunMeta = { ...META, group: 'graph' };

      await store.appendRuns([runOf(0, 2), runOf(0, 1, other)]);
      await store.appendRuns([runOf(2, 4)]);

      expect(await store.readRuns(META)).toEqual([runOf(0, 2), runOf(2, 4)]);
      expect(await store.readRuns(other)).toEqual([runOf(0, 1, other)]);
      expect(sortedScopes(await store.listScopes())).toEqual(sortedScopes([META, other]));
    });

    it('replaces the runs of a scope and removes it when the replacement is empty', async () => {
      const store = fresh();
      const other: RunMeta = { ...META, author: 'bob' };
      await store.appendRuns([runOf(0, 2), runOf(2, 4), runOf(0, 3, other)]);

      await store.replaceRuns(META, [runOf(0, 4)]);
      expect(await store.readRuns(META)).toEqual([runOf(0, 4)]);

      await store.replaceRuns(META, []);
      expect(await store.readRuns(META)).toEqual([]);
      expect(await store.listScopes()).toEqual([other]);
      expect(await store.readRuns(other)).toEqual([runOf(0, 3, other)]);
    });

    it('keeps scopes apart by author, homeserver and group', async () => {
      const store = fresh();
      const scopes: RunMeta[] = [
        META,
        { ...META, author: 'bob' },
        { ...META, homeserver: 'hs2' },
        { ...META, group: 'graph' },
      ];
      await store.appendRuns(scopes.map((scope, i) => runOf(0, i + 1, scope)));

      for (const [i, scope] of scopes.entries()) {
        expect(await store.readRuns(scope)).toEqual([runOf(0, i + 1, scope)]);
      }
      expect(sortedScopes(await store.listScopes())).toEqual(sortedScopes(scopes));
    });

    it('deletes every run of a homeserver only', async () => {
      const store = fresh();
      const elsewhere: RunMeta = { ...META, homeserver: 'hs2' };
      await store.appendRuns([runOf(0, 2), runOf(0, 2, { ...META, author: 'bob' }), runOf(0, 3, elsewhere)]);

      await store.deleteHomeserverRuns('hs1');

      expect(await store.listScopes()).toEqual([elsewhere]);
      expect(await store.readRuns(elsewhere)).toEqual([runOf(0, 3, elsewhere)]);
    });

    it('copies runs on the way in and out', async () => {
      const store = fresh();
      const run = runOf(0, 2);
      await store.appendRuns([run]);

      run.entries.length = 0;
      const read = await store.readRuns(META);
      read[0].entries.length = 0;
      read[0].head = c(9);

      expect(await store.readRuns(META)).toEqual([runOf(0, 2)]);
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

    it('rejects an invalid run or a run of another scope, changing nothing', async () => {
      const store = fresh();

      await expect(store.commit({ appendRuns: [runOf(0, 2), runOf(3, 3)] })).rejects.toThrow(InvalidIndexInputError);
      await expect(store.appendRuns([runOf(0, 2), runOf(3, 3)])).rejects.toThrow(InvalidIndexInputError);
      await expect(store.replaceRuns(META, [runOf(0, 2, { ...META, author: 'bob' })])).rejects.toThrow(
        InvalidIndexInputError,
      );
      expect(await store.listScopes()).toEqual([]);
    });

    it('applies a commit whole or not at all', async () => {
      const store = fresh();
      await store.appendRuns([runOf(0, 2)]);
      const batch: StoreBatch<Payload> = {
        deleteHomeservers: ['hs1'],
        userHomeservers: [{ user: 'alice', value: { homeserver: 'hs1', resolvedAt: 5 } }],
        homeserverStates: [{ homeserver: 'hs1', patch: { failure: { failures: 1, retryAt: 60 } } }],
        scopeMembers: [{ seed: 'alice', members: new Map([['alice', 0]]) }],
      };

      await expect(store.commit({ ...batch, appendRuns: [runOf(2, 4), runOf(5, 5)] })).rejects.toThrow(
        InvalidIndexInputError,
      );
      expect(await store.readRuns(META)).toEqual([runOf(0, 2)]);
      expect(await store.readUserHomeserver('alice')).toBeNull();
      expect(await store.readHomeserverState('hs1')).toEqual(EMPTY_HOMESERVER_STATE);
      expect(await store.readScopeMembers('alice')).toEqual(new Map());

      await store.commit({ ...batch, appendRuns: [runOf(2, 4)] });
      expect(await store.readRuns(META)).toEqual([runOf(2, 4)]);
      expect(await store.readUserHomeserver('alice')).toEqual({ homeserver: 'hs1', resolvedAt: 5 });
      expect((await store.readHomeserverState('hs1')).failure).toEqual({ failures: 1, retryAt: 60 });
      expect(await store.readScopeMembers('alice')).toEqual(new Map([['alice', 0]]));
    });

    it('applies a commit in order: deletions, replacements, then appends', async () => {
      const store = fresh();
      await store.appendRuns([runOf(0, 2)]);

      await store.commit({
        deleteHomeservers: ['hs1'],
        replaceRuns: [{ scope: META, runs: [runOf(0, 3)] }],
        appendRuns: [runOf(3, 5)],
      });

      expect(await store.readRuns(META)).toEqual([runOf(0, 3), runOf(3, 5)]);
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
  });
}
