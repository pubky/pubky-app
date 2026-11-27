// @vitest-environment node
import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createCrawler } from './crawler';
import {
  ACTIVITY,
  DAY_MS,
  FOLLOWS,
  GRAPH,
  NOW,
  type Post,
  postPath,
  POSTS,
  served,
  taggedDomain,
  TAGS,
  testDomain,
} from './crawler.fixtures';
import type { Domain } from './domain.types';
import { restoreEpoch } from './epoch';
import { FakeIndexFiles, FakeNetwork } from './fakeNetwork';
import { createIndexerRuntime } from './indexer';
import type { Cursor, Entry, Run } from './indexer.types';
import { decodeIndexFile, encodeIndexFile, type IndexFileModel, type ReviveData } from './indexFile';
import { createIndexSealer } from './indexSealer';
import { createMemoryStore } from './memoryStore';
import { fakeTime } from './runtime.fixtures';
import type { IndexSealer, RuntimeOptions } from './runtime.types';
import {
  bucketOf,
  createSavedIndex,
  deltaPath,
  fitToBudget,
  folderOf,
  hotPath,
  packPath,
  type SavedIndexLimits,
} from './savedIndex';
import { scopeId } from './store.helpers';
import type { IndexStore, ScopeKey } from './store.types';
import type { IndexerTransport, IndexFiles, ReadEventsRequest } from './transport.types';

const HOUR_MS = 60 * 60 * 1000;
const PATHS: Record<string, string[]> = { [GRAPH]: [FOLLOWS], [ACTIVITY]: [POSTS, TAGS] };
/** The folder of the test domain's groups: the first 5 hex digits of the SHA-256 of `activity,graph`. */
const FOLDER = '3/gbb13a/';
const USERS = ['alice', 'bob', 'carol'];

