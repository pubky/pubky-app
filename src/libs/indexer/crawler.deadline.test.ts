// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ACTIVITY, DAY_MS, FOLLOWS, GRAPH, harness, NOW, postPath, POSTS, served } from './crawler.fixtures';
import type { FakeNetwork } from './fakeNetwork';
import { IndexerAbortedError } from './indexer.errors';
import { fakeTime, settle } from './runtime.fixtures';
import type { IndexerTransport } from './transport.types';

const REQUEST_MS = 30 * 1000;
const LOOKUP_MS = 10 * 1000;
const STEP_MS = 1000;
/** A request and its three retries. */
const TRIES = 4;
/** A first sync reads a user's graph and activity at once. */
const READS = 2;

type FakeTime = ReturnType<typeof fakeTime>;

interface Hangs {
  read?: (homeserver: string) => boolean;
  get?: (author: string) => boolean;
  lookup?: (user: string) => boolean;
}

/**
 * The network with the chosen calls never settling and deaf to their signal, as a request to a dead homeserver can
 * be. `settleLate` settles them afterwards, half resolving and half rejecting.
 */
function hanging(network: FakeNetwork, hangs: Hangs) {
  const signals: AbortSignal[] = [];
  const late: Array<(index: number) => void> = [];
  const hang = <T>(value: T, signal?: AbortSignal) => {
    if (signal !== undefined) signals.push(signal);
    return new Promise<T>((resolve, reject) => {
      late.push((index) => (index % 2 === 0 ? resolve(value) : reject(new Error('settled late'))));
    });
  };
  const transport: IndexerTransport = {
    resolveHomeserver: (user) => (hangs.lookup?.(user) ? hang('hs1') : network.resolveHomeserver(user)),
    readEvents: (request) =>
      hangs.read?.(request.homeserver) ? hang([], request.signal) : network.readEvents(request),
    getPublic: (request) => (hangs.get?.(request.author) ? hang(null, request.signal) : network.getPublic(request)),
    listIndexFiles: () => network.listIndexFiles(),
    readIndexFile: (name) => network.readIndexFile(name),
    writeIndexFile: (name, bytes) => network.writeIndexFile(name, bytes),
    deleteIndexFile: (name) => network.deleteIndexFile(name),
  };
  const settleLate = () => late.forEach((settleOne, index) => settleOne(index));
  return { transport, signals, settleLate, hung: () => late.length };
}

/** Moves fake time in steps until `promise` settles. */
async function drive<T>(promise: Promise<T>, time: FakeTime): Promise<T> {
  let done = false;
  const finish = () => {
    done = true;
  };
  promise.then(finish, finish);
  for (let step = 0; step < 200 && !done; step += 1) await time.advance(STEP_MS);
  return promise;
}

/** alice on hs1 follows bob on hs2 and carol on hs3, who each posted once. */
function world() {
  const time = fakeTime(NOW);
  const setup = harness({}, time.schedule);
  const { network } = setup;
  network.addHomeserver('hs1').addHomeserver('hs2').addHomeserver('hs3');
  network.addUser('alice', 'hs1').addUser('bob', 'hs2').addUser('carol', 'hs3');
  network.put('alice', `${FOLLOWS}bob`);
  network.put('alice', `${FOLLOWS}carol`);
  network.putJson('bob', postPath(DAY_MS), { text: 'bob' });
  network.putJson('carol', postPath(DAY_MS), { text: 'carol' });
  return { ...setup, time };
}

