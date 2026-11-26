// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCrawler } from './crawler';
import {
  ACTIVITY,
  DAY_MS,
  FOLLOWS,
  NOW,
  type Post,
  postPath,
  servedData,
  taggedDomain,
  TAGS,
} from './crawler.fixtures';
import type { StoreChange } from './crawler.types';
import { FakeNetwork } from './fakeNetwork';
import { HomeserverUnreachableError } from './indexer.errors';
import { createMemoryStore } from './memoryStore';
import { fitToBudget, indexFileName, loadSavedIndex, snapshotIndex } from './savedIndex';
import { scopeId } from './store.helpers';
import type { IndexStore } from './store.types';
import type { GetPublicRequest, IndexerTransport } from './transport.types';

const MINUTE_MS = 60 * 1000;
const BOB = { author: 'bob', homeserver: 'hs1', group: ACTIVITY };

const isTag = ({ path }: { path: string }) => path.startsWith(TAGS);

/** alice follows bob on hs1. bob wrote a tag and a post older than the window, then a post within it and a tag. */
function world() {
  const network = new FakeNetwork().addHomeserver('hs1').addUser('alice', 'hs1').addUser('bob', 'hs1');
  network.put('alice', `${FOLLOWS}bob`);
  const paths = { tag1: `${TAGS}t1`, old: postPath(40 * DAY_MS), fresh: postPath(DAY_MS), tag2: `${TAGS}t2` };
  network.putJson('bob', paths.tag1, { text: 't1' });
  network.putJson('bob', paths.old, { text: 'old' });
  network.putJson('bob', paths.fresh, { text: 'fresh' });
  network.putJson('bob', paths.tag2, { text: 't2' });
  const state = { failTags: false, gets: [] as GetPublicRequest[] };
  const transport: IndexerTransport = {
    resolveHomeserver: (user) => network.resolveHomeserver(user),
    readEvents: (request) => network.readEvents(request),
    getPublic: async (request) => {
      state.gets.push(request);
      if (state.failTags && isTag(request)) throw new HomeserverUnreachableError(request.author);
      return network.getPublic(request);
    },
    listIndexFiles: () => network.listIndexFiles(),
    readIndexFile: (name) => network.readIndexFile(name),
    writeIndexFile: (name, bytes) => network.writeIndexFile(name, bytes),
    deleteIndexFile: (name) => network.deleteIndexFile(name),
  };
  const clock = { now: NOW };
  const crawlerOf = (store: IndexStore<Post>) =>
    createCrawler<Post>({
      transport,
      store,
      domain: taggedDomain,
      now: () => clock.now,
      sleep: async () => undefined,
    });
  const store = createMemoryStore<Post>();
  const crawler = crawlerOf(store);
  const commits: StoreChange[] = [];
  crawler.onCommit((change) => commits.push(change));
  return { network, paths, state, clock, store, crawler, crawlerOf, commits };
}

