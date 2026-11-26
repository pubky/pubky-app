// @vitest-environment node
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
  testDomain,
} from './crawler.fixtures';
import type { CrawlerOptions } from './crawler.types';
import { FakeNetwork } from './fakeNetwork';
import { HomeserverUnreachableError } from './indexer.errors';
import type { Cursor, Run } from './indexer.types';
import { createMemoryStore } from './memoryStore';
import type { IndexStore } from './store.types';
import type { IndexerTransport } from './transport.types';

const HOP1 = ['u0', 'u1', 'u2', 'u3'];
const HOP2 = ['v0', 'v1'];
const MINUTE_MS = 60 * 1000;

/**
 * alice follows the hop 1 users and u0 follows the hop 2 users, all on hs1. Each user wrote a post older than the
 * window, hop 1 last, then one a day for 20 days, the users' posts interleaved and the newest last. `after` writes
 * more once a day's posts are in. Each user's window ends at their old post: nothing of theirs is older.
 */
function world(after: (day: number, network: FakeNetwork) => void = () => undefined) {
  const network = new FakeNetwork().addHomeserver('hs1');
  for (const user of ['alice', ...HOP1, ...HOP2]) network.addUser(user, 'hs1');
  for (const user of HOP1) network.put('alice', `${FOLLOWS}${user}`);
  for (const user of HOP2) network.put('u0', `${FOLLOWS}${user}`);
  const ends = new Map<string, Cursor>();
  [...HOP2, ...HOP1].forEach((user, i) => {
    ends.set(user, network.putJson(user, postPath(31 * DAY_MS + i * MINUTE_MS), { text: `old ${user}` }));
  });
  const endOf = (user: string) => ends.get(user) ?? BigInt(0);
  let top: Cursor = BigInt(0);
  for (let day = 20; day >= 1; day -= 1) {
    [...HOP1, ...HOP2].forEach((user, i) => {
      const cursor = network.putJson(user, postPath(day * DAY_MS + i * MINUTE_MS), { text: `${user} ${day}` });
      if (HOP1.includes(user)) top = cursor;
    });
    after(day, network);
  }
  return { network, endOf, top };
}

type Step = { kind: 'read'; users: string[] } | { kind: 'get'; author: string; path: string } | { kind: 'commit' };

/** A crawler whose transport and store log, in order, every read, file fetch and commit, keeping the runs committed. */
function recorded(network: FakeNetwork, options: Partial<CrawlerOptions>, fails = (_path: string) => false) {
  const steps: Step[] = [];
  const runs: Array<{ step: number; run: Run<Post> }> = [];
  const memory = createMemoryStore<Post>();
  const store: IndexStore<Post> = {
    ...memory,
    async commit(batch) {
      await memory.commit(batch);
      steps.push({ kind: 'commit' });
      for (const run of batch.applyRuns ?? []) runs.push({ step: steps.length - 1, run: structuredClone(run) });
    },
  };
  const transport: IndexerTransport = {
    resolveHomeserver: (user) => network.resolveHomeserver(user),
    readEvents: (request) => {
      steps.push({ kind: 'read', users: request.users.map(({ user }) => user) });
      return network.readEvents(request);
    },
    getPublic: async (request) => {
      steps.push({ kind: 'get', author: request.author, path: request.path });
      if (fails(request.path)) throw new HomeserverUnreachableError(request.author);
      return network.getPublic(request);
    },
    listIndexFiles: () => network.listIndexFiles(),
    readIndexFile: (name) => network.readIndexFile(name),
    writeIndexFile: (name, bytes) => network.writeIndexFile(name, bytes),
    deleteIndexFile: (name) => network.deleteIndexFile(name),
  };
  const clock = { now: NOW };
  const crawler = createCrawler<Post>({
    transport,
    store,
    domain: testDomain,
    now: () => clock.now,
    sleep: async () => undefined,
    options: { backfillPageLimit: 10, ...options },
  });
  return { crawler, store, steps, runs, clock };
}

const activityOf = (runs: ReadonlyArray<{ step: number; run: Run<Post> }>, users: readonly string[]) =>
  runs.filter(({ run }) => run.group === ACTIVITY && users.includes(run.author));

