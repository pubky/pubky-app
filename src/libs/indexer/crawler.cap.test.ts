// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCrawler } from './crawler';
import { ACTIVITY, DAY_MS, FOLLOWS, NOW, type Post, postPath, POSTS, taggedDomain, TAGS } from './crawler.fixtures';
import type { CrawlerOptions } from './crawler.types';
import { CURSOR_ZERO } from './cursor';
import { FakeNetwork } from './fakeNetwork';
import { createMemoryStore } from './memoryStore';

const TAG = new TextEncoder().encode(JSON.stringify({ text: 'tag' }));

/** alice follows heavy and quiet; each posted daily for 20 days, and heavy wrote `tags` tags today. */
function world(tags: number, options: Partial<CrawlerOptions>) {
  const network = new FakeNetwork().addHomeserver('hs1');
  for (const user of ['alice', 'heavy', 'quiet']) network.addUser(user, 'hs1');
  network.put('alice', `${FOLLOWS}heavy`);
  network.put('alice', `${FOLLOWS}quiet`);
  for (let day = 20; day >= 1; day -= 1) {
    network.putJson('quiet', postPath(day * DAY_MS), { text: `q${day}` });
    network.putJson('heavy', postPath(day * DAY_MS + 1), { text: `h${day}` });
  }
  const tagCursors: bigint[] = [];
  for (let i = 0; i < tags; i += 1) tagCursors.push(network.put('heavy', `${TAGS}t${i}`, TAG));
  const store = createMemoryStore<Post>();
  const crawler = createCrawler<Post>({
    transport: network,
    store,
    domain: taggedDomain,
    now: () => NOW,
    sleep: async () => undefined,
    options,
  });
  const scope = (author: string) => ({ author, homeserver: 'hs1', group: ACTIVITY });
  const pathsOf = async (author: string, prefix: string) =>
    [...(await store.readScope(scope(author))).live.keys()].filter((path) => path.startsWith(prefix)).length;
  return { network, store, crawler, scope, pathsOf, tagCursors };
}

describe('window caps', () => {
  it('counts only records that render toward windowMaxEntries, so a tag burst never cuts a window short', async () => {
    const { store, crawler, scope, pathsOf } = world(60, { windowMaxEntries: 50 });

    await crawler.syncScope('alice');

    for (const user of ['heavy', 'quiet']) {
      expect(await store.readCoverage(scope(user))).toEqual([{ tail: CURSOR_ZERO, head: expect.anything() }]);
      expect(await pathsOf(user, POSTS)).toBe(20);
    }
    expect(await pathsOf('heavy', TAGS)).toBe(60);
  });

  it('ends a window above the first post past windowMaxEntries, keeping every newer tag', async () => {
    const { network, store, crawler, scope, pathsOf } = world(3, { windowMaxEntries: 5 });

    await crawler.syncScope('alice');

    // The sixth newest post of heavy, 6 days old, is the first past the cap.
    const sixth = network.liveOf('heavy', [POSTS]).get(postPath(6 * DAY_MS + 1));
    expect((await store.readCoverage(scope('heavy')))[0].tail).toBe(sixth);
    expect([await pathsOf('heavy', POSTS), await pathsOf('heavy', TAGS)]).toEqual([5, 3]);
  });

  it('ends a window at windowMaxPaths whatever the paths, and reads it no further at the next sync', async () => {
    const { store, crawler, scope, pathsOf, tagCursors } = world(60, { windowMaxPaths: 30 });

    await crawler.syncScope('alice');
    const capped = await store.readCoverage(scope('heavy'));
    await crawler.syncScope('alice');

    // The 31st newest tag is the first past the cap: the range ends just above it.
    expect(capped).toEqual([{ tail: tagCursors[29], head: tagCursors[59] }]);
    expect(await store.readCoverage(scope('heavy'))).toEqual(capped);
    expect([await pathsOf('heavy', TAGS), await pathsOf('heavy', POSTS)]).toEqual([30, 0]);
    expect(await pathsOf('quiet', POSTS)).toBe(20);
  });
});