/** Polls with real timers: gzip runs outside the fake clock. */
async function until(check: () => boolean | Promise<boolean>, what = 'condition'): Promise<void> {
  for (let i = 0; i < 1000; i += 1) {
    if (await check()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(`timed out waiting for ${what}`);
}

const isPost = (value: unknown): value is Post =>
  typeof value === 'object' && value !== null && 'text' in value && typeof value.text === 'string';
const revivePost: ReviveData<Post> = (_author, _path, value) => (isPost(value) ? value : null);
/** The test domain reading payloads back from saved files, as the social domain does. */
const savedDomain: Domain<Post> = { ...testDomain, reviveData: revivePost };

/** Text that does not compress, the same for the same seed. */
function noise(seed: number, length: number): string {
  let state = seed * 2654435761;
  let out = '';
  while (out.length < length) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    out += state.toString(36);
  }
  return out.slice(0, length);
}

/**
 * alice follows bob, bob follows carol; each posted `posts[user]` times, an hour apart. `wide` more users, each with
 * a post, are followed by bob, at hop 2, so an index grows past a small `hot`.
 */
function world(posts: Record<string, number> = { alice: 2, bob: 3, carol: 4 }, wide = 0) {
  const network = new FakeNetwork().addHomeserver('hs1');
  const clock = { now: NOW };
  network.indexFiles.now = () => clock.now;
  for (const user of USERS) network.addUser(user, 'hs1');
  network.put('alice', `${FOLLOWS}bob`);
  network.put('bob', `${FOLLOWS}carol`);
  for (let i = 0; i < wide; i += 1) {
    network.addUser(`u${i}`, 'hs1');
    network.put('bob', `${FOLLOWS}u${i}`);
    network.putJson(`u${i}`, postPath(HOUR_MS * (i + 1)), { text: noise(i + 1, 200) });
  }
  for (const [user, count] of Object.entries(posts)) {
    for (let k = 1; k <= count; k += 1) network.putJson(user, postPath(k * HOUR_MS), { text: `${user} ${k}` });
  }
  return { network, clock, files: network.indexFiles };
}

type World = ReturnType<typeof world>;

interface DeviceOptions {
  store?: IndexStore<Post>;
  files?: IndexFiles;
  sealer?: IndexSealer;
  limits?: Partial<SavedIndexLimits>;
  budget?: number;
  domain?: Domain<Post>;
}

/** One device: its store, a crawler, and its saved index, made again by `restart` as a new session does. */
function device(w: World, writer: string, options: DeviceOptions = {}) {
  const store = options.store ?? createMemoryStore<Post>();
  const domain = options.domain ?? savedDomain;
  const crawler = createCrawler<Post>({
    transport: w.network,
    store,
    domain,
    now: () => w.clock.now,
    sleep: async () => undefined,
  });
  const make = () =>
    createSavedIndex({
      files: options.files ?? w.files,
      store,
      domain,
      seed: 'alice',
      writer,
      now: () => w.clock.now,
      hops: 2,
      windowDays: 30,
      budget: options.budget ?? Infinity,
      expiryMs: 30 * DAY_MS,
      sealer: options.sealer,
      limits: options.limits,
    });
  let saved = make();
  return {
    store,
    crawler,
    sync: () => crawler.syncScope('alice'),
    load: () => saved.load(() => undefined),
    flush: (mayFold = true) => saved.flush(mayFold),
    restart: () => {
      saved = make();
    },
  };
}

const sortedScopes = async (store: IndexStore<Post>) =>
  [...(await store.listScopes())].sort((a, b) => (scopeId(a) < scopeId(b) ? -1 : 1));

/** Every scope the store holds, exported with data. */
async function everything(store: IndexStore<Post>) {
  const scopes = await sortedScopes(store);
  return { scopes: scopes.map(scopeId), runs: await Promise.all(scopes.map((scope) => store.exportRuns(scope))) };
}

/** What each user's scopes serve, by path and cursor. */
async function servedAll(store: IndexStore<Post>, users: readonly string[]) {
  const out: Record<string, Array<[string, Cursor]>> = {};
  for (const user of users) {
    for (const group of [GRAPH, ACTIVITY]) out[`${user} ${group}`] = [...(await served(store, user, 'hs1', group))];
  }
  return out;
}

/** What a full crawl serves for each user, by path and cursor. */
function truthOf(network: FakeNetwork, users: readonly string[]) {
  const out: Record<string, Array<[string, Cursor]>> = {};
  for (const user of users) {
    for (const group of [GRAPH, ACTIVITY]) out[`${user} ${group}`] = [...network.liveOf(user, PATHS[group])];
  }
  return out;
}

/**
 * Every record the store serves is its homeserver's truth over the range it trusts: exactly the paths whose last
 * event in that range is a write, at that event.
 */
async function expectTruthful(store: IndexStore<Post>, network: FakeNetwork, what: string) {
  for (const scope of await store.listScopes()) {
    const { live, trusted } = await store.readScope(scope);
    if (trusted === null) continue;
    const truth = [...network.lastEvents(scope.author, PATHS[scope.group], trusted.tail, trusted.head)]
      .filter(([, event]) => event.type === 'PUT')
      .map(([path, event]): [string, Cursor] => [path, event.cursor])
      .sort(([a], [b]) => (a < b ? -1 : 1));
    const kept = [...live].map(([path, record]): [string, Cursor] => [path, record.cursor]);
    expect(kept, `${what}: ${scopeId(scope)}`).toEqual(truth);
  }
}

async function decoded(files: FakeIndexFiles, path: string): Promise<IndexFileModel<Post>> {
  return decodeIndexFile((await files.read(path)) ?? new Uint8Array(), revivePost);
}

const requestsSince = (files: FakeIndexFiles, from: number) =>
  files.requests.slice(from).map(({ op, path }) => `${op} ${path.slice(FOLDER.length)}`);

const authorsOf = (runs: readonly Run<Post>[]) => [...new Set(runs.map(({ author }) => author))].sort();

const shardsOf = (model: IndexFileModel<Post>) => (model.part.kind === 'hot' ? model.part.shards : -1);

describe('saved index folder', () => {
  it('names the folder by its groups', async () => {
    expect(await folderOf(testDomain.groups.map(({ id }) => id))).toBe(FOLDER);
    expect(await folderOf(['graph', 'activity'])).toBe(FOLDER);
    expect(await folderOf(['graph+legacy', 'activity+legacy'])).not.toBe(FOLDER);
  });

  it('keeps the whole index in hot while it fits, and a new device starts from hot and the deltas in 3 requests', async () => {
    const w = world();
    const a = device(w, 'wa');
    await a.sync();
    expect(await a.flush()).toBe('folded');
    expect([...w.files.files.keys()]).toEqual([hotPath(FOLDER)]);
    const hot = await decoded(w.files, hotPath(FOLDER));
    expect(hot.part).toMatchObject({ kind: 'hot', shards: 0, packs: [], cut: [] });
    expect(authorsOf(hot.runs)).toEqual(USERS);

    w.network.putJson('bob', postPath(HOUR_MS / 2), { text: 'new' });
    await a.sync();
    expect(await a.flush()).toBe('delta');

    const b = device(w, 'wb');
    const from = w.files.requests.length;
    const outcome = await b.load();

    expect(requestsSince(w.files, from).sort()).toEqual(['list d/', 'read d/wa', 'read hot']);
    expect(outcome).toMatchObject({ loaded: 2, ignored: 0 });
    expect(await everything(b.store)).toEqual(await everything(a.store));
    expect(await b.store.readScopeMembers('alice')).toEqual(await a.store.readScopeMembers('alice'));
    await expectTruthful(b.store, w.network, 'loaded');
  });

  it('writes nothing when no member changed, and one delta under 64 KB when two authors did', async () => {
    const w = world();
    const a = device(w, 'wa');
    await a.sync();
    await a.flush();
    const before = w.network.headOf('hs1');

    let from = w.files.requests.length;
    expect(await a.flush()).toBe('unchanged');
    expect(w.files.requests.length).toBe(from);

    w.network.putJson('bob', postPath(HOUR_MS / 2), { text: 'bob new' });
    w.network.putJson('carol', postPath(HOUR_MS / 3), { text: 'carol new' });
    await a.sync();
    from = w.files.requests.length;
    expect(await a.flush()).toBe('delta');

    expect(requestsSince(w.files, from)).toEqual(['write d/wa']);
    expect(w.files.requests[from].bytes).toBeLessThan(64 * 1024);
    const delta = await decoded(w.files, deltaPath(FOLDER, 'wa'));
    expect(delta.part).toEqual({ kind: 'delta', gen: 1, base: 0 });
    expect(authorsOf(delta.runs)).toEqual(['bob', 'carol']);
    for (const run of delta.runs) {
      expect(run.group).toBe(ACTIVITY);
      expect(run.tail <= before).toBe(true);
      expect(run.entries).toHaveLength(1);
    }

    // A save after a commit that changed no member's heads leaves the delta as it is.
    from = w.files.requests.length;
    expect(await a.flush()).toBe('unchanged');
    expect(w.files.requests.length).toBe(from);
  });

  it('rebases its delta once hot records its generation folded, and then carries only what came after', async () => {
    const w = world();
    const a = device(w, 'wa');
    await a.sync();
    await a.flush();
    w.network.putJson('bob', postPath(HOUR_MS / 2), { text: 'bob new' });
    await a.sync();
    expect(await a.flush()).toBe('delta');

    const b = device(w, 'wb', { limits: { deltaFoldBytes: 0 } });
    await b.load();
    w.network.putJson('carol', postPath(HOUR_MS / 3), { text: 'carol new' });
    await b.sync();
    expect(await b.flush()).toBe('folded');
    expect((await decoded(w.files, hotPath(FOLDER))).part).toMatchObject({ folded: [{ writer: 'wa', gen: 1 }] });

    a.restart();
    await a.load();
    w.network.putJson('alice', postPath(HOUR_MS / 4), { text: 'alice new' });
    await a.sync();
    expect(await a.flush()).toBe('delta');

    const delta = await decoded(w.files, deltaPath(FOLDER, 'wa'));
    expect(delta.part).toEqual({ kind: 'delta', gen: 2, base: 1 });
    expect(authorsOf(delta.runs)).toEqual(['alice']);
  });

  it('folds under the lock on hot, and leaves the fold to a writer that holds it', async () => {
    const w = world();
    const a = device(w, 'wa');
    await a.sync();
    const held = await w.files.lock(hotPath(FOLDER), 30);

    expect(await a.flush()).toBe('delta');
    expect(w.files.files.has(hotPath(FOLDER))).toBe(false);

    await w.files.unlock(held);
    const from = w.files.requests.length;
    expect(await a.flush()).toBe('folded');
    const fold = requestsSince(w.files, from);
    expect(fold[0]).toBe('lock hot');
    expect(fold[fold.length - 1]).toBe('unlock hot');
    expect(fold).toContain('write hot');
    expect(w.files.locked(hotPath(FOLDER))).toBe(false);
  });

  it('refreshes the lock on hot it holds while a fold runs long', async () => {
    const w = world();
    const a = device(w, 'wa', { limits: { lockRefreshMs: 0 } });
    await a.sync();
    const from = w.files.requests.length;

    expect(await a.flush()).toBe('folded');
    expect(requestsSince(w.files, from)).toContain('refresh hot');
  });

  /**
   * Two writers with a change each, `b` folding first and holding its write of `hot` until `a` has flushed: the
   * interleaving where an unlocked read, merge, write loses the work of the writer that wrote first.
   */
  async function race(locking: boolean) {
    const w = world();
    w.files.locking = locking;
    const a = device(w, 'wa', { limits: { deltaFoldBytes: 0 } });
    await a.sync();
    await a.flush();
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const files = w.files.with({
      write: async (path, bytes, lock) => {
        if (path === hotPath(FOLDER)) await held;
        return w.files.write(path, bytes, lock);
      },
    });
    const b = device(w, 'wb', { limits: { deltaFoldBytes: 0 }, files });
    await b.load();
    w.network.putJson('carol', postPath(HOUR_MS / 3), { text: 'carol new' });
    await b.sync();
    w.network.putJson('bob', postPath(HOUR_MS / 2), { text: 'bob new' });
    await a.sync();

    const from = w.files.requests.length;
    const second = b.flush();
    const readsHot = () =>
      w.files.requests.slice(from).some(({ op, path }) => op === 'read' && path === hotPath(FOLDER));
    await until(readsHot, 'b to read hot');
    const first = await a.flush();
    release();
    return { w, outcomes: [first, await second] };
  }

  it('lets one of two writers folding at once fold, the other keeping its changes in its delta', async () => {
    const { w, outcomes } = await race(true);

    expect(outcomes).toEqual(['delta', 'folded']);
    const reader = device(w, 'wr');
    await reader.load();
    await expectTruthful(reader.store, w.network, 'after the race');
    expect(await servedAll(reader.store, USERS)).toEqual(truthOf(w.network, USERS));
  });

  it('never lies without locks, where two folds at once lose work the next sync reads again', async () => {
    const { w, outcomes } = await race(false);

    expect(outcomes).toEqual(['folded', 'folded']);
    const reader = device(w, 'wr');
    await reader.load();
    await expectTruthful(reader.store, w.network, 'after two unlocked folds');
    // The fold that wrote last never saw bob's post: the folder lacks it, and a reader's coverage says so.
    const truth = truthOf(w.network, USERS);
    expect((await servedAll(reader.store, USERS))['bob activity']).toHaveLength(truth['bob activity'].length - 1);
    await reader.sync();
    expect(await servedAll(reader.store, USERS)).toEqual(truth);
  });

  it('writes nothing shared when its lock is lost mid-fold, and folds again later', async () => {
    const w = world();
    const a = device(w, 'wa', { limits: { deltaFoldBytes: 0 } });
    await a.sync();
    await a.flush();
    const before = await w.files.read(hotPath(FOLDER));
    w.network.putJson('bob', postPath(HOUR_MS / 2), { text: 'bob new' });
    await a.sync();
    w.files.fault = ({ op, path }) => {
      // A tab paused past its lock's lifetime: the lock is gone when the write arrives.
      if (op === 'write' && path === hotPath(FOLDER)) w.files.expire(path);
    };

    expect(await a.flush()).toBe('delta');
    expect(await w.files.read(hotPath(FOLDER))).toEqual(before);
    w.files.fault = null;
    const reader = device(w, 'wr');
    await reader.load();
    expect(await servedAll(reader.store, USERS)).toEqual(truthOf(w.network, USERS));

    w.network.putJson('carol', postPath(HOUR_MS / 3), { text: 'carol new' });
    await a.sync();
    expect(await a.flush()).toBe('folded');
    const again = device(w, 'wr2');
    await again.load();
    expect(await servedAll(again.store, USERS)).toEqual(truthOf(w.network, USERS));
  });

  it('leaves a truthful folder after a crash between any two requests, and loses nothing for good', async () => {
    const users = [...USERS, 'u0', 'u1', 'u2', 'u3'];
    const limits = { hotMaxBytes: 800, firstShards: 2, deltaFoldBytes: 0 };
    /** A folded folder, then two authors' changes synced and folded, every request from `crashAt` on failing. */
    const run = async (crashAt: number) => {
      const w = world({ alice: 2, bob: 3, carol: 4 }, 4);
      const a = device(w, 'wa', { limits });
      await a.sync();
      await a.flush();
      w.network.putJson('bob', postPath(HOUR_MS / 2), { text: 'bob new' });
      w.network.putJson('u1', postPath(HOUR_MS / 3), { text: 'u1 new' });
      await a.sync();
      let sent = 0;
      w.files.fault = () => {
        sent += 1;
        if (sent > crashAt) throw new Error('the tab closed');
      };
      const outcome = await a.flush().catch(() => 'crashed');
      w.files.fault = null;
      return { w, a, outcome, sent };
    };
    const clean = await run(Infinity);
    expect(clean.outcome).toBe('folded');
    expect(shardsOf(await decoded(clean.w.files, hotPath(FOLDER)))).toBe(2);

    for (let crashAt = 0; crashAt < clean.sent; crashAt += 1) {
      // A crash in the unlock or the deletions after `hot` is written leaves the fold done.
      const { w, a } = await run(crashAt);
      const reader = device(w, 'wr');
      await reader.load();
      await expectTruthful(reader.store, w.network, `crash after ${crashAt}`);
      await reader.sync();
      expect(await servedAll(reader.store, users), `crash after ${crashAt}`).toEqual(truthOf(w.network, users));

      a.restart();
      await a.load();
      await a.flush();
      const later = device(w, 'wl');
      await later.load();
      expect(await servedAll(later.store, users), `recovered after ${crashAt}`).toEqual(truthOf(w.network, users));
    }
  });

  it('spreads authors over packs past the hot size, and splits each bucket when the packs double', async () => {
    const users = [...USERS, ...Array.from({ length: 8 }, (_, i) => `u${i}`)];
    const w = world({ alice: 2, bob: 3, carol: 4 }, 8);
    const limits = { hotMaxBytes: 1500, firstShards: 2, packSplitBytes: 1200, packMergeBytes: 10, deltaFoldBytes: 0 };
    const a = device(w, 'wa', { limits });
    await a.sync();
    expect(await a.flush()).toBe('folded');

    const hot = await decoded(w.files, hotPath(FOLDER));
    const shards = shardsOf(hot);
    expect(shards).toBeGreaterThanOrEqual(2);
    // Hops 0 and 1 only: alice and bob.
    expect(authorsOf(hot.runs)).toEqual(['alice', 'bob']);
    for (let bucket = 0; bucket < shards; bucket += 1) {
      const pack = await decoded(w.files, packPath(FOLDER, shards, bucket));
      for (const author of authorsOf(pack.runs)) expect(bucketOf(author, shards)).toBe(bucket);
    }
    const b = device(w, 'wb');
    const from = w.files.requests.length;
    await b.load();
    expect(w.files.requests.length - from).toBe(2 + shards);
    expect(await servedAll(b.store, users)).toEqual(await servedAll(a.store, users));

    for (let i = 0; i < 8; i += 1) {
      for (let k = 0; k < 6; k += 1) {
        w.network.putJson(`u${i}`, postPath(Math.floor(HOUR_MS / (k + 2))), { text: noise(100 * i + k, 300) });
      }
    }
    await a.sync();
    expect(await a.flush()).toBe('folded');
    // The directory now records the grown packs, so the next fold doubles them.
    expect(shardsOf(await decoded(w.files, hotPath(FOLDER)))).toBe(shards);
    w.network.putJson('alice', postPath(Math.floor(HOUR_MS / 7)), { text: 'alice new' });
    await a.sync();
    expect(await a.flush()).toBe('folded');
    const doubled = shardsOf(await decoded(w.files, hotPath(FOLDER)));
    expect(doubled).toBeGreaterThan(shards);
    expect([...w.files.files.keys()].some((path) => path.startsWith(`${FOLDER}p/${shards}/`))).toBe(false);
    for (let bucket = 0; bucket < doubled; bucket += 1) {
      const pack = await decoded(w.files, packPath(FOLDER, doubled, bucket));
      for (const author of authorsOf(pack.runs)) {
        expect(bucketOf(author, doubled)).toBe(bucket);
        expect(bucketOf(author, doubled) % shards).toBe(bucketOf(author, shards));
      }
    }
    const c = device(w, 'wc');
    await c.load();
    expect(await servedAll(c.store, users)).toEqual(truthOf(w.network, users));
  });

  it('reads version 2 files without hot, folds them in and deletes them, and takes in one written again', async () => {
    const w = world();
    const old = device(w, 'old');
    await old.sync();
    /** The old device's file as the previous release writes it. */
    const versionTwo = async () => {
      const scratch = new FakeIndexFiles();
      await createSavedIndex({
        files: scratch,
        store: old.store,
        domain: savedDomain,
        seed: 'alice',
        writer: 'old',
        now: () => w.clock.now,
        hops: 2,
        windowDays: 30,
        budget: Infinity,
        expiryMs: DAY_MS,
      }).flush(true);
      const bytes = (await scratch.read(hotPath(FOLDER))) ?? new Uint8Array();
      const [, , ...rest] = JSON.parse(gunzipSync(bytes).toString('utf8')) as unknown[];
      const marks = (rest[7] as unknown[][]).map(([homeserver, , cursor, author]) => [homeserver, cursor, author]);
      return new Uint8Array(gzipSync(JSON.stringify([2, ...rest.slice(0, 7), marks, rest[8]])));
    };
    await w.files.write('old.idx', await versionTwo());

    const b = device(w, 'wb');
    expect(await b.load()).toMatchObject({ loaded: 1, ignored: 0 });
    expect(await everything(b.store)).toEqual(await everything(old.store));
    expect(await b.flush()).toBe('folded');
    expect([...w.files.files.keys()]).toEqual([hotPath(FOLDER)]);

    // The previous release still runs on the old device, which writes its file again.
    w.network.putJson('carol', postPath(HOUR_MS / 2), { text: 'carol new' });
    await old.sync();
    await w.files.write('old.idx', await versionTwo());
    const c = device(w, 'wc', { limits: { deltaFoldBytes: 0 } });
    await c.load();
    w.network.putJson('alice', postPath(HOUR_MS / 3), { text: 'alice new' });
    await c.crawler.syncUsers(['alice']);
    expect(await c.flush()).toBe('folded');
    expect(w.files.files.has('old.idx')).toBe(false);
    const hot = await decoded(w.files, hotPath(FOLDER));
    const carol = hot.runs.find(({ author, group }) => author === 'carol' && group === ACTIVITY);
    expect(carol?.entries.map(({ path }) => path)).toContain(postPath(HOUR_MS / 2));
    // Nothing the new layout writes has a name the previous release reads.
    expect([...w.files.files.keys()].some((path) => /^[^/]+\.idx$/.test(path))).toBe(false);
  });

  it('round trips each homeserver’s epoch and records still waiting for their file', async () => {
    const w = world({ alice: 1, bob: 2, carol: 1 });
    w.network.put('bob', `${TAGS}t1`, new TextEncoder().encode(JSON.stringify({ text: 'tag' })));
    const a = device(w, 'wa', { domain: taggedDomain });
    // A restore this device saw earlier.
    await a.store.commit({ deleteHomeservers: [{ homeserver: 'hs1', epoch: 'r5.a' }] });
    await a.sync();
    expect(await a.flush()).toBe('folded');

    const hot = await decoded(w.files, hotPath(FOLDER));
    expect(hot.homeservers).toMatchObject([{ homeserver: 'hs1', epoch: 'r5.a' }]);
    const tag = hot.runs.flatMap(({ entries }) => entries).find(({ path }) => path === `${TAGS}t1`);
    expect(tag).toMatchObject({ kind: 'record' });
    expect(tag?.kind === 'record' ? tag.data : null).toBeUndefined();

    const b = device(w, 'wb', { domain: taggedDomain });
    await b.load();
    expect((await b.store.readHomeserverState('hs1')).epoch).toBe('r5.a');
    expect(await everything(b.store)).toEqual(await everything(a.store));
    // Rebuilt from the dated records it loaded.
    expect((await b.store.readHomeserverState('hs1')).clock.length).toBeGreaterThan(0);
    expect(await b.crawler.hydrate(await b.store.listScopes())).toMatchObject({ fetched: 1, remaining: 0 });
  });

  it('drops what a file holds of a homeserver another writer saw restored, and a fold purges it', async () => {
    const w = world();
    // An edit and a delete, so the rebuilt log is shorter than the one the files saw.
    w.network.putJson('carol', postPath(HOUR_MS), { text: 'edited' });
    w.network.del('bob', postPath(HOUR_MS));
    const a = device(w, 'wa', { limits: { deltaFoldBytes: 0 } });
    await a.sync();
    await a.flush();
    const c = device(w, 'wc');
    await c.load();
    w.network.putJson('carol', postPath(HOUR_MS / 2), { text: 'before the restore' });
    await c.sync();
    expect(await c.flush()).toBe('delta');

    w.network.restore('hs1');
    await a.sync();
    const { epoch } = await a.store.readHomeserverState('hs1');
    expect(epoch).toMatch(/^r/);
    expect(await a.flush()).toBe('folded');

    const hot = await decoded(w.files, hotPath(FOLDER));
    expect(hot.homeservers).toMatchObject([{ homeserver: 'hs1', epoch }]);
    const head = w.network.headOf('hs1');
    expect(hot.runs.every((run) => run.head <= head)).toBe(true);
    c.restart();
    await c.load();
    expect((await c.store.readHomeserverState('hs1')).epoch).toBe(epoch);
    await expectTruthful(c.store, w.network, 'the stale device');
    const fresh = device(w, 'wf');
    await fresh.load();
    await expectTruthful(fresh.store, w.network, 'a new device');
    expect(await servedAll(fresh.store, USERS)).toEqual(truthOf(w.network, USERS));
  });

  it('never pairs runs read before a restore with the epoch after it, wherever the restore lands in a save', async () => {
    for (const mayFold of [false, true]) {
      for (let at = 1; ; at += 1) {
        const w = world();
        w.network.putJson('carol', postPath(HOUR_MS), { text: 'edited' });
        w.network.del('bob', postPath(HOUR_MS));
        const inner = createMemoryStore<Post>();
        let calls = 0;
        let armed = false;
        let fired = false;
        /** What a concurrent operation's restore check commits, at the `at`-th store read of the save. */
        const read =
          <A extends unknown[], R>(call: (...args: A) => Promise<R>) =>
          async (...args: A): Promise<R> => {
            if (armed && ++calls === at) {
              fired = true;
              const { epoch } = await inner.readHomeserverState('hs1');
              await inner.commit({
                readAt: [{ homeserver: 'hs1', epoch }],
                deleteHomeservers: [{ homeserver: 'hs1', epoch: restoreEpoch(epoch, w.clock.now) }],
              });
            }
            return call(...args);
          };
        const store: IndexStore<Post> = {
          ...inner,
          exportScopes: read(inner.exportScopes),
          readCoverage: read(inner.readCoverage),
          readHomeserverState: read(inner.readHomeserverState),
          readScopeMembers: read(inner.readScopeMembers),
          readUserHomeserver: read(inner.readUserHomeserver),
        };
        const a = device(w, 'wa', { store, limits: { deltaFoldBytes: mayFold ? 0 : 48 * 1024 } });
        await a.sync();
        expect(await a.flush()).toBe('folded');
        w.network.putJson('bob', postPath(HOUR_MS / 2), { text: 'bob new' });
        w.network.putJson('carol', postPath(HOUR_MS / 3), { text: 'carol new' });
        await a.sync();
        w.network.restore('hs1');
        armed = true;
        await a.flush(mayFold);
        armed = false;
        if (!fired) break;

        // A device loading what the save wrote, then syncing: a run kept under its old log's mark is caught.
        const b = device(w, 'wb');
        await b.load();
        await b.sync();
        await expectTruthful(b.store, w.network, `${mayFold ? 'fold' : 'delta'}, restore at read ${at}`);
      }
    }
  });

  it('keeps apart runs of two restores another writer and this one each saw first', async () => {
    const w = world();
    const a = device(w, 'wa');
    await a.sync();
    w.network.putJson('carol', postPath(HOUR_MS), { text: 'edited' });
    w.network.del('bob', postPath(HOUR_MS));
    w.network.restore('hs1');
    w.clock.now += HOUR_MS;
    await a.sync();
    // Started after that restore, without the folder: it never saw it.
    const b = device(w, 'wb');
    w.network.putJson('bob', postPath(HOUR_MS / 2), { text: 'bob new' });
    w.network.putJson('carol', postPath(HOUR_MS / 3), { text: 'carol new' });
    await b.sync();
    await a.sync();
    expect(await a.flush(false)).toBe('delta');

    w.network.del('carol', postPath(HOUR_MS / 3));
    w.network.restore('hs1');
    w.clock.now += HOUR_MS;
    await b.sync();
    expect((await b.store.readHomeserverState('hs1')).epoch).toMatch(/^r/);
    await b.load();

    // Each writer saw one restore; their runs come from different logs and never merge.
    await expectTruthful(b.store, w.network, 'after loading the other restore');
    expect(await servedAll(b.store, USERS)).toEqual(truthOf(w.network, USERS));
  });

  it('settles a device that read the homeserver before loading on the epoch of the device that read it first', async () => {
    const w = world();
    const a = device(w, 'wa');
    await a.sync();
    expect(await a.flush()).toBe('folded');
    w.clock.now += HOUR_MS;
    const b = device(w, 'wb');
    await b.sync();

    await b.load();

    expect((await b.store.readHomeserverState('hs1')).epoch).toBe((await a.store.readHomeserverState('hs1')).epoch);
    expect(await servedAll(b.store, USERS)).toEqual(truthOf(w.network, USERS));
    await b.sync();
    expect(await servedAll(b.store, USERS)).toEqual(truthOf(w.network, USERS));
  });

  it('seals every file under its own path, and a device without the key neither reads nor overwrites it', async () => {
    const w = world();
    const key = new Uint8Array(32).fill(7);
    const a = device(w, 'wa', { sealer: createIndexSealer(key) });
    await a.sync();
    await a.flush();
    w.network.putJson('bob', postPath(HOUR_MS / 2), { text: 'bob new' });
    await a.sync();
    await a.flush();
    const sealedHot = (await w.files.read(hotPath(FOLDER))) ?? new Uint8Array();
    await expect(decodeIndexFile(sealedHot)).rejects.toMatchObject({ code: 'malformed' });

    const b = device(w, 'wb', { sealer: createIndexSealer(key) });
    expect(await b.load()).toMatchObject({ loaded: 2, ignored: 0 });
    expect(await everything(b.store)).toEqual(await everything(a.store));

    const plain = device(w, 'wp', { limits: { deltaFoldBytes: 0 } });
    expect(await plain.load()).toMatchObject({ loaded: 0, ignored: 2 });
    await plain.sync();
    expect(await plain.flush()).toBe('delta');
    expect(await w.files.read(hotPath(FOLDER))).toEqual(sealedHot);

    const other = device(w, 'wo', { sealer: createIndexSealer(new Uint8Array(32).fill(8)) });
    expect(await other.load()).toMatchObject({ loaded: 0, ignored: 3 });

    // A file moved to another path, and a corrupted one, do not open.
    await w.files.write(deltaPath(FOLDER, 'moved'), sealedHot);
    const delta = (await w.files.read(deltaPath(FOLDER, 'wa'))) ?? new Uint8Array();
    delta[delta.length - 1] ^= 1;
    await w.files.write(deltaPath(FOLDER, 'wa'), delta);
    const c = device(w, 'wc', { sealer: createIndexSealer(key) });
    expect(await c.load()).toMatchObject({ loaded: 1, ignored: 3 });
  });

  it('trims a fold to the budget, never the graph', async () => {
    const w = world({ alice: 5, bob: 10, carol: 60 });
    const budget = 2000;
    const a = device(w, 'wa', { budget, limits: { deltaMaxBytes: 0 } });
    await a.sync();
    await a.flush();

    const bytes = (await w.files.read(hotPath(FOLDER))) ?? new Uint8Array();
    const hot = await decodeIndexFile(bytes, revivePost);
    expect(bytes.length).toBeLessThanOrEqual(budget);
    const graph = (await everything(a.store)).runs.flat().filter(({ group }) => group === GRAPH);
    expect(hot.runs.filter(({ group }) => group === GRAPH)).toEqual(graph);
  });
});

/** One device through the runtime, with a transport that counts what it asks and a gate that can hold stream reads. */
function runtimeDevice(w: World, options: Partial<RuntimeOptions> = {}, store = createMemoryStore<Post>()) {
  const time = fakeTime(NOW);
  w.files.now = () => time.clock.now;
  const counts = { lookups: 0, bodies: 0, writes: 0, reads: [] as ReadEventsRequest[] };
  const gate = { held: false, open: (): void => undefined };
  let opened: Promise<void> = Promise.resolve();
  const hold = () => {
    gate.held = true;
    opened = new Promise<void>((resolve) => {
      gate.open = () => {
        gate.held = false;
        resolve();
      };
    });
  };
  const transport: IndexerTransport = {
    resolveHomeserver: (user) => {
      counts.lookups += 1;
      return w.network.resolveHomeserver(user);
    },
    readEvents: async (request) => {
      counts.reads.push(request);
      if (gate.held) await opened;
      return w.network.readEvents(request);
    },
    getPublic: (request) => {
      counts.bodies += 1;
      return w.network.getPublic(request);
    },
    indexFiles: w.files.with({
      write: (path, bytes, lock) => {
        counts.writes += 1;
        return w.files.write(path, bytes, lock);
      },
    }),
  };
  const runtime = createIndexerRuntime({
    transport,
    store,
    domain: savedDomain,
    now: () => time.clock.now,
    schedule: time.schedule,
    options: { savedIndex: true, ...options },
  });
  const synced = () => until(() => runtime.status().lastSyncAt !== null && runtime.status().state === 'idle', 'a sync');
  return { store, counts, runtime, hold, gate, synced };
}

const headOf = async (store: IndexStore<Post>, scope: ScopeKey): Promise<Cursor | null> => {
  const coverage = await store.readCoverage(scope);
  return coverage.length === 0 ? null : coverage[coverage.length - 1].head;
};

/** A delta of `writer` holding nothing, written at `writtenAt`. */
const emptyDelta = (writer: string, seed: string, writtenAt: number) =>
  encodeIndexFile({
    part: { kind: 'delta', gen: 1, base: 0 },
    writer,
    writtenAt,
    seed,
    hops: 2,
    windowDays: 30,
    members: [],
    homeservers: [],
    runs: [],
  });

describe('saved index in the runtime', () => {
  it('starts a second device warm from the folder', async () => {
    const w = world();
    const a = runtimeDevice(w);
    a.runtime.start('alice');
    await a.synced();
    await until(() => a.counts.writes === 1, 'the first save');

    const b = runtimeDevice(w);
    b.hold();
    b.runtime.start('alice');
    await until(() => b.counts.reads.length > 0, 'the first stream read');

    // Loaded before any stream answered: the follows, and the posts with their data.
    expect(await served(b.store, 'alice', 'hs1', GRAPH)).toEqual(await served(a.store, 'alice', 'hs1', GRAPH));
    expect(await served(b.store, 'carol', 'hs1', ACTIVITY)).toEqual(await served(a.store, 'carol', 'hs1', ACTIVITY));
    expect(await b.store.readScopeMembers('alice')).toEqual(await a.store.readScopeMembers('alice'));

    b.gate.open();
    await b.synced();
    expect(await everything(b.store)).toEqual(await everything(a.store));
    expect(b.counts.lookups).toBe(0);
    expect(b.counts.bodies).toBe(0);
    for (const read of b.counts.reads.filter(({ reverse }) => !reverse)) {
      const group = read.paths.includes(FOLLOWS) ? GRAPH : ACTIVITY;
      for (const { user, cursor } of read.users) {
        expect(cursor, `${user} ${group}`).toBe(await headOf(a.store, { author: user, homeserver: 'hs1', group }));
      }
    }
    expect(b.runtime.status().savedIndex).toMatchObject({ loadedFiles: 1, ignoredFiles: 0, error: null });
  });

  it('never erases data the device already has', async () => {
    const w = world();
    const b = runtimeDevice(w);
    b.runtime.start('alice');
    await b.synced();
    b.runtime.stop();
    const a = runtimeDevice(w);
    a.runtime.start('alice');
    await a.synced();
    await until(() => a.counts.writes > 0, 'the save');
    const before = await everything(b.store);

    const again = runtimeDevice(w, {}, b.store);
    again.runtime.start('alice');
    await again.synced();

    expect(again.runtime.status().savedIndex?.loadedFiles).toBeGreaterThan(0);
    expect(await everything(b.store)).toEqual(before);
    expect(again.counts.bodies).toBe(0);
  });

  it('reads the folder again after the next scope sync when it could not be read at start', async () => {
    const w = world();
    const a = runtimeDevice(w);
    a.runtime.start('alice');
    await a.synced();
    await until(() => a.counts.writes === 1, 'the first save');
    // Like an account's private storage before its session is restored.
    w.files.fault = ({ op }) => {
      if (op === 'list') throw new Error('no session yet');
    };

    const b = runtimeDevice(w);
    b.runtime.start('alice');
    await b.synced();
    expect(b.runtime.status().savedIndex).toMatchObject({ loadedFiles: 0, error: { message: 'no session yet' } });

    w.files.fault = null;
    await b.runtime.refresh();
    await until(() => b.runtime.status().savedIndex?.loadedFiles === 1, 'the second load');
    expect(b.runtime.status().savedIndex?.error).toBeNull();
  });

  it('ignores a file of another seed, a corrupt one and one of an unknown version', async () => {
    const w = world();
    await w.files.write(deltaPath(FOLDER, 'other'), await emptyDelta('other', 'dave', NOW));
    await w.files.write(deltaPath(FOLDER, 'broken'), new Uint8Array([1, 2, 3]));
    await w.files.write(deltaPath(FOLDER, 'future'), new Uint8Array(gzipSync('[4,"future"]')));
    const a = runtimeDevice(w);

    a.runtime.start('alice');
    await a.synced();

    expect(a.runtime.status()).toMatchObject({
      lastError: null,
      savedIndex: { loadedFiles: 0, ignoredFiles: 3, error: null },
    });
    expect(await served(a.store, 'alice', 'hs1', GRAPH)).toEqual(w.network.liveOf('alice', [FOLLOWS]));
  });

  it('deletes another writer’s delta it folded once not written for the expiry time, and keeps a fresh one', async () => {
    const w = world();
    await w.files.write(deltaPath(FOLDER, 'old'), await emptyDelta('old', 'alice', NOW - 31 * DAY_MS));
    await w.files.write(deltaPath(FOLDER, 'fresh'), await emptyDelta('fresh', 'alice', NOW - DAY_MS));
    const a = runtimeDevice(w);

    a.runtime.start('alice');
    await a.synced();
    await until(() => w.files.files.has(hotPath(FOLDER)) && !w.files.locked(hotPath(FOLDER)), 'the fold');

    expect([...w.files.files.keys()].sort()).toEqual([deltaPath(FOLDER, 'fresh'), hotPath(FOLDER)]);
    expect((await decoded(w.files, hotPath(FOLDER))).part).toMatchObject({
      folded: [
        { writer: 'fresh', gen: 1 },
        { writer: 'old', gen: 1 },
      ],
    });
  });

  it('writes its delta on pause only when something changed, holding only the change', async () => {
    const w = world();
    const a = runtimeDevice(w);
    a.runtime.start('alice');
    await a.synced();
    await until(() => a.counts.writes === 1, 'the first save');

    a.runtime.pause();
    a.runtime.resume();
    w.network.putJson('carol', postPath(HOUR_MS / 2), { text: 'new' });
    await a.runtime.refresh();
    a.runtime.pause();
    await until(() => a.counts.writes === 2, 'the save on pause');

    const deltas = [...w.files.files.keys()].filter((path) => path.startsWith(`${FOLDER}d/`));
    expect(deltas).toHaveLength(1);
    const model = await decoded(w.files, deltas[0]);
    expect(model.runs.map(({ author, entries }) => [author, entries.length])).toEqual([['carol', 1]]);
  });

  it('restores a homeserver whose log went back below the loaded cursors', async () => {
    const w = world();
    w.network.putJson('carol', postPath(HOUR_MS), { text: 'edited' });
    w.network.del('bob', postPath(HOUR_MS));
    const a = runtimeDevice(w);
    a.runtime.start('alice');
    await a.synced();
    await until(() => a.counts.writes === 1, 'the save');
    w.network.restore('hs1');

    const b = runtimeDevice(w);
    b.runtime.start('alice');
    await b.synced();

    const head = w.network.headOf('hs1');
    for (const scope of await b.store.listScopes()) {
      expect(await headOf(b.store, scope), scopeId(scope)).not.toBeNull();
      expect((await headOf(b.store, scope)) ?? head, scopeId(scope)).toBeLessThanOrEqual(head);
    }
    for (const user of USERS) {
      expect(await served(b.store, user, 'hs1', ACTIVITY)).toEqual(w.network.liveOf(user, [POSTS]));
    }
  });
});

/** The model with every payload left out, as a file of pointers. */
function pointersOf(model: IndexFileModel<Post>): IndexFileModel<Post> {
  const strip = (entry: Entry<Post>): Entry<Post> =>
    entry.kind === 'tombstone' || entry.data === undefined ? entry : { ...entry, data: undefined };
  return { ...model, runs: model.runs.map((run) => ({ ...run, entries: run.entries.map(strip) })) };
}

describe('saved index budget', () => {
  const graphRuns = <D>(runs: readonly Run<D>[]) => runs.filter(({ group }) => group === GRAPH);
  const activityOf = <D>(runs: readonly Run<D>[], author: string) =>
    runs.filter((run) => run.group === ACTIVITY && run.author === author);
  const cursorsOf = <D>(runs: readonly Run<D>[], withData: boolean) =>
    runs.flatMap(({ entries }) =>
      entries.flatMap((entry) =>
        entry.kind === 'record' && (entry.data !== undefined) === withData ? [entry.cursor] : [],
      ),
    );

  /** The whole index of a synced device, as its first fold writes it into `hot`. */
  async function snapshot(): Promise<IndexFileModel<Post>> {
    const w = world({ alice: 5, bob: 10, carol: 60 });
    const a = device(w, 'w');
    await a.sync();
    await a.flush();
    return decoded(w.files, hotPath(FOLDER));
  }

  it('drops data before any pointer: the farthest hop’s oldest first', async () => {
    const model = await snapshot();
    const full = (await encodeIndexFile(model)).length;
    const carolBare = model.runs.map((run) =>
      run.author === 'carol' ? { ...run, entries: pointersOf({ ...model, runs: [run] }).runs[0].entries } : run,
    );
    const budget = Math.floor((full + (await encodeIndexFile({ ...model, runs: carolBare })).length) / 2);

    const bytes = await fitToBudget(model, budget, new Set([ACTIVITY]));
    const read = await decodeIndexFile(bytes, revivePost);

    expect(bytes.length).toBeLessThanOrEqual(budget);
    expect(full).toBeGreaterThan(budget);
    expect(read.runs.map(({ entries }) => entries.length)).toEqual(model.runs.map(({ entries }) => entries.length));
    expect(activityOf(read.runs, 'alice')).toEqual(activityOf(model.runs, 'alice'));
    expect(activityOf(read.runs, 'bob')).toEqual(activityOf(model.runs, 'bob'));
    const kept = cursorsOf(activityOf(read.runs, 'carol'), true);
    const dropped = cursorsOf(activityOf(read.runs, 'carol'), false);
    expect(kept.length).toBeGreaterThan(0);
    expect(dropped.length).toBeGreaterThan(0);
    expect(dropped.every((low) => kept.every((high) => low < high))).toBe(true);
  });

  it('drops the oldest history of the farthest hop first and keeps the graph', async () => {
    const model = pointersOf(await snapshot());
    const full = (await encodeIndexFile(model)).length;
    const runs = model.runs.filter((run) => !(run.author === 'carol' && run.group === ACTIVITY));
    const withoutCarol = (await encodeIndexFile({ ...model, runs })).length;
    const budget = Math.floor((full + withoutCarol) / 2);

    const bytes = await fitToBudget(model, budget, new Set([ACTIVITY]));
    const read = await decodeIndexFile(bytes);

    expect(bytes.length).toBeLessThanOrEqual(budget);
    expect(graphRuns(read.runs)).toEqual(graphRuns(model.runs));
    expect(activityOf(read.runs, 'alice')).toEqual(activityOf(model.runs, 'alice'));
    expect(activityOf(read.runs, 'bob')).toEqual(activityOf(model.runs, 'bob'));
    const kept = activityOf(read.runs, 'carol').flatMap(({ entries }) => entries.map(({ cursor }) => cursor));
    const all = activityOf(model.runs, 'carol').flatMap(({ entries }) => entries.map(({ cursor }) => cursor));
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(all.length);
    const dropped = all.filter((cursor) => !kept.includes(cursor));
    expect(dropped.every((low) => kept.every((high) => low < high))).toBe(true);
  });

  it('keeps only the graph under a tiny budget, still a valid file', async () => {
    const model = await snapshot();

    const read = await decodeIndexFile(await fitToBudget(model, 1, new Set([ACTIVITY])));

    expect(read.runs).toEqual(graphRuns(model.runs));
    expect(read.members).toEqual(model.members);
  });
});