describe('syncScope newest first', () => {
  it("commits a first sync's window a slice at a time, newest first, each once its posts are in", async () => {
    const { network, endOf } = world();
    const { crawler, store, steps, runs } = recorded(network, { hops: 1 });

    await crawler.syncScope('alice');

    const hop1 = activityOf(runs, HOP1);
    const commits = [...new Set(hop1.map(({ step }) => step))];
    expect(commits.length).toBeGreaterThan(5);
    // Each commit sits right below the one before it, for every user: the top range only grows downwards.
    for (const user of HOP1) {
      const own = hop1.filter(({ run }) => run.author === user).map(({ run }) => run);
      for (let i = 1; i < own.length; i += 1) expect(own[i].head).toBe(own[i - 1].tail);
      expect(own[own.length - 1].tail).toBe(endOf(user));
    }
    // No record commits before its file is in.
    for (const { run } of hop1) {
      for (const entry of run.entries) if (entry.kind === 'record') expect(entry.data).toBeDefined();
    }
    // The first commit holds the newest posts, while older ones are still to fetch.
    const first = hop1.filter(({ step }) => step === commits[0]).flatMap(({ run }) => run.entries);
    const newest = HOP1.map((user, i) => postPath(DAY_MS + i * MINUTE_MS));
    expect(first.map(({ path }) => path)).toEqual(expect.arrayContaining(newest));
    const lastGet = steps.findLastIndex((step) => step.kind === 'get' && HOP1.includes(step.author));
    expect(commits[0]).toBeLessThan(lastGet);
    for (const user of HOP1) {
      const scope = { author: user, homeserver: 'hs1', group: ACTIVITY };
      expect(await served(store, user, 'hs1', ACTIVITY)).toEqual(network.liveOf(user, [POSTS], endOf(user)));
      expect((await store.readCoverage(scope)).length).toBe(1);
      expect(await store.readWindowEnd(scope)).toBe(endOf(user));
    }
  });

  it("reads hop 1's activity beside its graph, and starts hop 2 once hop 1's graph is in", async () => {
    const { network } = world();
    const { crawler, steps, runs } = recorded(network, { hops: 2 });

    await crawler.syncScope('alice');

    const isRead = (step: Step, users: readonly string[]) =>
      step.kind === 'read' && step.users.some((user) => users.includes(user));
    const hop1Reads = steps.flatMap((step, index) => (isRead(step, HOP1) ? [index] : []));
    const hop1Graph = Math.min(
      ...runs.filter(({ run }) => run.group === GRAPH && HOP1.includes(run.author)).map(({ step }) => step),
    );
    // Both of hop 1's reads go out before its graph commits, and hop 2 waits for that commit alone.
    expect(hop1Reads.slice(0, 2).every((index) => index < hop1Graph)).toBe(true);
    const firstHop2 = steps.findIndex(
      (step) => isRead(step, HOP2) || (step.kind === 'get' && HOP2.includes(step.author)),
    );
    expect(firstHop2).toBeGreaterThan(hop1Graph);
  });

  it("commits a homeserver's batches as one stream, newest first, reading the next page while a page's posts come", async () => {
    const { network, endOf } = world();
    const { crawler, store, steps, runs } = recorded(network, { hops: 1, batchSize: 2, pageLimit: 10 });

    await crawler.syncScope('alice');

    const hop1 = activityOf(runs, HOP1);
    const commits = [...new Set(hop1.map(({ step }) => step))];
    // The first commit holds the newest post of every user, whichever batch read it.
    const first = hop1.filter(({ step }) => step === commits[0]).flatMap(({ run }) => run.entries);
    const newest = HOP1.map((user, i) => postPath(DAY_MS + i * MINUTE_MS));
    expect(first.map(({ path }) => path)).toEqual(expect.arrayContaining(newest));
    // Each commit sits right below the one before it, for every user, down to where their own window ends.
    for (const user of HOP1) {
      const own = hop1.filter(({ run }) => run.author === user).map(({ run }) => run);
      for (let i = 1; i < own.length; i += 1) expect(own[i].head).toBe(own[i - 1].tail);
      expect(own[own.length - 1].tail).toBe(endOf(user));
      expect(await served(store, user, 'hs1', ACTIVITY)).toEqual(network.liveOf(user, [POSTS], endOf(user)));
    }
    // A window read goes out before the posts of the page read before it are all in.
    const reads = steps.flatMap((step, index) =>
      step.kind === 'read' && step.users.some((user) => HOP1.includes(user)) ? [index] : [],
    );
    const gets = steps.flatMap((step, index) => (step.kind === 'get' && HOP1.includes(step.author) ? [index] : []));
    expect(reads.some((read, i) => i > 0 && gets.some((get) => get < read) && gets.some((get) => get > read))).toBe(
      true,
    );
  });

  it('reads the window once, with no search for its start, and fetches each post in it once', async () => {
    const { network, endOf } = world();
    const inWindow = ['alice', ...HOP1, ...HOP2].flatMap((user) =>
      [...network.liveOf(user, [POSTS], endOf(user)).keys()].map((path) => `${user}${path}`),
    );
    const whole = recorded(network, { hops: 2 });
    await whole.crawler.syncScope('alice');
    // Per hop one graph read and one window read: each window end is found by the window read itself.
    expect(whole.crawler.stats().streamRequests).toBe(6);

    // Batches merged into one stream read no event twice.
    const mark = network.reads.length;
    const paged = recorded(network, { hops: 2, batchSize: 2, pageLimit: 10 });
    await paged.crawler.syncScope('alice');
    const read = network.reads
      .slice(mark)
      .filter(({ reverse }) => reverse)
      .flatMap(({ events }) => events.map(({ author, cursor }) => `${author}:${cursor}`));
    expect(new Set(read).size).toBe(read.length);

    for (const { steps } of [whole, paged]) {
      const gets = steps.flatMap((step) => (step.kind === 'get' ? [`${step.author}${step.path}`] : []));
      expect(gets.sort()).toEqual([...inWindow].sort());
    }
  });

  it('keeps the tombstones of every slice and the slices above a fetch that keeps failing, then completes', async () => {
    const deleted = postPath(15 * DAY_MS);
    const { network, endOf, top } = world((day, net) => {
      if (day === 15) net.del('u0', deleted);
    });
    const failing = postPath(10 * DAY_MS + MINUTE_MS);
    let broken = true;
    const { crawler, store, clock } = recorded(network, { hops: 1 }, (path) => broken && path === failing);
    const scope = (user: string) => ({ author: user, homeserver: 'hs1', group: ACTIVITY });

    expect((await crawler.syncScope('alice')).failedHomeservers).toEqual(['hs1']);

    // Everything above the post whose file never came is in, with its data; nothing at or below it is claimed.
    for (const user of HOP1) {
      const [range] = await store.readCoverage(scope(user));
      expect(range.tail).toBeGreaterThan(endOf(user));
      expect(network.liveOf(user, [POSTS], range.tail)).toEqual(await served(store, user, 'hs1', ACTIVITY));
      for (const record of (await store.readScope(scope(user))).live.values()) expect(record.data).toBeDefined();
    }
    expect((await store.readScope(scope('u1'))).live.has(failing)).toBe(false);

    broken = false;
    clock.now = (await store.readHomeserverState('hs1')).failure?.retryAt ?? clock.now;
    expect((await crawler.syncScope('alice')).failedHomeservers).toEqual([]);

    for (const user of HOP1) {
      expect(await served(store, user, 'hs1', ACTIVITY)).toEqual(network.liveOf(user, [POSTS], endOf(user)));
      expect(await store.readCoverage(scope(user))).toEqual([{ tail: endOf(user), head: top }]);
    }
    expect((await store.readScope(scope('u0'))).entries.get(deleted)?.kind).toBe('tombstone');
  });

  it('commits runs that give the same store applied in any order', async () => {
    const { network } = world();
    const { crawler, store, runs } = recorded(network, { hops: 2, batchSize: 2, pageLimit: 10 });

    await crawler.syncScope('alice');

    const reversed = createMemoryStore<Post>();
    await reversed.applyRuns(runs.map(({ run }) => run).reverse());
    for (const scope of await store.listScopes()) {
      expect(await reversed.readScope(scope)).toEqual(await store.readScope(scope));
      expect(await reversed.readCoverage(scope)).toEqual(await store.readCoverage(scope));
    }
  });
});
