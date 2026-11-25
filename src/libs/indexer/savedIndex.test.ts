// @vitest-environment node
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ACTIVITY, FOLLOWS, GRAPH, NOW, type Post, postPath, POSTS, served, testDomain } from './crawler.fixtures';
import { FakeNetwork } from './fakeNetwork';
import { createIndexerRuntime } from './indexer';
import type { Cursor, Entry, Run } from './indexer.types';
import { decodeIndexFile, encodeIndexFile, type IndexFileModel, type ReviveData } from './indexFile';
import { createMemoryStore } from './memoryStore';
import { fakeTime } from './runtime.fixtures';
import type { IndexSealer, RuntimeOptions } from './runtime.types';
import { fitToBudget, snapshotIndex } from './savedIndex';
import { scopeId } from './store.helpers';
import type { IndexStore, ScopeKey } from './store.types';
import type { IndexerTransport, ReadEventsRequest } from './transport.types';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Polls with real timers: gzip runs outside the fake clock. */
async function until(check: () => boolean | Promise<boolean>, what = 'condition'): Promise<void> {
  for (let i = 0; i < 1000; i += 1) {
    if (await check()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** alice follows bob, bob follows carol; each posted `posts[user]` times, an hour apart. */
function world(posts: Record<string, number> = { alice: 2, bob: 3, carol: 4 }) {
  const network = new FakeNetwork().addHomeserver('hs1');
  for (const user of ['alice', 'bob', 'carol']) network.addUser(user, 'hs1');
  network.put('alice', `${FOLLOWS}bob`);
  network.put('bob', `${FOLLOWS}carol`);
  for (const [user, count] of Object.entries(posts)) {
    for (let k = 1; k <= count; k += 1) network.putJson(user, postPath(k * HOUR_MS), { text: `${user} ${k}` });
  }
  return { network, time: fakeTime(NOW) };
}

type World = ReturnType<typeof world>;

/** One device: its own store, a transport that counts what it asks, and a gate that can hold stream reads. */
function device({ network, time }: World, options: Partial<RuntimeOptions> = {}, store = createMemoryStore<Post>()) {
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
      return network.resolveHomeserver(user);
    },
    readEvents: async (request) => {
      counts.reads.push(request);
      if (gate.held) await opened;
      return network.readEvents(request);
    },
    getPublic: (request) => {
      counts.bodies += 1;
      return network.getPublic(request);
    },
    listIndexFiles: () => network.listIndexFiles(),
    readIndexFile: (name) => network.readIndexFile(name),
    writeIndexFile: (name, bytes) => {
      counts.writes += 1;
      return network.writeIndexFile(name, bytes);
    },
    deleteIndexFile: (name) => network.deleteIndexFile(name),
  };
  const runtime = createIndexerRuntime({
    transport,
    store,
    domain: testDomain,
    now: () => time.clock.now,
    schedule: time.schedule,
    options: { savedIndex: true, ...options },
  });
  const synced = () => until(() => runtime.status().lastSyncAt !== null && runtime.status().state === 'idle', 'a sync');
  return { store, counts, runtime, hold, gate, synced };
}

const sortedScopes = async (store: IndexStore<Post>) =>
  [...(await store.listScopes())].sort((a, b) => (scopeId(a) < scopeId(b) ? -1 : 1));

/** Every scope the store holds, exported with data. */
async function everything(store: IndexStore<Post>) {
  const scopes = await sortedScopes(store);
  return { scopes: scopes.map(scopeId), runs: await Promise.all(scopes.map((scope) => store.exportRuns(scope))) };
}

const headOf = async (store: IndexStore<Post>, scope: ScopeKey): Promise<Cursor | null> => {
  const coverage = await store.readCoverage(scope);
  return coverage.length === 0 ? null : coverage[coverage.length - 1].head;
};

const emptyModel = (writer: string, seed: string, writtenAt: number): IndexFileModel => ({
  writer,
  writtenAt,
  seed,
  hops: 2,
  windowDays: 30,
  members: [],
  highWater: [],
  runs: [],
});

describe('saved index', () => {
  it('starts a second device warm from the first one’s file', async () => {
    const w = world();
    const a = device(w);
    a.runtime.start('alice');
    await a.synced();
    await until(() => a.counts.writes === 1, 'the first save');

    const b = device(w);
    b.hold();
    b.runtime.start('alice');
    await until(() => b.counts.reads.length > 0, 'the first stream read');

    // Loaded before any stream answered: the follows, and the posts as pointers without data.
    expect(await served(b.store, 'alice', 'hs1', GRAPH)).toEqual(await served(a.store, 'alice', 'hs1', GRAPH));
    const pointers = await b.store.readScope({ author: 'carol', homeserver: 'hs1', group: ACTIVITY });
    expect([...pointers.live.keys()]).toEqual([...(await served(a.store, 'carol', 'hs1', ACTIVITY)).keys()]);
    expect([...pointers.live.values()].every((record) => record.data === undefined)).toBe(true);
    expect(await b.store.readScopeMembers('alice')).toEqual(await a.store.readScopeMembers('alice'));

    b.gate.open();
    await b.synced();
    expect(await everything(b.store)).toEqual(await everything(a.store));
    expect(b.counts.lookups).toBe(0);
    expect(b.counts.bodies).toBe(2 + 3 + 4);
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
    const b = device(w);
    b.runtime.start('alice');
    await b.synced();
    b.runtime.stop();
    const a = device(w);
    a.runtime.start('alice');
    await a.synced();
    await until(() => a.counts.writes === 1, 'the save');
    const before = await everything(b.store);

    const again = device(w, {}, b.store);
    again.runtime.start('alice');
    await again.synced();

    expect(again.runtime.status().savedIndex?.loadedFiles).toBeGreaterThan(0);
    expect(await everything(b.store)).toEqual(before);
    expect(again.counts.bodies).toBe(0);
  });

  it('ignores a file of another seed, a corrupt one and one of an unknown version', async () => {
    const w = world();
    await w.network.writeIndexFile('other.idx', await encodeIndexFile(emptyModel('other', 'dave', NOW)));
    await w.network.writeIndexFile('broken.idx', new Uint8Array([1, 2, 3]));
    await w.network.writeIndexFile('future.idx', new Uint8Array(gzipSync('[3,"future"]')));
    const a = device(w);

    a.runtime.start('alice');
    await a.synced();

    expect(a.runtime.status()).toMatchObject({
      lastError: null,
      savedIndex: { loadedFiles: 0, ignoredFiles: 3, error: null },
    });
    expect(await served(a.store, 'alice', 'hs1', GRAPH)).toEqual(w.network.liveOf('alice', [FOLLOWS]));
  });

  it('deletes another writer’s file not written for the expiry time, and keeps a fresh one', async () => {
    const w = world();
    await w.network.writeIndexFile('old.idx', await encodeIndexFile(emptyModel('old', 'alice', NOW - 31 * DAY_MS)));
    await w.network.writeIndexFile('fresh.idx', await encodeIndexFile(emptyModel('fresh', 'alice', NOW - DAY_MS)));
    const a = device(w);

    a.runtime.start('alice');
    await a.synced();
    await until(() => a.counts.writes === 1, 'the save');

    const files = await w.network.listIndexFiles();
    expect(files).toContain('fresh.idx');
    expect(files).not.toContain('old.idx');
    expect(files).toHaveLength(2);
  });

  it('saves again on pause only when something changed', async () => {
    const w = world();
    const a = device(w);
    a.runtime.start('alice');
    await a.synced();
    await until(() => a.counts.writes === 1, 'the first save');

    a.runtime.pause();
    a.runtime.resume();
    w.network.putJson('carol', postPath(HOUR_MS / 2), { text: 'new' });
    await a.runtime.refresh();
    a.runtime.pause();
    await until(() => a.counts.writes === 2, 'the save on pause');

    const files = await w.network.listIndexFiles();
    const model = await decodeIndexFile((await w.network.readIndexFile(files[0])) ?? new Uint8Array());
    const carol = model.runs.find(({ author, group }) => author === 'carol' && group === ACTIVITY);
    expect(carol?.entries).toHaveLength(5);
  });

  it('restores a homeserver whose log went back below the loaded cursors', async () => {
    const w = world();
    // An edit and a delete, so the rebuilt log is shorter than the one the file saw.
    w.network.putJson('carol', postPath(HOUR_MS), { text: 'edited' });
    w.network.del('bob', postPath(HOUR_MS));
    const a = device(w);
    a.runtime.start('alice');
    await a.synced();
    await until(() => a.counts.writes === 1, 'the save');
    w.network.restore('hs1');

    const b = device(w);
    b.runtime.start('alice');
    await b.synced();

    const head = w.network.headOf('hs1');
    for (const scope of await b.store.listScopes()) {
      expect(await headOf(b.store, scope), scopeId(scope)).not.toBeNull();
      expect((await headOf(b.store, scope)) ?? head, scopeId(scope)).toBeLessThanOrEqual(head);
    }
    for (const user of ['alice', 'bob', 'carol']) {
      expect(await served(b.store, user, 'hs1', ACTIVITY)).toEqual(w.network.liveOf(user, [POSTS]));
    }
  });
});

/** A reversible toy seal that also records the names it saw; one that `breaks` cannot open anything. */
function toySealer(breaks = false) {
  const names: string[] = [];
  const sealer: IndexSealer = {
    seal: async (bytes, name) => {
      names.push(name);
      return Uint8Array.from([0x53, ...bytes.map((byte) => byte ^ 0x5a)]);
    },
    open: async (bytes) => {
      if (breaks || bytes[0] !== 0x53) throw new Error('cannot open');
      return bytes.slice(1).map((byte) => byte ^ 0x5a);
    },
  };
  return { sealer, names };
}

describe('saved index sealing', () => {
  it('writes a sealed file that a device with the sealer opens and one without cannot read', async () => {
    const w = world();
    const seal = toySealer();
    const a = device(w, { sealer: seal.sealer });
    a.runtime.start('alice');
    await a.synced();
    await until(() => a.counts.writes === 1, 'the save');

    const [name] = await w.network.listIndexFiles();
    expect(seal.names).toEqual([name]);
    await expect(decodeIndexFile((await w.network.readIndexFile(name)) ?? new Uint8Array())).rejects.toMatchObject({
      code: 'malformed',
    });

    const b = device(w, { sealer: toySealer().sealer });
    b.runtime.start('alice');
    await b.synced();
    await until(() => b.counts.writes === 1, 'the second save');
    expect(b.runtime.status().savedIndex).toMatchObject({ loadedFiles: 1, ignoredFiles: 0, error: null });

    const c = device(w, { sealer: toySealer(true).sealer });
    c.runtime.start('alice');
    await c.synced();
    expect(c.runtime.status()).toMatchObject({ lastError: null, savedIndex: { loadedFiles: 0, ignoredFiles: 2 } });
    expect(await served(c.store, 'alice', 'hs1', GRAPH)).toEqual(w.network.liveOf('alice', [FOLLOWS]));
  });
});

const isPost = (value: unknown): value is Post =>
  typeof value === 'object' && value !== null && 'text' in value && typeof value.text === 'string';
const revivePost: ReviveData<Post> = (_author, _path, value) => (isPost(value) ? value : null);

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

  async function snapshot() {
    const w = world({ alice: 5, bob: 10, carol: 60 });
    const a = device(w, { savedIndex: false });
    a.runtime.start('alice');
    await a.synced();
    return snapshotIndex({
      store: a.store,
      domain: testDomain,
      seed: 'alice',
      writer: 'w',
      writtenAt: NOW,
      hops: 2,
      windowDays: 30,
    });
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
