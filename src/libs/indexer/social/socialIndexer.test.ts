// @vitest-environment node
import { buildPost, buildUri, type BuiltPost } from 'pubky-social-specs';
import { describe, expect, it } from 'vitest';
import type { CrawlerOptions } from '../crawler.types';
import { FakeNetwork } from '../fakeNetwork';
import { IndexerNotStartedError } from '../indexer.errors';
import { decodeIndexFile } from '../indexFile';
import { createMemoryStore } from '../memoryStore';
import { fakeTime, settle } from '../runtime.fixtures';
import type { RuntimeOptions } from '../runtime.types';
import type { IndexStore } from '../store.types';
import type { IndexerTransport } from '../transport.types';
import { UnavailableQueryError } from './queries/queries.errors';
import { SOCIAL_ACTIVITY, SOCIAL_GRAPH } from './social.domain';
import { ALICE, at, BRAN, CLEO, DION, MINUTE_MS, socialNetwork, T0 } from './social.fixtures';
import type { SocialData } from './social.types';
import { createSocialIndexer, type SocialChange, type SocialLimits } from './socialIndexer';

const DAY_MS = 24 * 60 * MINUTE_MS;
const DEBOUNCE = 250;
const FOLLOWING = `/v1/stream/posts/keys?source=following&viewer_id=${ALICE}&sorting=timeline&limit=10&observer_id=${ALICE}`;
const authorStream = (author: string) =>
  `/v1/stream/posts/keys?source=author&viewer_id=${ALICE}&sorting=timeline&limit=10&author_id=${author}`;
const key = (author: string, post: BuiltPost) => `${author}:${post.id}`;

