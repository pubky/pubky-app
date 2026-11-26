// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCrawler } from './crawler';
import { ACTIVITY, DAY_MS, NOW, type Post, postPath, servedData, taggedDomain, TAGS } from './crawler.fixtures';
import { FakeNetwork } from './fakeNetwork';
import { createMemoryStore } from './memoryStore';
import { settle } from './runtime.fixtures';
import type { IndexerTransport } from './transport.types';

const LIMIT = 3;

/**
 * bob tagged four times and posted once, carol posted three times, both on hs1. File fetches can be held: each held
 * one has its answer taken when it starts, waits for `releaseOldest`, and ends when its signal fires, as a fetch does.
 */
function world() {
  const network = new FakeNetwork().addHomeserver('hs1').addUser('bob', 'hs1').addUser('carol', 'hs1');
  const tags = [1, 2, 3, 4].map((i) => `${TAGS}t${i}`);
  for (const tag of tags) network.putJson('bob', tag, { text: tag });
  network.putJson('bob', postPath(DAY_MS), { text: 'bob' });
  const posts = [1, 2, 3].map((i) => postPath(i * 60 * 1000));
  for (const post of posts) network.putJson('carol', post, { text: post });
  const gets = {
    hold: false,
    started: [] as string[],
    held: [] as Array<() => void>,
    inFlight: 0,
    peak: 0,
    aborted: 0,
  };
  const transport: IndexerTransport = {
    resolveHomeserver: (user) => network.resolveHomeserver(user),
    readEvents: (request) => network.readEvents(request),
    getPublic: async (request) => {
      gets.started.push(`${request.author}:${request.path}`);
      gets.inFlight += 1;
      gets.peak = Math.max(gets.peak, gets.inFlight);
      const answer = network.getPublic(request);
      try {
        if (gets.hold) {
          await new Promise<void>((resolve, reject) => {
            gets.held.push(resolve);
            request.signal?.addEventListener('abort', () => {
              gets.aborted += 1;
              reject(new Error('fetch aborted'));
            });
          });
        }
        return await answer;
      } finally {
        gets.inFlight -= 1;
      }
    },
    listIndexFiles: () => network.listIndexFiles(),
    readIndexFile: (name) => network.readIndexFile(name),
    writeIndexFile: (name, bytes) => network.writeIndexFile(name, bytes),
    deleteIndexFile: (name) => network.deleteIndexFile(name),
  };
  const releaseOldest = () => gets.held.shift()?.();
  const store = createMemoryStore<Post>();
  const crawler = createCrawler<Post>({
    transport,
    store,
    domain: taggedDomain,
    now: () => NOW,
    sleep: async () => undefined,
    options: { homeserverConcurrency: LIMIT },
  });
  return { network, tags, posts, gets, releaseOldest, store, crawler };
}

describe('crawler requests per homeserver', () => {
  it('keeps at most the limit in flight, starts a foreground fetch at once beside the fill, and puts it first', async () => {
    const { tags, posts, gets, releaseOldest, store, crawler } = world();
    await crawler.syncUsers(['bob']);
    gets.started = [];
    gets.hold = true;

    const filling = crawler.hydrate();
    await settle();
    // The fill leaves one of the three slots free.
    expect(gets.started).toEqual([`bob:${tags[3]}`, `bob:${tags[2]}`]);

    const visiting = crawler.syncUsers(['carol']);
    await settle();
    expect(gets.started).toHaveLength(3);
    expect(gets.started[2].startsWith('carol:')).toBe(true);

    // A slot the fill frees goes to the visit's next fetch, ahead of the tags still waiting.
    releaseOldest();
    await settle();
    expect(gets.started).toHaveLength(4);
    expect(gets.started[3].startsWith('carol:')).toBe(true);

    for (let turn = 0; turn < 20 && gets.held.length > 0; turn += 1) {
      releaseOldest();
      await settle();
    }
    await Promise.all([filling, visiting]);

    expect(gets.peak).toBe(LIMIT);
    expect(gets.aborted).toBe(0);
    expect(gets.started.filter((get) => get.startsWith('carol:'))).toHaveLength(posts.length);
    const bob = await servedData(store, 'bob', 'hs1', ACTIVITY);
    for (const tag of tags) expect(bob.get(tag)).toEqual({ text: tag });
    const carol = await servedData(store, 'carol', 'hs1', ACTIVITY);
    for (const post of posts) expect(carol.get(post)).toEqual({ text: post });
  });

  it('lets the fill finish a fetch whose record a crawl replaced meanwhile, then fetches the newer one', async () => {
    const { network, tags, gets, releaseOldest, store, crawler } = world();
    await crawler.syncUsers(['bob']);
    gets.hold = true;
    const filling = crawler.hydrate();
    await settle();
    expect(gets.held).toHaveLength(2);

    // bob edits the newest tag while its old file is on the way, and a crawl reads the edit.
    const edited = network.putJson('bob', tags[3], { text: 'edited' });
    await crawler.syncUsers(['bob']);
    for (let turn = 0; turn < 20 && gets.held.length > 0; turn += 1) {
      releaseOldest();
      await settle();
    }
    await filling;

    // The old file set nothing on the edit; the edit, committed while the fill ran, joined it with its own file.
    const scope = { author: 'bob', homeserver: 'hs1', group: ACTIVITY };
    const newest = (await store.readScope(scope)).live.get(tags[3]);
    expect(newest?.cursor).toBe(edited);
    expect(newest?.data).toEqual({ text: 'edited' });
    expect((await servedData(store, 'bob', 'hs1', ACTIVITY)).get(tags[2])).toEqual({ text: tags[2] });
    expect(gets.started.filter((get) => get === `bob:${tags[3]}`)).toHaveLength(2);
    expect(gets.aborted).toBe(0);
  });

  it('takes in the files a crawl leaves while it runs, newest first, ahead of older ones still queued', async () => {
    const { network, tags, gets, releaseOldest, store, crawler } = world();
    await crawler.syncUsers(['bob']);
    gets.started = [];
    gets.hold = true;
    const filling = crawler.hydrate();
    await settle();
    expect(gets.started).toEqual([`bob:${tags[3]}`, `bob:${tags[2]}`]);

    const fresh = `${TAGS}t5`;
    network.putJson('bob', fresh, { text: fresh });
    const crawling = crawler.syncUsers(['bob']);
    await settle();
    for (let turn = 0; turn < 20 && gets.held.length > 0; turn += 1) {
      releaseOldest();
      await settle();
    }
    // The tag already waiting for a slot goes first; the new one before every older tag not taken yet.
    expect(gets.started).toEqual([tags[3], tags[2], tags[1], fresh, tags[0]].map((tag) => `bob:${tag}`));
    expect(await filling).toEqual({ fetched: 5, remaining: 0 });
    await crawling;
    const bob = await servedData(store, 'bob', 'hs1', ACTIVITY);
    for (const tag of [...tags, fresh]) expect(bob.get(tag)).toEqual({ text: tag });
  });
});
