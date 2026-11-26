// @vitest-environment node
import { describe, expect, it } from 'vitest';
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
import { createIndexerRuntime } from './indexer';
import { HomeserverUnreachableError } from './indexer.errors';
import { createMemoryStore } from './memoryStore';
import { createTabs, fakeTime, settle } from './runtime.fixtures';
import type { Coordination, RuntimeStatus } from './runtime.types';
import { scopeId } from './store.helpers';
import type { IndexerTransport } from './transport.types';

const DEBOUNCE = 250;
const MINUTE_MS = 60 * 1000;
const BOB = { author: 'bob', homeserver: 'hs1', group: ACTIVITY };

/**
 * alice follows bob; bob posted and tagged twice, carol posted. Tag fetches can be held until `open`, each one also
 * ending when its signal fires as a fetch does, or failed as unreachable.
 */
function world(coordination?: Coordination) {
  const network = new FakeNetwork().addHomeserver('hs1');
  for (const user of ['alice', 'bob', 'carol']) network.addUser(user, 'hs1');
  network.put('alice', `${FOLLOWS}bob`);
  const post = postPath(DAY_MS);
  network.putJson('bob', post, { text: 'bob' });
  network.putJson('bob', `${TAGS}t1`, { text: 't1' });
  network.putJson('bob', `${TAGS}t2`, { text: 't2' });
  network.putJson('carol', post, { text: 'carol' });
  const tags = { hold: false, fail: false, held: new Set<() => void>(), asked: 0, aborted: 0 };
  const transport: IndexerTransport = {
    resolveHomeserver: (user) => network.resolveHomeserver(user),
    readEvents: (request) => network.readEvents(request),
    getPublic: async (request) => {
      if (request.path.startsWith(TAGS)) {
        tags.asked += 1;
        if (tags.fail) throw new HomeserverUnreachableError(request.author);
        if (tags.hold) {
          await new Promise<void>((resolve, reject) => {
            const release = () => {
              tags.held.delete(release);
              resolve();
            };
            tags.held.add(release);
            request.signal?.addEventListener(
              'abort',
              () => {
                tags.held.delete(release);
                tags.aborted += 1;
                reject(new Error('fetch aborted'));
              },
              { once: true },
            );
          });
        }
      }
      return network.getPublic(request);
    },
    listIndexFiles: () => network.listIndexFiles(),
    readIndexFile: (name) => network.readIndexFile(name),
    writeIndexFile: (name, bytes) => network.writeIndexFile(name, bytes),
    deleteIndexFile: (name) => network.deleteIndexFile(name),
  };
  const open = () => {
    tags.hold = false;
    for (const release of [...tags.held]) release();
  };
  const store = createMemoryStore<Post>();
  const time = fakeTime(NOW);
  /** Another runtime on the same network and store, as another tab. */
  const runtimeOn = (tab?: Coordination) =>
    createIndexerRuntime({
      transport,
      store,
      domain: taggedDomain,
      now: () => time.clock.now,
      schedule: time.schedule,
      coordination: tab,
    });
  const runtime = runtimeOn(coordination);
  const changes: StoreChange[] = [];
  runtime.onChange((change) => changes.push(change));
  /** Whether a change reported since the last call named bob's activity. */
  const bobChanged = () => changes.splice(0).some(({ scopes }) => scopes.some((s) => scopeId(s) === scopeId(BOB)));
  const bob = () => servedData(store, 'bob', 'hs1', ACTIVITY);
  return { post, tags, open, store, time, runtime, runtimeOn, bobChanged, bob };
}

