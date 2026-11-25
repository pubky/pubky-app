// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_CURSOR } from './cursor';
import { createIdbStore, type IdbIndexStore } from './idbStore';
import type { Run } from './indexer.types';
import { describeIndexStoreContract, META, type Payload, runOf } from './store.contract';

let databases = 0;
const nextName = () => {
  databases += 1;
  return `indexer-test-${databases}`;
};

describeIndexStoreContract(
  'IndexedDB',
  () => createIdbStore<Payload>(nextName()),
  (store) => store.destroy(),
);

describe('createIdbStore persistence', () => {
  const opened: IdbIndexStore<Payload>[] = [];
  const open = (name: string) => {
    const store = createIdbStore<Payload>(name);
    opened.push(store);
    return store;
  };

  afterEach(async () => {
    // Newest first, so no open connection blocks deleting an older handle's database.
    for (const store of opened.splice(0).reverse()) await store.destroy();
  });

  it('reads everything back after closing and reopening the database', async () => {
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
      appendRuns: [runOf(0, 2), run],
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

    const runs = await second.readRuns(META);
    expect(runs).toEqual([runOf(0, 2), run]);
    expect(runs[1].tail === big && runs[1].head === MAX_CURSOR).toBe(true);
    expect(runs[1].entries.map((entry) => entry.cursor.toString())).toEqual([
      '9007199254740994',
      '18446744073709551615',
    ]);
    expect(await second.listScopes()).toEqual([META]);
    expect(await second.readUserHomeserver('alice')).toEqual({ homeserver: 'hs1', resolvedAt: 5 });
    expect(await second.readHomeserverState('hs1')).toEqual({
      highWater: { cursor: MAX_CURSOR, author: 'alice' },
      windowStart: { cursor: big, foundAt: 6 },
      failure: null,
    });
    expect(await second.readScopeMembers('alice')).toEqual(new Map([['alice', 0]]));
  });

  it('starts empty after destroy', async () => {
    const name = nextName();
    const first = open(name);
    await first.appendRuns([runOf(0, 2)]);
    await first.destroy();

    expect(await open(name).listScopes()).toEqual([]);
  });
});
