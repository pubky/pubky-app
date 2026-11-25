// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ACTIVITY, DAY_MS, FOLLOWS, GRAPH, NOW, type Post, postPath, testDomain } from './crawler.fixtures';
import type { StoreChange } from './crawler.types';
import { FakeNetwork } from './fakeNetwork';
import { createIndexerRuntime } from './indexer';
import { createMemoryStore } from './memoryStore';
import { createTabs, fakeTime, settle, tracked, type TrackedRead } from './runtime.fixtures';
import type { Coordination } from './runtime.types';
import { scopeId } from './store.helpers';
import type { ScopeKey } from './store.types';

const INTERVAL = 60 * 1000;
const DEBOUNCE = 250;
const TTL = 5 * 60 * 1000;
const OUTSIDERS = ['carol', 'dave'];

/** alice follows bob; carol and dave are outside her scope. Everyone but alice posted once. */
function world() {
  const network = new FakeNetwork().addHomeserver('hs1');
  for (const user of ['alice', 'bob', 'carol', 'dave']) network.addUser(user, 'hs1');
  network.put('alice', `${FOLLOWS}bob`);
  for (const user of ['bob', 'carol', 'dave']) network.putJson(user, postPath(DAY_MS), { text: user });
  return { network, store: createMemoryStore<Post>(), time: fakeTime(NOW) };
}

type World = ReturnType<typeof world>;

function runtimeOf({ network, store, time }: World, coordination?: Coordination) {
  const { transport, state } = tracked(network);
  const runtime = createIndexerRuntime({
    transport,
    store,
    domain: testDomain,
    now: () => time.clock.now,
    schedule: time.schedule,
    coordination,
  });
  return { runtime, state };
}

/** Scope syncs started: each opens with one forward read of alice's graph. */
const scopeSyncs = (reads: readonly TrackedRead[]) =>
  reads.filter((read) => !read.reverse && read.paths.includes(FOLLOWS) && read.users.includes('alice')).length;

/** Whose crawl each forward read served, in order and run-length collapsed: an outsider's name, else `scope`. */
function crawlOrder(reads: readonly TrackedRead[]): string[] {
  const order: string[] = [];
  for (const read of reads) {
    if (read.reverse) continue;
    const label = read.users.length === 1 && OUTSIDERS.includes(read.users[0]) ? read.users[0] : 'scope';
    if (order[order.length - 1] !== label) order.push(label);
  }
  return order;
}

const idsOf = (scopes: readonly ScopeKey[]) => scopes.map(scopeId).sort();

describe('createIndexerRuntime loop', () => {
  it('syncs on start, then every interval, and not after stop', async () => {
    const w = world();
    const { runtime, state } = runtimeOf(w);

    runtime.start('alice');
    expect(runtime.status().state).toBe('syncing');
    await settle();

    expect(scopeSyncs(state.reads)).toBe(1);
    expect(runtime.status()).toMatchObject({ state: 'idle', seed: 'alice', lastSyncAt: NOW, lastError: null });
    await w.time.advance(INTERVAL - 1);
    expect(scopeSyncs(state.reads)).toBe(1);
    await w.time.advance(1);
    expect(scopeSyncs(state.reads)).toBe(2);

    runtime.stop();
    runtime.stop();
    expect(runtime.status().state).toBe('stopped');
    expect(w.time.pending()).toBe(0);
    await w.time.advance(3 * INTERVAL);
    expect(scopeSyncs(state.reads)).toBe(2);

    runtime.start('alice');
    await settle();
    expect(scopeSyncs(state.reads)).toBe(3);
  });

  it('records a failed sync and syncs again at the next interval', async () => {
    const w = world();
    const { runtime, state } = runtimeOf(w);
    state.failures = 1;

    runtime.start('alice');
    await settle();

    expect(runtime.status()).toMatchObject({ state: 'error', lastSyncAt: null });
    expect(runtime.status().lastError?.message).toBe('transport broke');
    await w.time.advance(INTERVAL);
    expect(runtime.status()).toMatchObject({ state: 'idle', lastSyncAt: NOW + INTERVAL, lastError: null });
  });
});

