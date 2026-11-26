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
  testDomain,
} from './crawler.fixtures';
import type { HydrateResult } from './crawler.types';
import { FakeNetwork } from './fakeNetwork';
import type { Entry, Run } from './indexer.types';
import { createMemoryStore } from './memoryStore';
import type { IndexStore } from './store.types';

const HOUR_MS = 60 * 60 * 1000;
const SCOPE = { author: 'alice', homeserver: 'hs1', group: ACTIVITY };

const dataless = (run: Run<Post>): Run<Post> => ({
  ...run,
  entries: run.entries.map((entry): Entry<Post> => (entry.kind === 'record' ? { ...entry, data: undefined } : entry)),
});

/** alice's three posts, synced by one device and copied without data into another device's store. */
async function setup() {
  const network = new FakeNetwork().addHomeserver('hs1').addUser('alice', 'hs1');
  const paths = [1, 2, 3].map((k) => postPath(k * HOUR_MS));
  for (const path of paths) network.putJson('alice', path, { text: path });
  const synced = createMemoryStore<Post>();
  await createCrawler({ transport: network, store: synced, domain: testDomain, now: () => NOW }).syncScope('alice');
  const store = createMemoryStore<Post>();
  await store.applyRuns((await synced.exportRuns(SCOPE)).map(dataless));
  await store.writeUserHomeserver('alice', { homeserver: 'hs1', resolvedAt: NOW });
  await store.writeScopeMembers('alice', new Map([['alice', 0]]));
  const fetched: string[] = [];
  const crawler = createCrawler({
    transport: {
      resolveHomeserver: (user) => network.resolveHomeserver(user),
      readEvents: (request) => network.readEvents(request),
      getPublic: (request) => {
        fetched.push(request.path);
        return network.getPublic(request);
      },
      listIndexFiles: () => network.listIndexFiles(),
      readIndexFile: (name) => network.readIndexFile(name),
      writeIndexFile: (name, bytes) => network.writeIndexFile(name, bytes),
      deleteIndexFile: (name) => network.deleteIndexFile(name),
    },
    store,
    domain: testDomain,
    now: () => NOW,
    sleep: async () => undefined,
    options: { homeserverConcurrency: 1 },
  });
  return { network, paths, synced, store, crawler, fetched };
}

describe('createCrawler hydrate', () => {
  it('fetches the bodies of records without data, newest cursor first', async () => {
    const { paths, synced, store, crawler, fetched } = await setup();

    expect(await crawler.hydrate([SCOPE])).toEqual({ fetched: 3, remaining: 0, failedHomeservers: [] });
    expect(fetched).toEqual([...paths].reverse());
    expect(await store.exportRuns(SCOPE)).toEqual(await synced.exportRuns(SCOPE));
  });

  it('tries a body that is gone once per read of its scope and leaves the record without data', async () => {
    const { network, paths, store, crawler } = await setup();
    network.overrideFile('alice', paths[0], null);

    expect(await crawler.hydrate([SCOPE])).toEqual({ fetched: 2, remaining: 0, failedHomeservers: [] });
    const requests = crawler.stats().bodyRequests;
    expect(await crawler.hydrate()).toEqual({ fetched: 0, remaining: 0, failedHomeservers: [] });
    expect(crawler.stats().bodyRequests).toBe(requests);
    expect((await servedData(store, 'alice', 'hs1', ACTIVITY)).get(paths[0])).toBeUndefined();
  });

  it('leaves the records of a failing homeserver for a later call, naming it', async () => {
    const { network, crawler } = await setup();
    network.setDown('hs1', true);

    expect(await crawler.hydrate([SCOPE])).toEqual({ fetched: 0, remaining: 3, failedHomeservers: ['hs1'] });
    expect(crawler.unfilled()).toBe(3);
    network.setDown('hs1', false);
    expect(await crawler.hydrate()).toEqual({ fetched: 0, remaining: 3, failedHomeservers: ['hs1'] });
  });

  it('fills thousands of tags a first sync commits slice by slice with work linear in them', async () => {
    const network = new FakeNetwork().addHomeserver('hs1').addUser('alice', 'hs1').addUser('bob', 'hs1');
    network.put('alice', `${FOLLOWS}bob`);
    const tags = 3000;
    for (let i = 0; i < tags; i += 1) network.putJson('bob', `${TAGS}t${i}`, { text: `t${i}` });
    network.putJson('bob', postPath(DAY_MS), { text: 'post' });
    const memory = createMemoryStore<Post>();
    const work = { scopeReads: 0, entriesRead: 0, commits: 0, gets: 0 };
    const store: IndexStore<Post> = {
      ...memory,
      readScope: async (scope) => {
        const merged = await memory.readScope(scope);
        work.scopeReads += 1;
        work.entriesRead += merged.entries.size;
        return merged;
      },
      commit: async (batch) => {
        work.commits += 1;
        await memory.commit(batch);
      },
    };
    const crawler = createCrawler<Post>({
      transport: {
        resolveHomeserver: (user) => network.resolveHomeserver(user),
        readEvents: (request) => network.readEvents(request),
        getPublic: (request) => {
          work.gets += 1;
          return network.getPublic(request);
        },
        listIndexFiles: () => network.listIndexFiles(),
        readIndexFile: (name) => network.readIndexFile(name),
        writeIndexFile: (name, bytes) => network.writeIndexFile(name, bytes),
        deleteIndexFile: (name) => network.deleteIndexFile(name),
      },
      store,
      domain: taggedDomain,
      now: () => NOW,
      sleep: async () => undefined,
      options: { windowMaxEntries: 2 * tags },
    });
    // As the runtime does: the fill starts at the first commit that leaves files, beside the sync.
    const fills: Promise<HydrateResult>[] = [];
    crawler.onCommit(() => {
      if (fills.length === 0 && crawler.unfilled() > 0) fills.push(crawler.hydrate());
    });

    await crawler.syncScope('alice');
    await Promise.all(fills);
    expect(await crawler.hydrate()).toMatchObject({ remaining: 0 });

    const bob = await servedData(memory, 'bob', 'hs1', ACTIVITY);
    expect([...bob.values()].filter((data) => data !== undefined)).toHaveLength(tags + 1);
    // Each file fetched and committed once; no scope read again for what its commits left.
    expect(work.gets).toBe(tags + 1);
    expect(work.entriesRead).toBeLessThan(tags);
    expect(work.commits).toBeLessThan(tags + 100);
  });
});
