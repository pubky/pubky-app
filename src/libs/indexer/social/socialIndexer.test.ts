// @vitest-environment node
import { buildPost, type BuiltPost } from 'pubky-social-specs';
import { describe, expect, it } from 'vitest';
import type { CrawlerOptions } from '../crawler.types';
import { FakeNetwork } from '../fakeNetwork';
import { createMemoryStore } from '../memoryStore';
import { fakeTime, settle } from '../runtime.fixtures';
import type { IndexerTransport } from '../transport.types';
import { UnavailableQueryError } from './queries/queries.errors';
import { ALICE, at, BRAN, CLEO, DION, MINUTE_MS, socialNetwork, T0 } from './social.fixtures';
import type { SocialData } from './social.types';
import { createSocialIndexer, type SocialChange } from './socialIndexer';

const DAY_MS = 24 * 60 * MINUTE_MS;
const DEBOUNCE = 250;
const FOLLOWING = `/v1/stream/posts/keys?source=following&viewer_id=${ALICE}&sorting=timeline&limit=10&observer_id=${ALICE}`;
const authorStream = (author: string) =>
  `/v1/stream/posts/keys?source=author&viewer_id=${ALICE}&sorting=timeline&limit=10&author_id=${author}`;
const key = (author: string, post: BuiltPost) => `${author}:${post.id}`;

/** The fixture network on two homeservers, a shared store, and an indexer over any transport. */
function socialWorld(crawler: Partial<CrawlerOptions> = {}) {
  const fixture = socialNetwork();
  const network = new FakeNetwork().addHomeserver('hs1').addHomeserver('hs2');
  network.addUser(ALICE, 'hs1').addUser(BRAN, 'hs1').addUser(CLEO, 'hs2').addUser(DION, 'hs2');
  for (const { author, path, body } of fixture.writes) network.put(author, path, body);
  for (const { author, path } of fixture.deletes) network.del(author, path);
  const store = createMemoryStore<SocialData>();
  const time = fakeTime(T0 + DAY_MS);
  const indexerOf = (transport: IndexerTransport = network) =>
    createSocialIndexer({
      transport,
      store,
      now: () => time.clock.now,
      schedule: time.schedule,
      options: { crawler },
    });
  return { fixture, network, time, indexerOf };
}

describe('createSocialIndexer', () => {
  it('answers the seed following stream after the first sync, and a new post after a refresh', async () => {
    const { fixture, network, time, indexerOf } = socialWorld();
    const { image, quote, repost } = fixture.posts;
    const indexer = indexerOf();

    indexer.start(ALICE);
    const first = await indexer.request({ url: FOLLOWING, method: 'GET' });

    expect(first.json).toMatchObject({ post_keys: [key(BRAN, image), key(CLEO, quote), key(BRAN, repost)] });

    await time.advance(DEBOUNCE);
    const changes: SocialChange[] = [];
    indexer.onChange((change) => changes.push(change));
    const fresh = at(20, () => buildPost(BRAN, { content: 'Fresh' }));
    network.put(BRAN, fresh.path, fresh.body);
    await indexer.refresh();
    await time.advance(DEBOUNCE);

    expect(changes).toEqual([{ authors: [BRAN] }]);
    const next = await indexer.request({ url: FOLLOWING, method: 'GET' });
    expect(next.json).toMatchObject({
      post_keys: [key(BRAN, fresh), key(BRAN, image), key(CLEO, quote), key(BRAN, repost)],
    });
  });

  it('makes an author outside the scope answerable once ensured', async () => {
    const { fixture, indexerOf } = socialWorld({ hops: 1 });
    const indexer = indexerOf();
    indexer.start(ALICE);
    await indexer.ready();

    await expect(indexer.request({ url: authorStream(DION), method: 'GET' })).rejects.toThrow(UnavailableQueryError);
    await indexer.ensureUser(DION);

    const answer = await indexer.request({ url: authorStream(DION), method: 'GET' });
    expect(answer.json).toMatchObject({ post_keys: [key(DION, fixture.posts.collection)] });
    expect(indexer.view().hopOf(DION)).toBeNull();
  });

  it('loads a single post of an author outside the scope', async () => {
    const { fixture, indexerOf } = socialWorld({ hops: 1 });
    const { collection, orphan } = fixture.posts;
    const indexer = indexerOf();
    indexer.start(ALICE);
    await indexer.ready();
    expect(indexer.view().post(DION, collection.id)).toBeNull();

    await indexer.ensurePost(DION, collection.id);

    expect(indexer.view().post(DION, collection.id)?.data.title).toBe('Best of');
    expect(indexer.view().post(DION, orphan.id)).toBeNull();
  });

  it('is ready from a store a previous session filled, without calling the transport', async () => {
    const { fixture, indexerOf } = socialWorld();
    const { image, quote, repost } = fixture.posts;
    const previous = indexerOf();
    previous.start(ALICE);
    await previous.ready();
    previous.stop();
    let calls = 0;
    const silent = <T>(): Promise<T> => {
      calls += 1;
      return new Promise<T>(() => undefined);
    };
    const offline: IndexerTransport = {
      resolveHomeserver: () => silent(),
      readEvents: () => silent(),
      getPublic: () => silent(),
      listIndexFiles: () => silent(),
      readIndexFile: () => silent(),
      writeIndexFile: () => silent(),
      deleteIndexFile: () => silent(),
    };
    const indexer = indexerOf(offline);

    // A tab opened in the background starts paused: only the store can make it ready.
    indexer.pause();
    indexer.start(ALICE);
    await indexer.ready();
    const answer = await indexer.request({ url: FOLLOWING, method: 'GET' });
    await settle();

    expect(answer.json).toMatchObject({ post_keys: [key(BRAN, image), key(CLEO, quote), key(BRAN, repost)] });
    expect(calls).toBe(0);
  });
});