describe('request deadlines', () => {
  it('fails a homeserver whose stream read never settles, backs it off, and syncs the others', async () => {
    const w = world();
    const net = hanging(w.network, { read: (homeserver) => homeserver === 'hs2' });
    const crawler = w.crawlerOf(net.transport);

    const result = await drive(crawler.syncScope('alice'), w.time);

    expect(result.failedHomeservers).toEqual(['hs2']);
    expect(w.time.clock.now - NOW).toBeGreaterThanOrEqual(TRIES * REQUEST_MS);
    expect(w.time.clock.now - NOW).toBeLessThan(TRIES * REQUEST_MS + 2 * STEP_MS);
    expect(net.signals.length).toBe(READS * TRIES);
    expect(net.signals.every((signal) => signal.aborted)).toBe(true);
    expect((await w.store.readHomeserverState('hs2')).failure?.failures).toBe(1);
    expect(await served(w.store, 'carol', 'hs3', ACTIVITY)).toEqual(w.network.liveOf('carol', [POSTS]));
    expect(await served(w.store, 'alice', 'hs1', GRAPH)).toEqual(w.network.liveOf('alice', [FOLLOWS]));

    // Backing off: the next sync asks hs2 nothing and waits for no deadline.
    const hungBefore = net.hung();
    const mark = w.time.clock.now;
    expect((await drive(crawler.syncScope('alice'), w.time)).failedHomeservers).toEqual(['hs2']);
    expect(net.hung()).toBe(hungBefore);
    expect(w.time.clock.now - mark).toBeLessThan(2 * STEP_MS);

    // Settled after the deadline, the calls change nothing and reject unobserved without an unhandled rejection.
    net.settleLate();
    await settle();
    expect(await served(w.store, 'bob', 'hs2', ACTIVITY)).toEqual(new Map());
  });

  it('fails a homeserver whose file fetch never settles', async () => {
    const w = world();
    const net = hanging(w.network, { get: (author) => author === 'bob' });

    const result = await drive(w.crawlerOf(net.transport).syncScope('alice'), w.time);

    expect(result.failedHomeservers).toEqual(['hs2']);
    expect(net.signals.length).toBe(TRIES);
    expect(net.signals.every((signal) => signal.aborted)).toBe(true);
    expect((await w.store.readHomeserverState('hs2')).failure?.failures).toBe(1);
    expect(await served(w.store, 'carol', 'hs3', ACTIVITY)).toEqual(w.network.liveOf('carol', [POSTS]));
    net.settleLate();
    await settle();
  });

  it('retries a stream read past its deadline, losing nothing and failing no homeserver', async () => {
    const w = world();
    let reads = 0;
    const net = hanging(w.network, { read: (homeserver) => homeserver === 'hs2' && (reads += 1) === 1 });

    const result = await drive(w.crawlerOf(net.transport).syncScope('alice'), w.time);

    expect(result.failedHomeservers).toEqual([]);
    expect(net.signals.length).toBe(1);
    expect(net.signals[0].aborted).toBe(true);
    expect((await w.store.readHomeserverState('hs2')).failure).toBeNull();
    expect(await served(w.store, 'bob', 'hs2', ACTIVITY)).toEqual(w.network.liveOf('bob', [POSTS]));
    net.settleLate();
    await settle();
  });

  it('leaves a user whose lookup never settles unresolved after the lookup deadline', async () => {
    const w = world();
    const net = hanging(w.network, { lookup: (user) => user === 'carol' });

    const result = await drive(w.crawlerOf(net.transport).syncScope('alice'), w.time);

    expect(result.failedHomeservers).toEqual([]);
    expect(result.members.has('carol')).toBe(true);
    expect(w.time.clock.now - NOW).toBeGreaterThanOrEqual(LOOKUP_MS);
    expect(w.time.clock.now - NOW).toBeLessThan(REQUEST_MS);
    expect((await w.store.listScopes()).some((scope) => scope.author === 'carol')).toBe(false);
    expect(await served(w.store, 'bob', 'hs2', ACTIVITY)).toEqual(w.network.liveOf('bob', [POSTS]));
    net.settleLate();
    await settle();
  });

  it('takes its deadlines from the options', async () => {
    const time = fakeTime(NOW);
    const setup = harness({ requestTimeoutMs: 5000 }, time.schedule);
    setup.network.addHomeserver('hs1').addUser('alice', 'hs1');
    const net = hanging(setup.network, { read: () => true });

    const result = await drive(setup.crawlerOf(net.transport).syncScope('alice'), time);

    expect(result.failedHomeservers).toEqual(['hs1']);
    expect(time.clock.now - NOW).toBeLessThan(TRIES * 5000 + 2 * STEP_MS);
  });

  it('rejects at once when aborted while a call hangs, with no deadline to wait for', async () => {
    const w = world();
    const net = hanging(w.network, { read: (homeserver) => homeserver === 'hs1' });
    const controller = new AbortController();

    const sync = w.crawlerOf(net.transport).syncScope('alice', controller.signal);
    for (let turn = 0; turn < 50 && net.hung() < READS; turn += 1) await settle();
    expect(net.hung()).toBe(READS);
    controller.abort();

    await expect(sync).rejects.toBeInstanceOf(IndexerAbortedError);
    expect(w.time.clock.now).toBe(NOW);
    expect(net.signals.every((signal) => signal.aborted)).toBe(true);
    expect(w.time.pending()).toBe(0);
  });
});
