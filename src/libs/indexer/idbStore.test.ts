// @vitest-environment node
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_CURSOR } from './cursor';
import { createIdbStore, type IdbIndexStore } from './idbStore';
import type { Run } from './indexer.types';
import { mergeRuns } from './merge';
import { c, describeIndexStoreContract, META, type Payload, rec, runOf, runWith, tomb } from './store.contract';

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

  /** Counts the rows written to the entries object store from now on. */
  function countEntryWrites(): () => number {
    const put = IDBObjectStore.prototype.put;
    let writes = 0;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['put']>
    ) {
      if (this.name === 'entries') writes += 1;
      return put.apply(this, args);
    });
    return () => writes;
  }

  it('writes only the entry rows a run wins', async () => {
    const store = open(nextName());
    const run = runWith(0, 10, [rec('a', 3), rec('b', 5), tomb('c', 7)]);
    const writes = countEntryWrites();

    await store.applyRuns([run]);
    expect(writes()).toBe(3);

    await store.applyRuns([run]);
    expect(writes()).toBe(3);

    await store.applyRuns([runWith(10, 12, [rec('a', 11)]), runWith(0, 4, [rec('a', 2), tomb('d', 4)])]);
    expect(writes()).toBe(5);
    expect([...(await store.readScope(META)).entries.keys()]).toEqual(['a', 'b', 'c', 'd']);
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
          patch: { highWater: { cursor: MAX_CURSOR, author: 'alice' }, windowStart: { cursor: big, foundAt: 6 } },
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
      highWater: { cursor: MAX_CURSOR, author: 'alice' },
      windowStart: { cursor: big, foundAt: 6 },
      failure: null,
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

  it('starts empty after destroy', async () => {
    const name = nextName();
    const first = open(name);
    await first.applyRuns([runOf(0, 2)]);
    await first.destroy();

    expect(await open(name).listScopes()).toEqual([]);
  });
});
