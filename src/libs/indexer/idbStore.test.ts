// @vitest-environment node
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_CURSOR } from './cursor';
import { createIdbStore, type IdbIndexStore } from './idbStore';
import { benchIndexStore, type BenchPayload } from './idbStore.bench';
import type { MergedRuns, Run } from './indexer.types';
import { mergeRuns } from './merge';
import { c, describeIndexStoreContract, META, type Payload, rec, runOf, runWith, tomb } from './store.contract';
import { EMPTY_HOMESERVER_STATE } from './store.types';

let databases = 0;
const nextName = () => {
  databases += 1;
  return `indexer-test-${databases}`;
};

// Fewer seeds than the memory store: every step is a few IndexedDB transactions.
describeIndexStoreContract(
  'IndexedDB',
  () => createIdbStore<Payload>(nextName()),
  (store) => store.destroy(),
  { seeds: 25 },
);

describe('createIdbStore', () => {
  const opened: IdbIndexStore<Payload>[] = [];
  const open = (name: string) => {
    const store = createIdbStore<Payload>(name);
    opened.push(store);
    return store;
  };

  afterEach(async () => {
    vi.restoreAllMocks();
    // Newest first, so no open connection blocks deleting an older handle's database.
    for (const store of opened.splice(0).reverse()) await store.destroy();
  });

  /** Counts the rows written to each object store from now on, added or put. */
  function countWrites(): (store: string) => number {
    const writes = new Map<string, number>();
    const count = (store: IDBObjectStore) => writes.set(store.name, (writes.get(store.name) ?? 0) + 1);
    const { add, put } = IDBObjectStore.prototype;
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['add']>
    ) {
      count(this);
      return add.apply(this, args);
    });
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['put']>
    ) {
      count(this);
      return put.apply(this, args);
    });
    return (store) => writes.get(store) ?? 0;
  }

  it('writes only the entry rows a run wins, and the scope row only when its coverage grows', async () => {
    const store = open(nextName());
    const run = runWith(0, 10, [rec('a', 3), rec('b', 5), tomb('c', 7)]);
    const writes = countWrites();

    await store.applyRuns([run]);
    expect(writes('paths')).toBe(3);
    expect(writes('scopes')).toBe(1);

    await store.applyRuns([run]);
    expect(writes('paths')).toBe(3);
    expect(writes('scopes')).toBe(1);

    await store.applyRuns([runWith(10, 12, [rec('a', 11)]), runWith(0, 4, [rec('a', 2), tomb('d', 4)])]);
    expect(writes('paths')).toBe(5);
    expect(writes('scopes')).toBe(2);
    expect([...(await store.readScope(META)).entries.keys()]).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keys entries by scope id and path and stores each as a short tuple', async () => {
    const name = nextName();
    const store = open(name);
    await store.applyRuns([runWith(0, 2, [rec('a', 1, 'h'), tomb('b', 2)]), runOf(0, 3, { ...META, author: 'bob' })]);
    store.close();

    const raw = new Dexie(name);
    await raw.open();
    const scopes = await raw.table('scopes').toArray();
    const keys = await raw.table('paths').toCollection().primaryKeys();
    const values = await raw.table('paths').toArray();
    raw.close();

    expect(scopes).toEqual([
      { id: 1, ...META, coverage: [{ tail: c(0), head: c(2) }] },
      { id: 2, ...META, author: 'bob', coverage: [{ tail: c(0), head: c(3) }] },
    ]);
    expect(keys).toEqual([
      [1, 'a'],
      [1, 'b'],
      [2, 'a'],
    ]);
    expect(values).toEqual([
      [1, c(1), 'h', { n: 1 }],
      [0, c(2)],
      [1, c(3), undefined, { n: 3 }],
    ]);
  });

  it('reads many scopes at once, each as a read of its own gives it', async () => {
    const store = open(nextName());
    const other = { ...META, author: 'bob' };
    const missing = { ...META, group: 'graph' };
    await store.applyRuns([runWith(0, 10, [rec('a', 4), tomb('b', 7)]), runOf(0, 3, other)]);
    const asked = [other, missing, META, other];
    const each: MergedRuns<Payload>[] = [];
    for (const scope of asked) each.push(await store.readScope(scope));

    const read = await store.readScopes(asked);

    expect(read).toEqual(each);
    expect(await store.readScopes([])).toEqual([]);
  });

  it('reads entries and coverage back after closing and reopening the database', async () => {
    const name = nextName();
    const first = open(name);
    // Above 2^53, where a cursor that went through a JS number would lose its low bits.
    const big = BigInt('9007199254740993');
    const run: Run<Payload> = {
      ...META,
      tail: big,
      head: MAX_CURSOR,
      entries: [
        { kind: 'record', path: 'a', cursor: big + BigInt(1), hash: 'h', data: { n: 1 } },
        { kind: 'tombstone', path: 'b', cursor: MAX_CURSOR },
      ],
    };
    await first.commit({
      applyRuns: [runOf(0, 2), run],
      userHomeservers: [{ user: 'alice', value: { homeserver: 'hs1', resolvedAt: 5 } }],
      homeserverStates: [
        {
          homeserver: 'hs1',
          patch: { highWater: { cursor: MAX_CURSOR, author: 'alice' } },
        },
      ],
      scopeMembers: [{ seed: 'alice', members: new Map([['alice', 0]]) }],
    });
    first.close();

    const second = open(name);

    const scope = await second.readScope(META);
    expect(scope).toEqual(mergeRuns([runOf(0, 2), run]));
    expect(await second.readCoverage(META)).toEqual([
      { tail: c(0), head: c(2) },
      { tail: big, head: MAX_CURSOR },
    ]);
    // The newer run wins path a, so the lower range exports empty.
    expect(await second.exportRuns(META)).toEqual([runWith(0, 2, []), run]);
    expect([...scope.entries.values()].map((entry) => entry.cursor.toString())).toEqual([
      '9007199254740994',
      '18446744073709551615',
    ]);
    expect(scope.trusted?.tail === big && scope.trusted.head === MAX_CURSOR).toBe(true);
    expect(await second.listScopes()).toEqual([META]);
    expect(await second.readUserHomeserver('alice')).toEqual({ homeserver: 'hs1', resolvedAt: 5 });
    expect(await second.readHomeserverState('hs1')).toEqual({
      ...EMPTY_HOMESERVER_STATE,
      highWater: { cursor: MAX_CURSOR, author: 'alice' },
    });
    expect(await second.readScopeMembers('alice')).toEqual(new Map([['alice', 0]]));
  });

  it('drops the runs of a version 1 database and keeps the rest', async () => {
    const name = nextName();
    const old = new Dexie(name);
    old.version(1).stores({
      runs: '++id, [author+homeserver+group], homeserver',
      userHomeservers: 'user',
      homeserverStates: 'homeserver',
      scopeMembers: 'seed',
    });
    await old.table('runs').add(runOf(0, 2));
    await old.table('userHomeservers').put({ user: 'alice', value: { homeserver: 'hs1', resolvedAt: 5 } });
    old.close();

    const store = open(name);

    expect(await store.listScopes()).toEqual([]);
    expect(await store.readUserHomeserver('alice')).toEqual({ homeserver: 'hs1', resolvedAt: 5 });
    await store.applyRuns([runOf(0, 2)]);
    expect(await store.readCoverage(META)).toEqual([{ tail: c(0), head: c(2) }]);
  });

  it('drops the entries and coverage of a version 2 database and keeps the rest', async () => {
    const name = nextName();
    const old = new Dexie(name);
    old.version(1).stores({
      runs: '++id, [author+homeserver+group], homeserver',
      userHomeservers: 'user',
      homeserverStates: 'homeserver',
      scopeMembers: 'seed',
    });
    old.version(2).stores({
      runs: null,
      entries: '[author+homeserver+group+path]',
      coverage: '[author+homeserver+group], homeserver',
    });
    await old.table('entries').put({ ...META, path: 'a', entry: rec('a', 2) });
    await old.table('coverage').put({ ...META, coverage: [{ tail: c(0), head: c(2) }] });
    await old.table('userHomeservers').put({ user: 'alice', value: { homeserver: 'hs1', resolvedAt: 5 } });
    old.close();

    const store = open(name);

    expect(await store.listScopes()).toEqual([]);
    expect(await store.readScope(META)).toEqual(mergeRuns([]));
    expect(await store.readUserHomeserver('alice')).toEqual({ homeserver: 'hs1', resolvedAt: 5 });
    await store.applyRuns([runOf(2, 4)]);
    expect(await store.readScope(META)).toEqual(mergeRuns([runOf(2, 4)]));
  });

  it('keeps meta values across a reopen, null for a key never written', async () => {
    const name = nextName();
    const first = open(name);
    await first.writeMeta('writer', 'w1');
    await first.writeMeta('writer', 'w2');
    first.close();

    const second = open(name);

    expect(await second.readMeta('writer')).toBe('w2');
    expect(await second.readMeta('other')).toBeNull();
  });

  it('runs the store benchmark on a small fill', async () => {
    const store = createIdbStore<BenchPayload>(nextName());
    try {
      const timings = await benchIndexStore(() => store, { users: 4, recordsPerUser: 10, usersPerCommit: 3 });

      expect(timings).toMatchObject({ records: 40, scopes: 8 });
      expect(await store.listScopes()).toHaveLength(8);
    } finally {
      await store.destroy();
    }
  });

  it('starts empty after destroy', async () => {
    const name = nextName();
    const first = open(name);
    await first.applyRuns([runOf(0, 2)]);
    await first.destroy();

    expect(await open(name).listScopes()).toEqual([]);
  });
});