describe('crawler files fetched after the commit', () => {
  it('commits a run once its posts are in, and leaves its tags to hydrate, which commits each one', async () => {
    const { paths, state, store, crawler, commits } = world();

    await crawler.syncScope('alice');

    expect(state.gets.map(({ path }) => path)).toEqual([paths.fresh]);
    expect(await servedData(store, 'bob', 'hs1', ACTIVITY)).toEqual(
      new Map([
        [paths.fresh, { text: 'fresh' }],
        [paths.tag2, undefined],
      ]),
    );
    expect(commits.some(({ scopes }) => scopes.some((scope) => scopeId(scope) === scopeId(BOB)))).toBe(true);
    expect(crawler.unfilled()).toBe(1);
    const coverage = await store.readCoverage(BOB);
    const mark = commits.length;

    expect(await crawler.hydrate()).toEqual({ fetched: 1, remaining: 0 });

    expect((await servedData(store, 'bob', 'hs1', ACTIVITY)).get(paths.tag2)).toEqual({ text: 't2' });
    expect(await store.readCoverage(BOB)).toEqual(coverage);
    expect(commits.slice(mark)).toEqual([{ scopes: [BOB], seeds: [] }]);
    expect(crawler.unfilled()).toBe(0);
    const gets = state.gets.length;
    await crawler.syncScope('alice');
    expect(await crawler.hydrate()).toEqual({ fetched: 0, remaining: 0 });
    expect(state.gets).toHaveLength(gets);
  });

  it('keeps the posts and the coverage when the tag fetch fails, and fetches the tags on a later call', async () => {
    const { network, paths, state, clock, store, crawler } = world();
    state.failTags = true;
    await crawler.syncScope('alice');

    expect(await crawler.hydrate()).toEqual({ fetched: 0, remaining: 1 });

    expect(await servedData(store, 'bob', 'hs1', ACTIVITY)).toEqual(
      new Map([
        [paths.fresh, { text: 'fresh' }],
        [paths.tag2, undefined],
      ]),
    );
    const coverage = await store.readCoverage(BOB);
    expect(coverage[coverage.length - 1].head).toBe(network.headOf('hs1'));
    expect((await store.readHomeserverState('hs1')).failure).toEqual({ failures: 1, retryAt: clock.now + MINUTE_MS });
    expect(crawler.unfilled()).toBe(1);

    state.failTags = false;
    clock.now += MINUTE_MS;
    await crawler.syncScope('alice');
    expect(await crawler.hydrate()).toEqual({ fetched: 1, remaining: 0 });
    expect((await servedData(store, 'bob', 'hs1', ACTIVITY)).get(paths.tag2)).toEqual({ text: 't2' });
  });

  it('commits a backfill page with its posts and leaves its tags to hydrate', async () => {
    const { paths, state, store, crawler } = world();
    await crawler.syncScope('alice');
    await crawler.hydrate();
    const gets = state.gets.length;

    expect(await crawler.backfill('bob', ACTIVITY, 1)).toMatchObject({ pages: 1 });

    expect(state.gets.slice(gets).map(({ path }) => path)).toEqual([paths.old]);
    const served = await servedData(store, 'bob', 'hs1', ACTIVITY);
    expect(served.get(paths.old)).toEqual({ text: 'old' });
    expect(served.has(paths.tag1)).toBe(true);
    expect(served.get(paths.tag1)).toBeUndefined();
    expect(crawler.unfilled()).toBe(1);

    expect(await crawler.hydrate()).toEqual({ fetched: 1, remaining: 0 });
    expect((await servedData(store, 'bob', 'hs1', ACTIVITY)).get(paths.tag1)).toEqual({ text: 't1' });
  });

  it('saves pending tags without data, and a device that loads them fetches only the tags', async () => {
    const { network, paths, state, store, crawler, crawlerOf } = world();
    await crawler.syncScope('alice');
    const model = await snapshotIndex({
      store,
      domain: taggedDomain,
      seed: 'alice',
      writer: 'w1',
      writtenAt: NOW,
      hops: 2,
      windowDays: 30,
    });
    await network.writeIndexFile(indexFileName('w1'), await fitToBudget(model, Infinity, new Set([ACTIVITY])));

    const other = createMemoryStore<Post>();
    const outcome = await loadSavedIndex({
      transport: network,
      store: other,
      seed: 'alice',
      writer: 'w2',
      now: NOW,
      expiryMs: DAY_MS,
      reviveData: taggedDomain.reviveData,
    });
    expect(outcome.loaded).toBe(1);
    expect(await servedData(other, 'bob', 'hs1', ACTIVITY)).toEqual(await servedData(store, 'bob', 'hs1', ACTIVITY));

    const loader = crawlerOf(other);
    expect(loader.unfilled()).toBe(0);
    const gets = state.gets.length;
    expect(await loader.hydrate(await other.listScopes())).toEqual({ fetched: 1, remaining: 0 });
    expect(state.gets.slice(gets).map(({ path }) => path)).toEqual([paths.tag2]);
    await crawler.hydrate();
    expect(await other.exportRuns(BOB)).toEqual(await store.exportRuns(BOB));
  });
});