/** Polls with real timers: the saved index gzips outside the fake clock. */
async function until(check: () => boolean | Promise<boolean>, what: string): Promise<void> {
  for (let i = 0; i < 1000; i += 1) {
    if (await check()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** The network as a transport that counts the index files it writes. */
function countingWrites(network: FakeNetwork) {
  const state = { writes: 0 };
  const transport: IndexerTransport = {
    resolveHomeserver: (user) => network.resolveHomeserver(user),
    readEvents: (request) => network.readEvents(request),
    getPublic: (request) => network.getPublic(request),
    listIndexFiles: () => network.listIndexFiles(),
    readIndexFile: (name) => network.readIndexFile(name),
    writeIndexFile: (name, bytes) => {
      state.writes += 1;
      return network.writeIndexFile(name, bytes);
    },
    deleteIndexFile: (name) => network.deleteIndexFile(name),
  };
  return { transport, state };
}

/** The network as a transport that holds every stream read naming one of `users` until `release` runs. */
function holding(network: FakeNetwork, users: readonly string[]) {
  const state = { held: 0, open: false, release: (): void => undefined };
  const opened = new Promise<void>((resolve) => {
    state.release = () => {
      state.open = true;
      resolve();
    };
  });
  const transport: IndexerTransport = {
    resolveHomeserver: (user) => network.resolveHomeserver(user),
    readEvents: async (request) => {
      if (!state.open && request.users.some(({ user }) => users.includes(user))) {
        state.held += 1;
        await opened;
      }
      return network.readEvents(request);
    },
    getPublic: (request) => network.getPublic(request),
    listIndexFiles: () => network.listIndexFiles(),
    readIndexFile: (name) => network.readIndexFile(name),
    writeIndexFile: (name, bytes) => network.writeIndexFile(name, bytes),
    deleteIndexFile: (name) => network.deleteIndexFile(name),
  };
  return { transport, state };
}

/** The fixture network on two homeservers, a shared store, and an indexer over any transport and store. */
function socialWorld(crawler: Partial<CrawlerOptions> = {}, runtime: Partial<RuntimeOptions & SocialLimits> = {}) {
  const fixture = socialNetwork();
  const network = new FakeNetwork().addHomeserver('hs1').addHomeserver('hs2');
  network.addUser(ALICE, 'hs1').addUser(BRAN, 'hs1').addUser(CLEO, 'hs2').addUser(DION, 'hs2');
  for (const { author, path, body } of fixture.writes) network.put(author, path, body);
  for (const { author, path } of fixture.deletes) network.del(author, path);
  const store = createMemoryStore<SocialData>();
  const time = fakeTime(T0 + DAY_MS);
  const indexerOf = (transport: IndexerTransport = network, on: IndexStore<SocialData> = store) =>
    createSocialIndexer({
      transport,
      store: on,
      now: () => time.clock.now,
      schedule: time.schedule,
      options: { ...runtime, crawler },
    });
  return { fixture, network, time, indexerOf, store };
}

describe('createSocialIndexer', () => {
  it('answers the seed following stream after the first sync, and a new post after a refresh', async () => {
    const { fixture, network, time, indexerOf } = socialWorld();
    const { image, quote, repost } = fixture.posts;
    const indexer = indexerOf();

    indexer.start(ALICE);
    await indexer.whenSynced();
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

  it('serves an author outside the scope once ensured, still outside the scope', async () => {
    const { fixture, indexerOf } = socialWorld({ hops: 1 });
    const indexer = indexerOf();
    indexer.start(ALICE);
    await indexer.ready();

    const before = await indexer.request({ url: authorStream(DION), method: 'GET' });
    expect(before).toMatchObject({ status: 200, json: { post_keys: [] }, more: [{ kind: 'user', user: DION }] });
    await indexer.ensureUser(DION);

    const answer = await indexer.request({ url: authorStream(DION), method: 'GET' });
    expect(answer.json).toMatchObject({ post_keys: [key(DION, fixture.posts.collection)] });
    expect(answer.more).toBeUndefined();
    expect(indexer.view().hopOf(DION)).toBeNull();
    expect(indexer.view().membershipOf(DION)).toBe('visited');
    expect(indexer.view().authors).not.toContain(DION);
  });

  it('loads a single post of an author outside the scope without making them a member', async () => {
    const { fixture, indexerOf } = socialWorld({ hops: 1 });
    const { collection, orphan } = fixture.posts;
    const indexer = indexerOf();
    indexer.start(ALICE);
    await indexer.ready();
    expect(indexer.view().post(DION, collection.id)).toBeNull();

    await indexer.ensurePost(DION, collection.id);

    const view = indexer.view();
    expect(view.post(DION, collection.id)?.data.title).toBe('Best of');
    expect(view.post(DION, orphan.id)).toBeNull();
    expect(view.membershipOf(DION)).toBe('referenced');
    expect(view.authors).not.toContain(DION);
    expect(view.collectionsContaining(ALICE, fixture.posts.a1.id)).toEqual([]);
    const stream = await indexer.request({ url: authorStream(DION), method: 'GET' });
    expect(stream).toMatchObject({ json: { post_keys: [] }, more: [{ kind: 'user', user: DION }] });
  });

  it('proves a post deleted from the tombstones of its loaded history, outside the window', async () => {
    const { fixture, indexerOf } = socialWorld({ hops: 1, windowDays: 0.5 });
    const url = `/v1/post/${ALICE}/${fixture.posts.gone.id}`;
    const indexer = indexerOf();
    indexer.start(ALICE);
    await indexer.ready();

    const unknown = await indexer.request({ url, method: 'GET' });
    expect(unknown).toMatchObject({
      status: 404,
      more: [{ kind: 'post', author: ALICE, postId: fixture.posts.gone.id }],
    });
    await indexer.ensurePost(ALICE, fixture.posts.gone.id);

    const known = await indexer.request({ url, method: 'GET' });
    expect(known).toMatchObject({
      status: 404,
      json: { error: `post: post ${ALICE}:${fixture.posts.gone.id} not found` },
    });
    expect(known.more).toBeUndefined();
  });

  it('is ready from a store a previous session filled, without calling the transport', async () => {
    const { fixture, indexerOf } = socialWorld();
    const { image, quote, repost } = fixture.posts;
    const previous = indexerOf();
    previous.start(ALICE);
    await previous.whenSynced();
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

  it('starts a second device from the first one’s saved index and serves its posts once fetched', async () => {
    const { fixture, network, indexerOf } = socialWorld({}, { savedIndex: true });
    const { image, quote, repost } = fixture.posts;
    const first = indexerOf();
    first.start(ALICE);
    await first.whenSynced();
    await until(async () => (await network.listIndexFiles()).length === 1, 'the first save');

    const second = indexerOf(network, createMemoryStore<SocialData>());
    second.start(ALICE);
    await second.whenSynced();
    const answer = await second.request({ url: FOLLOWING, method: 'GET' });

    expect(second.status().savedIndex).toMatchObject({ loadedFiles: 1, error: null });
    expect(answer.json).toMatchObject({ post_keys: [key(BRAN, image), key(CLEO, quote), key(BRAN, repost)] });
  });

  it('never writes a visited user or a post loaded alone into the saved index', async () => {
    const { fixture, network, indexerOf } = socialWorld({ hops: 1 }, { savedIndex: true });
    const { transport, state } = countingWrites(network);
    const indexer = indexerOf(transport);
    indexer.start(ALICE);
    await indexer.whenSynced();
    await until(() => state.writes === 1, 'the first save');

    await indexer.ensureUser(DION);
    await indexer.ensurePost(ALICE, fixture.posts.gone.id);
    indexer.pause();
    await until(() => state.writes === 2, 'the save on pause');

    const [name] = await network.listIndexFiles();
    const file = await decodeIndexFile((await network.readIndexFile(name)) ?? new Uint8Array());
    expect(file.members.map(({ user }) => user).sort()).toEqual([ALICE, BRAN, CLEO].sort());
    expect(file.runs.length).toBeGreaterThan(0);
    expect(file.runs.map(({ author }) => author)).not.toContain(DION);
    expect(file.runs.every(({ group }) => group === SOCIAL_GRAPH || group === SOCIAL_ACTIVITY)).toBe(true);
  });

  it('is ready once the seed’s hop is committed and answers, marked syncing, while the first sync runs', async () => {
    const { fixture, network, time, indexerOf } = socialWorld();
    const { transport, state } = holding(network, [BRAN, CLEO]);
    const indexer = indexerOf(transport);
    let ready = false;
    indexer.start(ALICE);
    void indexer.ready().then(() => {
      ready = true;
    });

    await time.advance(DEBOUNCE);
    await settle();

    expect(ready).toBe(true);
    expect(state.held).toBeGreaterThan(0);
    const own = await indexer.request({ url: authorStream(ALICE), method: 'GET' });
    expect(own).toMatchObject({ status: 200, syncing: true });
    expect(own.json).toMatchObject({ post_keys: expect.arrayContaining([key(ALICE, fixture.posts.a1)]) });
    const early = await indexer.request({ url: `/v1/bootstrap/${ALICE}`, method: 'GET' });
    expect(early.json).toMatchObject({ indexed: false });

    state.release();
    await indexer.whenSynced();
    const following = await indexer.request({ url: FOLLOWING, method: 'GET' });
    expect(following).toMatchObject({ syncing: false });
    expect(following.json).toMatchObject({ post_keys: expect.arrayContaining([key(BRAN, fixture.posts.image)]) });
    const late = await indexer.request({ url: `/v1/bootstrap/${ALICE}`, method: 'GET' });
    expect(late.json).toMatchObject({ indexed: true });
  });

  it('is ready with an empty view when the seed’s homeserver does not resolve, and says so', async () => {
    const { network, indexerOf } = socialWorld();
    const unresolved: IndexerTransport = {
      resolveHomeserver: async (user) => (user === ALICE ? null : network.resolveHomeserver(user)),
      readEvents: (request) => network.readEvents(request),
      getPublic: (request) => network.getPublic(request),
      listIndexFiles: () => network.listIndexFiles(),
      readIndexFile: (name) => network.readIndexFile(name),
      writeIndexFile: (name, bytes) => network.writeIndexFile(name, bytes),
      deleteIndexFile: (name) => network.deleteIndexFile(name),
    };
    const indexer = indexerOf(unresolved);

    indexer.start(ALICE);
    await indexer.ready();

    expect(indexer.status().stats.seed).toEqual({ homeserver: null, failed: false });
    const own = await indexer.request({ url: authorStream(ALICE), method: 'GET' });
    expect(own.json).toMatchObject({ post_keys: [] });
  });

  it('rejects a request before start and after stop with a typed error', async () => {
    const { indexerOf } = socialWorld();
    const indexer = indexerOf();

    await expect(indexer.request({ url: FOLLOWING, method: 'GET' })).rejects.toBeInstanceOf(IndexerNotStartedError);
    indexer.start(ALICE);
    await indexer.ready();
    indexer.stop();
    await expect(indexer.request({ url: FOLLOWING, method: 'GET' })).rejects.toBeInstanceOf(IndexerNotStartedError);
  });

  describe('as a visitor', () => {
    /** A visitor over the fixture network, with a saved index on that it must never touch. */
    function visitor() {
      const world = socialWorld({}, { savedIndex: true });
      const touched = { files: 0 };
      const { network } = world;
      const transport: IndexerTransport = {
        resolveHomeserver: (user) => network.resolveHomeserver(user),
        readEvents: (request) => network.readEvents(request),
        getPublic: (request) => network.getPublic(request),
        listIndexFiles: () => {
          touched.files += 1;
          return network.listIndexFiles();
        },
        readIndexFile: (name) => {
          touched.files += 1;
          return network.readIndexFile(name);
        },
        writeIndexFile: (name, bytes) => {
          touched.files += 1;
          return network.writeIndexFile(name, bytes);
        },
        deleteIndexFile: (name) => {
          touched.files += 1;
          return network.deleteIndexFile(name);
        },
      };
      const indexer = world.indexerOf(transport);
      indexer.start(null);
      return { ...world, indexer, touched };
    }

    it('opens a post and the post it replies to, loaded on demand', async () => {
      const { fixture, network, indexer, touched } = visitor();
      const { a1, b1 } = fixture.posts;
      await indexer.ready();
      await indexer.whenSynced();
      expect(network.reads).toEqual([]);

      await indexer.ensurePost(BRAN, b1.id);
      const reply = await indexer.request({ url: `/v1/post/${BRAN}/${b1.id}`, method: 'GET' });
      await indexer.ensurePost(ALICE, a1.id);
      const parent = await indexer.request({ url: `/v1/post/${ALICE}/${a1.id}`, method: 'GET' });

      expect(reply).toMatchObject({ status: 200, syncing: false, json: { details: { content: 'Welcome' } } });
      expect(reply.json).toMatchObject({ relationships: { replied: buildUri(ALICE, 'post', a1.id) } });
      expect(parent).toMatchObject({ status: 200, json: { details: { id: a1.id, author: ALICE } } });
      expect(indexer.view().authors).toEqual([]);
      expect(touched.files).toBe(0);
    });

    it('opens a profile with its own stream', async () => {
      const { fixture, indexer, touched } = visitor();

      await indexer.ensureUser(CLEO);
      const details = await indexer.request({ url: `/v1/user/${CLEO}/details`, method: 'GET' });
      const stream = await indexer.request({ url: authorStream(CLEO), method: 'GET' });

      expect(details).toMatchObject({ status: 200, json: { name: 'Cleo' } });
      expect(stream.json).toMatchObject({ post_keys: expect.arrayContaining([key(CLEO, fixture.posts.quote)]) });
      expect(indexer.view().membershipOf(CLEO)).toBe('visited');
      expect(touched.files).toBe(0);
    });

    it('answers no scope-wide stream, ranking or search', async () => {
      const { indexer } = visitor();
      await indexer.ensureUser(CLEO);

      for (const url of [
        '/v1/stream/posts/keys?source=all',
        '/v1/stream/users/ids?source=most_followed',
        '/v1/search/users/by_name/cl',
        '/v1/tags/hot',
        `/v1/user/${CLEO}/notifications`,
      ]) {
        await expect(indexer.request({ url, method: 'GET' }), url).rejects.toBeInstanceOf(UnavailableQueryError);
      }
      await indexer.refresh();
    });
  });

  it('loads a profile alone, for an avatar, without the user’s follows or posts', async () => {
    const { indexerOf, store } = socialWorld({ hops: 0 });
    const indexer = indexerOf();
    indexer.start(ALICE);
    await indexer.whenSynced();

    await indexer.ensureProfile(CLEO);

    const view = indexer.view();
    expect(view.profile(CLEO)).toMatchObject({ name: 'Cleo', image: 'https://example.com/cleo.png' });
    expect(view.membershipOf(CLEO)).toBe('referenced');
    expect(view.postsBy(CLEO)).toEqual([]);
    const groups = (await store.listScopes()).filter(({ author }) => author === CLEO).map(({ group }) => group);
    expect(groups).toEqual(['profile']);
  });

  it('forgets the least recently loaded user and post past the limits, and loads them again on demand', async () => {
    const { fixture, indexerOf, store } = socialWorld({ hops: 0 }, { maxVisitedUsers: 1, maxLoosePosts: 1 });
    const { collection, orphan } = fixture.posts;
    const indexer = indexerOf();
    indexer.start(ALICE);
    await indexer.whenSynced();
    const scopesOf = async (author: string) =>
      (await store.listScopes()).filter((scope) => scope.author === author).map(({ group }) => group);

    await indexer.ensureUser(BRAN);
    await indexer.ensureUser(CLEO);
    await indexer.ensurePost(DION, collection.id);
    await indexer.ensurePost(DION, orphan.id);

    const view = indexer.view();
    expect(view.membershipOf(BRAN)).toBeNull();
    expect(view.membershipOf(CLEO)).toBe('visited');
    expect(await scopesOf(BRAN)).toEqual([]);
    expect(view.post(DION, collection.id)).toBeNull();
    expect(view.post(DION, orphan.id)).not.toBeNull();
    expect(await scopesOf(DION)).toEqual([`post:${orphan.id}`]);

    await indexer.ensureUser(BRAN);
    expect(indexer.view().profile(BRAN)).toMatchObject({ name: 'Bran' });
    expect(indexer.view().membershipOf(CLEO)).toBeNull();
  });
});
