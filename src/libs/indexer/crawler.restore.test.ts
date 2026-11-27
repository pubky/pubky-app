// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  ACTIVITY,
  DAY_MS,
  FOLLOWS,
  GRAPH,
  harness,
  NOW,
  type Post,
  postPath,
  POSTS,
  served,
  testDomain,
} from './crawler.fixtures';
import type { FakeNetwork } from './fakeNetwork';
import { encodeIndexFile } from './indexFile';
import { createSavedIndex, folderOf, hotPath } from './savedIndex';
import { scopeId } from './store.helpers';
import type { IndexStore } from './store.types';
import type { IndexerTransport, ReadEventsRequest } from './transport.types';

// Operations that run together over one homeserver: none sets its high-water mark back, and none keeps what it read
// before another one found the homeserver restored.

/**
 * The network, with the reads `held` picks answered as the log stood when they were asked, but only once `release`
 * is called: an operation that read before something changed and commits after it.
 */
function holding(network: FakeNetwork, held: (request: ReadEventsRequest) => boolean) {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const asked: ReadEventsRequest[] = [];
  const transport: IndexerTransport = {
    resolveHomeserver: (user) => network.resolveHomeserver(user),
    readEvents: async (request) => {
      if (!held(request)) return network.readEvents(request);
      asked.push(request);
      const events = await network.readEvents(request);
      await gate;
      return events;
    },
    getPublic: (request) => network.getPublic(request),
    indexFiles: network.indexFiles,
  };
  return { transport, asked, release: () => release() };
}