describe('createIndexerRuntime queue', () => {
  it('runs requests after the running crawl and before the periodic sync, one crawl at a time', async () => {
    const w = world();
    const { runtime, state } = runtimeOf(w);

    runtime.start('alice');
    const carol = runtime.ensureUser('carol');
    expect(runtime.ensureUser('carol')).toBe(carol);
    await settle();
    await carol;
    expect(crawlOrder(state.reads)).toEqual(['scope', 'carol']);

    const mark = state.reads.length;
    const dave = runtime.ensureUser('dave');
    // The periodic sync falls due while dave's crawl runs, and a request arrives after it.
    w.time.jump(INTERVAL);
    const carolAgain = runtime.refresh(['carol']);
    await settle();
    await Promise.all([dave, carolAgain]);
    expect(crawlOrder(state.reads.slice(mark))).toEqual(['dave', 'carol', 'scope']);

    const before = state.reads.length;
    await runtime.ensureUser('carol');
    expect(state.reads.length).toBe(before);
    await w.time.advance(TTL);
    const later = state.reads.length;
    await runtime.ensureUser('carol');
    expect(crawlOrder(state.reads.slice(later))).toEqual(['carol']);
    expect(state.peak).toBe(1);
  });

  it('rejects a request queued when the runtime stops, and one made before it starts', async () => {
    const w = world();
    const { runtime } = runtimeOf(w);
    await expect(runtime.refresh()).rejects.toThrow('not started');

    runtime.start('alice');
    const queued = runtime.ensureUser('carol');
    runtime.stop();

    await expect(queued).rejects.toThrow('aborted');
  });
});

describe('createIndexerRuntime changes', () => {
  it('reports commits merged, at most once per debounce period', async () => {
    const w = world();
    const { runtime } = runtimeOf(w);
    const changes: StoreChange[] = [];
    runtime.onChange((change) => changes.push(change));

    runtime.start('alice');
    await settle();
    expect(changes).toEqual([]);
    await w.time.advance(DEBOUNCE);

    const alice = { author: 'alice', homeserver: 'hs1' };
    const bob = { author: 'bob', homeserver: 'hs1' };
    expect(changes).toHaveLength(1);
    expect(idsOf(changes[0].scopes)).toEqual(
      idsOf([
        { ...alice, group: GRAPH },
        { ...bob, group: ACTIVITY },
      ]),
    );
    expect(changes[0].seeds).toEqual(['alice']);

    w.network.putJson('bob', postPath(DAY_MS / 2), { text: 'again' });
    await runtime.refresh();
    await runtime.refresh(['bob']);
    expect(changes).toHaveLength(1);
    await w.time.advance(DEBOUNCE);
    expect(changes).toEqual([{ scopes: [{ ...bob, group: ACTIVITY }], seeds: [] }]);
  });
});

describe('createIndexerRuntime visibility', () => {
  it('starts nothing while paused and catches up on resume, requests first', async () => {
    const w = world();
    const { runtime, state } = runtimeOf(w);

    runtime.start('alice');
    runtime.pause();
    await settle();
    expect(scopeSyncs(state.reads)).toBe(1);

    const carol = runtime.ensureUser('carol');
    await w.time.advance(2 * INTERVAL);
    expect(crawlOrder(state.reads)).toEqual(['scope']);

    runtime.resume();
    await settle();
    await carol;
    expect(crawlOrder(state.reads)).toEqual(['scope', 'carol', 'scope']);

    // Synced just now: a resume waits out the rest of the interval.
    runtime.pause();
    runtime.resume();
    await settle();
    expect(scopeSyncs(state.reads)).toBe(2);
    await w.time.advance(INTERVAL);
    expect(scopeSyncs(state.reads)).toBe(3);
  });
});

describe('createIndexerRuntime coordination', () => {
  it('crawls in one tab; the other sends it requests, hears its changes and takes over when it stops', async () => {
    const w = world();
    const tabs = createTabs();
    const first = runtimeOf(w, tabs.join());
    const second = runtimeOf(w, tabs.join());
    const heard: StoreChange[] = [];
    second.runtime.onChange((change) => heard.push(change));

    first.runtime.start('alice');
    second.runtime.start('alice');
    await settle();
    expect(scopeSyncs(first.state.reads)).toBe(1);
    expect(second.state.reads).toEqual([]);
    expect(second.runtime.status().state).toBe('idle');

    await w.time.advance(DEBOUNCE);
    expect(heard).toHaveLength(1);
    expect(heard[0].seeds).toEqual(['alice']);

    await second.runtime.ensureUser('carol');
    expect(crawlOrder(first.state.reads)).toEqual(['scope', 'carol']);
    expect(second.state.reads).toEqual([]);

    first.runtime.stop();
    await settle();
    expect(scopeSyncs(second.state.reads)).toBe(1);
  });

  it('hands crawling to another tab while paused', async () => {
    const w = world();
    const tabs = createTabs();
    const first = runtimeOf(w, tabs.join());
    const second = runtimeOf(w, tabs.join());
    first.runtime.start('alice');
    second.runtime.start('alice');
    await settle();

    first.runtime.pause();
    await settle();
    expect(scopeSyncs(second.state.reads)).toBe(1);
    await first.runtime.ensureUser('dave');
    expect(crawlOrder(second.state.reads)).toEqual(['scope', 'dave']);
    expect(scopeSyncs(first.state.reads)).toBe(1);
  });
});