describe('createIndexerRuntime fill', () => {
  it('reports the fill of a first sync as pending from the sync’s end to its own, never idle in between', async () => {
    const { tags, open, runtime } = world();
    const seen: RuntimeStatus[] = [];
    runtime.onStatus((status) => seen.push(status));
    tags.hold = true;

    runtime.start('alice');
    await settle();

    expect(tags.held.size).toBe(2);
    const synced = seen.filter(({ lastSyncAt }) => lastSyncAt !== null);
    expect(synced.length).toBeGreaterThan(0);
    for (const status of synced) expect(status).toMatchObject({ state: 'syncing', bodiesPending: true });
    expect(runtime.status()).toMatchObject({ state: 'syncing', firstSyncPending: false, bodiesPending: true });

    open();
    await settle();
    expect(runtime.status()).toMatchObject({ state: 'idle', bodiesPending: false });
    expect(seen.filter(({ state }) => state === 'idle').every(({ bodiesPending }) => !bodiesPending)).toBe(true);
  });

  it('reports every change of the fill before the status that says it ended', async () => {
    const { open, tags, runtime, bobChanged } = world();
    tags.hold = true;
    runtime.start('alice');
    await settle();
    bobChanged();
    const changedWhenDone: boolean[] = [];
    runtime.onStatus((status) => {
      if (!status.bodiesPending) changedWhenDone.push(bobChanged());
    });

    open();
    await settle();

    // No debounce period passed: the fill's commits were reported when it ended.
    expect(changedWhenDone[0]).toBe(true);
  });

  it('aborts the fill when its tab steps down; the other tab hears it pending and fills the rest', async () => {
    const tabs = createTabs();
    const first = world(tabs.join());
    const second = first.runtimeOn(tabs.join());
    first.tags.hold = true;
    first.runtime.start('alice');
    second.start('alice');
    await settle();
    expect(first.tags.held.size).toBe(2);
    expect(second.status()).toMatchObject({ firstSyncPending: false, bodiesPending: true });

    first.runtime.pause();
    await settle();
    expect(first.tags.aborted).toBe(2);

    first.open();
    await settle();
    expect((await first.bob()).get(`${TAGS}t1`)).toEqual({ text: 't1' });
    expect(second.status()).toMatchObject({ state: 'idle', bodiesPending: false });
    expect(first.runtime.status()).toMatchObject({ bodiesPending: false });
  });

  it('settles a visit once the posts are in, then fetches the tags, reporting both commits', async () => {
    const { post, tags, open, time, runtime, bobChanged, bob } = world();
    runtime.start(null);
    await settle();
    tags.hold = true;

    await runtime.ensureUser('bob');
    await settle();

    expect(tags.held.size).toBe(2);
    expect(await bob()).toEqual(
      new Map([
        [post, { text: 'bob' }],
        [`${TAGS}t1`, undefined],
        [`${TAGS}t2`, undefined],
      ]),
    );
    await time.advance(DEBOUNCE);
    expect(bobChanged()).toBe(true);

    open();
    await time.advance(DEBOUNCE);
    expect(bobChanged()).toBe(true);
    expect(await bob()).toEqual(
      new Map([
        [post, { text: 'bob' }],
        [`${TAGS}t1`, { text: 't1' }],
        [`${TAGS}t2`, { text: 't2' }],
      ]),
    );
    expect(runtime.status()).toMatchObject({ state: 'idle', lastError: null });
  });

  it('runs a request beside the fill, aborting none of its fetches, and keeps the files they bring', async () => {
    const { post, tags, open, store, runtime, bob } = world();
    runtime.start(null);
    tags.hold = true;
    await runtime.ensureUser('bob');
    await settle();
    expect(tags.held.size).toBe(2);

    // Settles while the tag fetches still hang: the request waited for none of them.
    await runtime.ensureUser('carol');

    expect((await servedData(store, 'carol', 'hs1', ACTIVITY)).get(post)).toEqual({ text: 'carol' });
    expect(tags.held.size).toBe(2);
    expect(tags.aborted).toBe(0);
    open();
    await settle();
    expect((await bob()).get(`${TAGS}t1`)).toEqual({ text: 't1' });
    expect((await bob()).get(`${TAGS}t2`)).toEqual({ text: 't2' });
    expect(tags.asked).toBe(2);
    expect(runtime.status()).toMatchObject({ state: 'idle', lastError: null });
  });

  it('runs a scope sync beside the fill without aborting its fetches', async () => {
    const { tags, open, runtime, bob } = world();
    tags.hold = true;
    runtime.start('alice');
    await settle();
    expect(tags.held.size).toBe(2);

    await runtime.refresh();

    expect(runtime.status().lastSyncAt).toBe(NOW);
    expect((await bob()).get(`${TAGS}t1`)).toBeUndefined();
    expect(tags.aborted).toBe(0);
    open();
    await settle();
    expect((await bob()).get(`${TAGS}t1`)).toEqual({ text: 't1' });
  });

  it('stores nothing from a file that arrives after its user was forgotten', async () => {
    const { tags, open, store, runtime } = world();
    runtime.start(null);
    tags.hold = true;
    await runtime.ensureUser('bob');
    await settle();
    expect(tags.held.size).toBe(2);

    await runtime.forget({ users: ['bob'] });
    open();
    await settle();

    expect((await store.listScopes()).filter(({ author }) => author === 'bob')).toEqual([]);
    expect(await store.readCoverage(BOB)).toEqual([]);
  });

  it('stops the fill with the runtime, which fetches the rest after the next start', async () => {
    const { tags, open, runtime, bob } = world();
    runtime.start(null);
    tags.hold = true;
    await runtime.ensureUser('bob');
    await settle();

    runtime.stop();
    await settle();
    expect(tags.aborted).toBe(2);

    open();
    runtime.start(null);
    await settle();
    expect((await bob()).get(`${TAGS}t1`)).toEqual({ text: 't1' });
  });

  it('keeps the posts when the fill fails, and fetches the tags after the next crawl', async () => {
    const { post, tags, store, time, runtime, bob } = world();
    runtime.start(null);
    tags.fail = true;
    await runtime.ensureUser('bob');
    // Past every retry wait of both tags.
    await time.advance(30 * 1000);

    expect(await bob()).toEqual(
      new Map([
        [post, { text: 'bob' }],
        [`${TAGS}t1`, undefined],
        [`${TAGS}t2`, undefined],
      ]),
    );
    expect((await store.readHomeserverState('hs1')).failure).not.toBeNull();
    const asked = tags.asked;
    await time.advance(2 * MINUTE_MS);
    expect(tags.asked).toBe(asked);

    tags.fail = false;
    await runtime.ensureUser('carol');
    await settle();
    expect((await bob()).get(`${TAGS}t2`)).toEqual({ text: 't2' });
  });
});