async function until(check: () => boolean, what: string): Promise<void> {
  for (let turn = 0; turn < 200; turn += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** Every scope the store holds with its coverage and entries, in a fixed order. */
async function everything(store: IndexStore<Post>) {
  const scopes = [...(await store.listScopes())].sort((a, b) => (scopeId(a) < scopeId(b) ? -1 : 1));
  return Promise.all(scopes.map(async (scope) => ({ id: scopeId(scope), scope: await store.readScope(scope) })));
}

/**
 * bob follows alice, then alice on hs1 follows u1, who wrote ten posts and deleted them, then the post `kept`: a
 * restore rebuilds the log from the live files alone, so its cursors restart lower.
 */
function shrinking() {
  const setup = harness();
  const { network } = setup;
  network.addHomeserver('hs1');
  for (const user of ['alice', 'u1', 'bob']) network.addUser(user, 'hs1');
  network.put('bob', `${FOLLOWS}alice`);
  network.put('alice', `${FOLLOWS}u1`);
  for (let i = 0; i < 10; i += 1) {
    network.putJson('u1', postPath(3 * DAY_MS + i), { text: 'gone' });
    network.del('u1', postPath(3 * DAY_MS + i));
  }
  const kept = postPath(2 * DAY_MS);
  network.putJson('u1', kept, { text: 'kept' });
  return { ...setup, kept };
}

describe('operations racing over one homeserver', () => {
  it('never sets the stored mark back when an operation that checked the homeserver first commits last', async () => {
    const { network, store, crawlerOf, kept } = shrinking();
    const { transport, asked, release } = holding(network, (request) =>
      request.users.some(({ user }) => user === 'bob'),
    );
    const crawler = crawlerOf(transport);

    // The leaf read is asked while the store holds no mark, and answers after the scope sync stored one.
    const leaf = crawler.syncLeaf({ author: 'bob', group: 'leaf:bob', paths: [FOLLOWS] });
    await until(() => asked.length > 0, 'the leaf read');
    await crawler.syncScope('alice');
    const { highWater: mark, epoch } = await store.readHomeserverState('hs1');
    expect(mark).not.toBeNull();
    release();
    await leaf;
    expect((await store.readHomeserverState('hs1')).highWater).toEqual(mark);

    // So the next sync still sees the log restart, drops the deleted post and reads the new one.
    network.restore('hs1');
    network.del('u1', kept);
    const fresh = postPath(DAY_MS);
    network.putJson('u1', fresh, { text: 'fresh' });
    await crawler.syncScope('alice');

    expect(await served(store, 'u1', 'hs1', ACTIVITY)).toEqual(network.liveOf('u1', [POSTS]));
    expect([...(await served(store, 'u1', 'hs1', ACTIVITY)).keys()]).toEqual([fresh]);
  });

  it('keeps nothing a backfill read before another operation found the homeserver restored', async () => {
    const { network, store, crawlerOf } = harness({ sliceLimit: 4 });
    network.addHomeserver('hs1').addUser('alice', 'hs1');
    for (let i = 0; i < 10; i += 1) {
      network.putJson('alice', postPath(3 * DAY_MS + i), { text: 'gone' });
      network.del('alice', postPath(3 * DAY_MS + i));
    }
    Array.from({ length: 10 }, (_, i) => network.putJson('alice', postPath((60 - i) * DAY_MS), { i }));
    network.putJson('alice', postPath(2 * DAY_MS), { text: 'recent' });
    // Only the backfill reads pages of four events below a cursor.
    const { transport, asked, release } = holding(
      network,
      ({ limit, reverse, users }) => limit === 4 && reverse && users.every(({ cursor }) => cursor !== null),
    );
    const crawler = crawlerOf(transport);
    await crawler.syncScope('alice');

    // Its restore check passes and its page is read; then the log is rebuilt and a sync finds it so.
    const backfill = crawler.backfill('alice', ACTIVITY, 1);
    await until(() => asked.length > 0, 'the backfill page');
    network.restore('hs1');
    await crawler.syncUsers(['alice']);
    const after = await everything(store);
    release();
    await backfill;

    expect(await everything(store)).toEqual(after);
    expect((await store.readHomeserverState('hs1')).epoch).toMatch(/^r/);
  });

  it("keeps nothing of a scope sync's read in flight when another operation finds the homeserver restored", async () => {
    const { network, store, crawlerOf, kept } = shrinking();
    network.addUser('carol', 'hs1');
    network.putJson('carol', postPath(DAY_MS), { text: 'carol' });
    const crawler = crawlerOf(network);
    await crawler.syncScope('alice');
    // alice follows carol now: the next scope sync reads carol's window newest first, held until after the restore.
    network.put('alice', `${FOLLOWS}carol`);
    const { transport, asked, release } = holding(
      network,
      ({ users, reverse }) => reverse && users.some(({ user }) => user === 'carol'),
    );
    const held = crawlerOf(transport);
    const sync = held.syncScope('alice');
    await until(() => asked.length > 0, "carol's window read");

    network.restore('hs1');
    network.del('u1', kept);
    network.putJson('carol', postPath(DAY_MS / 2), { text: 'carol again' });
    await crawler.syncUsers(['u1']);
    release();
    await sync;
    // A sync after both reads carol under the new log: no range read before the restore is left to catch up from.
    await crawler.syncScope('alice');

    for (const user of ['alice', 'u1', 'carol']) {
      expect(await served(store, user, 'hs1', ACTIVITY)).toEqual(network.liveOf(user, [POSTS]));
      expect(await served(store, user, 'hs1', GRAPH)).toEqual(network.liveOf(user, [FOLLOWS]));
    }
  });

  it('deletes a restored homeserver once when two operations find the restore together', async () => {
    const { network, store, crawler, kept } = shrinking();
    await crawler.syncScope('alice');
    network.restore('hs1');
    network.del('u1', kept);
    const fresh = postPath(DAY_MS);
    network.putJson('u1', fresh, { text: 'fresh' });

    await Promise.all([crawler.syncUsers(['u1']), crawler.syncUsers(['u1', 'alice'])]);

    expect((await store.readHomeserverState('hs1')).epoch).toMatch(/^r/);
    expect([...(await served(store, 'u1', 'hs1', ACTIVITY)).keys()]).toEqual([fresh]);
    expect(await served(store, 'alice', 'hs1', GRAPH)).toEqual(network.liveOf('alice', [FOLLOWS]));
  });

  it('ignores a saved index read over other paths, whose mark could name an author with no event in these', async () => {
    const { network, store, crawler } = shrinking();
    await crawler.syncScope('alice');
    const before = await everything(store);
    const { highWater: mark, epoch } = await store.readHomeserverState('hs1');
    // Written by a device reading another tree: its groups and its mark's author are none of this domain's.
    const file = await encodeIndexFile({
      part: { kind: 'hot', shards: 0, folded: [], packs: [], cut: [] },
      writer: 'w1',
      writtenAt: NOW,
      seed: 'alice',
      hops: 2,
      windowDays: 30,
      members: [{ user: 'alice', hop: 0, homeserver: { homeserver: 'hs1', resolvedAt: NOW } }],
      // A restore's epoch, newer than any the store has, which would drop what it holds.
      homeservers: [
        { homeserver: 'hs1', epoch: 'r9999999999999.z', highWater: { cursor: BigInt(1000), author: 'bob' } },
      ],
      runs: [
        { author: 'alice', homeserver: 'hs1', group: `${GRAPH}+legacy`, tail: BigInt(0), head: BigInt(5), entries: [] },
      ],
    });
    await network.indexFiles.write(hotPath(await folderOf(testDomain.groups.map(({ id }) => id))), file);

    const outcome = await createSavedIndex({
      files: network.indexFiles,
      store,
      domain: testDomain,
      seed: 'alice',
      writer: 'w2',
      now: () => NOW,
      hops: 2,
      windowDays: 30,
      budget: Infinity,
      expiryMs: DAY_MS,
    }).load(() => undefined);
    await crawler.syncScope('alice');

    expect(outcome).toMatchObject({ loaded: 0, ignored: 1 });
    expect((await store.readHomeserverState('hs1')).highWater).toEqual(mark);
    expect((await store.readHomeserverState('hs1')).epoch).toBe(epoch);
    expect(await everything(store)).toEqual(before);
  });
});
