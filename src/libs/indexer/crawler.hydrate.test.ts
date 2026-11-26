// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCrawler } from './crawler';
import { ACTIVITY, NOW, type Post, postPath, servedData, testDomain } from './crawler.fixtures';
import { FakeNetwork } from './fakeNetwork';
import type { Entry, Run } from './indexer.types';
import { createMemoryStore } from './memoryStore';

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
  const crawler = createCrawler({
    transport: network,
    store,
    domain: testDomain,
    now: () => NOW,
    sleep: async () => undefined,
  });
  return { network, paths, synced, store, crawler };
}

describe('createCrawler hydrate', () => {
  it('fetches the bodies of records without data, newest cursor first, up to the limit', async () => {
    const { paths, synced, store, crawler } = await setup();
    const [first, second, third] = paths;

    expect(await crawler.hydrate([SCOPE], 2)).toEqual({ fetched: 2, remaining: 1 });
    expect(await servedData(store, 'alice', 'hs1', ACTIVITY)).toEqual(
      new Map([
        [third, { text: third }],
        [second, { text: second }],
        [first, undefined],
      ]),
    );
    // The scope past the limit stays left to fill.
    expect(await crawler.hydrate()).toEqual({ fetched: 1, remaining: 0 });
    expect(await store.exportRuns(SCOPE)).toEqual(await synced.exportRuns(SCOPE));
  });

  it('tries a body that is gone once and leaves the record without data', async () => {
    const { network, paths, store, crawler } = await setup();
    network.overrideFile('alice', paths[0], null);

    expect(await crawler.hydrate([SCOPE])).toEqual({ fetched: 2, remaining: 0 });
    const requests = crawler.stats().bodyRequests;
    expect(await crawler.hydrate([SCOPE])).toEqual({ fetched: 0, remaining: 0 });
    expect(crawler.stats().bodyRequests).toBe(requests);
    expect((await servedData(store, 'alice', 'hs1', ACTIVITY)).get(paths[0])).toBeUndefined();
  });

  it('leaves the records of a failing homeserver untried for a later call', async () => {
    const { network, crawler } = await setup();
    network.setDown('hs1', true);

    expect(await crawler.hydrate([SCOPE])).toEqual({ fetched: 0, remaining: 3 });
  });
});
