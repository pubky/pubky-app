// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ACTIVITY, DAY_MS, FOLLOWS, GRAPH, harness, postPath, POSTS, served, servedData } from './crawler.fixtures';
import type { CrawlerOptions } from './crawler.types';
import { CURSOR_ZERO } from './cursor';
import { encodeJson, type FakeNetwork } from './fakeNetwork';
import { HomeserverUnreachableError, IndexerAbortedError } from './indexer.errors';
import { mergeRuns } from './merge';
import { validateRun } from './run';
import type { GetPublicRequest, IndexerTransport } from './transport.types';

const MINUTE_MS = 60 * 1000;

/** alice on hs1 follows bob on hs2 and carol on hs3, who each follow nobody and posted once. */
function threeHomeservers() {
  const setup = harness();
  const { network } = setup;
  network.addHomeserver('hs1').addHomeserver('hs2').addHomeserver('hs3');
  network.addUser('alice', 'hs1').addUser('bob', 'hs2').addUser('carol', 'hs3');
  network.put('alice', `${FOLLOWS}bob`);
  network.put('alice', `${FOLLOWS}carol`);
  network.putJson('bob', postPath(DAY_MS), { text: 'bob' });
  network.putJson('carol', postPath(DAY_MS), { text: 'carol' });
  return setup;
}

describe('syncScope failures', () => {
  it('keeps syncing the others past a dead homeserver, backs off, and retries after retryAt', async () => {
    const { network, store, crawler, clock, waits } = threeHomeservers();
    network.setDown('hs2', true);

    const first = await crawler.syncScope('alice');

    expect(first.failedHomeservers).toEqual(['hs2']);
    expect(first.members.has('bob')).toBe(true);
    // bob's graph and activity, read at once, retried three times each, each wait doubling per retry of its read.
    expect(waits.sort((a, b) => a - b)).toEqual([1000, 1000, 2000, 2000, 4000, 4000]);
    expect(await served(store, 'carol', 'hs3', ACTIVITY)).toEqual(network.liveOf('carol', [POSTS]));
    expect((await store.readHomeserverState('hs2')).failure).toEqual({ failures: 1, retryAt: clock.now + MINUTE_MS });

    clock.now += MINUTE_MS;
    await crawler.syncScope('alice');
    expect((await store.readHomeserverState('hs2')).failure).toEqual({
      failures: 2,
      retryAt: clock.now + 2 * MINUTE_MS,
    });

    network.setDown('hs2', false);
    clock.now += MINUTE_MS;
    const mark = network.reads.length;
    expect((await crawler.syncScope('alice')).failedHomeservers).toEqual(['hs2']);
    expect(network.reads.slice(mark).some((read) => read.homeserver === 'hs2')).toBe(false);

    clock.now += MINUTE_MS;
    expect((await crawler.syncScope('alice')).failedHomeservers).toEqual([]);
    expect((await store.readHomeserverState('hs2')).failure).toBeNull();
    expect(await served(store, 'bob', 'hs2', ACTIVITY)).toEqual(network.liveOf('bob', [POSTS]));
  });

  it('retries a rate-limited request once the asked wait is over and succeeds', async () => {
    const { network, store, crawler, waits } = threeHomeservers();
    network.rateLimit('hs3', 1, 250);

    const { failedHomeservers } = await crawler.syncScope('alice');

    expect(failedHomeservers).toEqual([]);
    expect(waits[0]).toBe(250);
    expect(await served(store, 'carol', 'hs3', ACTIVITY)).toEqual(network.liveOf('carol', [POSTS]));
  });

  it('gives up on a homeserver for this sync after three rate-limited retries, without backing off', async () => {
    const { network, store, crawler } = threeHomeservers();
    // carol's graph and activity reads, each refused four times.
    network.rateLimit('hs3', 8);

    const { failedHomeservers } = await crawler.syncScope('alice');

    expect(failedHomeservers).toEqual(['hs3']);
    expect((await store.readHomeserverState('hs3')).failure).toBeNull();
    expect(await served(store, 'bob', 'hs2', ACTIVITY)).toEqual(network.liveOf('bob', [POSTS]));
  });

  it('paces a rate-limited homeserver for every operation after it, one stream request per gap', async () => {
    const { network, crawlerOf, clock } = threeHomeservers();
    const starts: number[] = [];
    const crawler = crawlerOf({
      resolveHomeserver: (user) => network.resolveHomeserver(user),
      readEvents: (request) => {
        if (request.homeserver === 'hs3') starts.push(clock.now);
        return network.readEvents(request);
      },
      getPublic: (request) => network.getPublic(request),
      listIndexFiles: () => network.listIndexFiles(),
      readIndexFile: (name) => network.readIndexFile(name),
      writeIndexFile: (name, bytes) => network.writeIndexFile(name, bytes),
      deleteIndexFile: (name) => network.deleteIndexFile(name),
    });
    network.rateLimit('hs3', 8);
    await crawler.syncScope('alice');
    const refused = starts.length;
    expect(refused).toBe(8);

    // The next operation finds the route paced, so its reads go one per gap instead of all at once.
    expect((await crawler.syncUsers(['carol'])).failedHomeservers).toEqual([]);
    expect(starts.length - refused).toBeGreaterThanOrEqual(2);
    const gaps = starts.slice(refused - 1).map((at, i, all) => (i === 0 ? null : at - all[i - 1]));
    expect(gaps.slice(1).every((gap) => gap !== null && gap >= 1000)).toBe(true);
  });

  it('crawls the homeservers of a hop together, so a stalled one holds up none of the others', async () => {
    const { network, store, crawlerOf } = threeHomeservers();
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const stalling: IndexerTransport = {
      resolveHomeserver: (user) => network.resolveHomeserver(user),
      readEvents: async (request) => {
        if (request.homeserver === 'hs2') await held;
        return network.readEvents(request);
      },
      getPublic: (request) => network.getPublic(request),
      listIndexFiles: () => network.listIndexFiles(),
      readIndexFile: (name) => network.readIndexFile(name),
      writeIndexFile: (name, bytes) => network.writeIndexFile(name, bytes),
      deleteIndexFile: (name) => network.deleteIndexFile(name),
    };

    network.put('carol', `${FOLLOWS}alice`);

    const sync = crawlerOf(stalling).syncScope('alice');
    for (let turn = 0; turn < 100 && (await served(store, 'carol', 'hs3', GRAPH)).size === 0; turn += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(await served(store, 'carol', 'hs3', GRAPH)).toEqual(network.liveOf('carol', [FOLLOWS]));
    expect((await store.listScopes()).some((scope) => scope.author === 'bob')).toBe(false);
    release();
    expect((await sync).failedHomeservers).toEqual([]);
    expect(await served(store, 'bob', 'hs2', ACTIVITY)).toEqual(network.liveOf('bob', [POSTS]));
  });

  it('detects a restored homeserver and resyncs it, leaving no stale record', async () => {
    const { network, store, crawler } = harness();
    network.addHomeserver('hs1').addUser('alice', 'hs1').addUser('bob', 'hs1');
    network.put('alice', `${FOLLOWS}bob`);
    const [p1, p2, p3, p4] = [4, 3, 2, 1].map((days) => postPath(days * DAY_MS));
    network.putJson('bob', p1, { text: 'p1' });
    network.putJson('bob', p2, { text: 'p2' });
    network.putJson('bob', p3, { text: 'p3' });
    network.del('bob', p2);
    network.putJson('bob', p1, { text: 'p1 edited' });
    await crawler.syncScope('alice');
    network.del('bob', p3);
    network.restore('hs1');
    network.putJson('bob', p4, { text: 'p4' });

    await crawler.syncScope('alice');

    expect(await served(store, 'bob', 'hs1', ACTIVITY)).toEqual(network.liveOf('bob', [POSTS]));
    expect(await servedData(store, 'bob', 'hs1', ACTIVITY)).toEqual(
      new Map([
        [p1, { text: 'p1 edited' }],
        [p4, { text: 'p4' }],
      ]),
    );
    expect(await served(store, 'alice', 'hs1', GRAPH)).toEqual(network.liveOf('alice', [FOLLOWS]));
    // The clock restarted with the log: no sample of the old cursors is left to date the new ones.
    const live = [...network.lastEvents('bob', [POSTS]).values()].map(({ cursor }) => cursor);
    expect((await store.readHomeserverState('hs1')).clock.map(({ cursor }) => cursor)).toEqual(live);
  });
});

/** The network, with the file fetches `fails` picks failing as unreachable, and every fetch asked logged. */
function failingGets(network: FakeNetwork, fails: (request: GetPublicRequest) => boolean) {
  const gets: GetPublicRequest[] = [];
  const transport: IndexerTransport = {
    resolveHomeserver: (user) => network.resolveHomeserver(user),
    readEvents: (request) => network.readEvents(request),
    getPublic: async (request) => {
      gets.push(request);
      if (fails(request)) throw new HomeserverUnreachableError(request.author);
      return network.getPublic(request);
    },
    listIndexFiles: () => network.listIndexFiles(),
    readIndexFile: (name) => network.readIndexFile(name),
    writeIndexFile: (name, bytes) => network.writeIndexFile(name, bytes),
    deleteIndexFile: (name) => network.deleteIndexFile(name),
  };
  return { transport, gets };
}

/** alice on hs1 follows the users, each on hs1 with one post at `path`. */
function oneHomeserver(users: readonly string[], path: string, options: Partial<CrawlerOptions> = {}) {
  const setup = harness(options);
  setup.network.addHomeserver('hs1').addUser('alice', 'hs1');
  for (const user of users) {
    setup.network.addUser(user, 'hs1');
    setup.network.put('alice', `${FOLLOWS}${user}`);
    setup.network.putJson(user, path, { text: user });
  }
  return setup;
}

describe('syncScope request retries', () => {
  it('retries a file fetch that fails once, losing nothing and failing no homeserver', async () => {
    const users = ['u0', 'u1', 'u2'];
    const path = postPath(DAY_MS);
    const { network, store, crawlerOf, waits } = oneHomeserver(users, path);
    let fetches = 0;
    const flaky = failingGets(network, () => (fetches += 1) === 1);

    const { failedHomeservers } = await crawlerOf(flaky.transport).syncScope('alice');

    expect(failedHomeservers).toEqual([]);
    expect(waits).toEqual([1000]);
    expect((await store.readHomeserverState('hs1')).failure).toBeNull();
    for (const user of users) {
      expect(await servedData(store, user, 'hs1', ACTIVITY)).toEqual(new Map([[path, { text: user }]]));
    }
  });

  it('asks a dead homeserver at most four times per fetch in flight, then nothing while it backs off', async () => {
    const { network, store, crawlerOf } = harness({ homeserverConcurrency: 4 });
    network.addHomeserver('hs1').addHomeserver('hs2').addUser('alice', 'hs1').addUser('bob', 'hs2');
    network.put('alice', `${FOLLOWS}bob`);
    for (let i = 0; i < 40; i += 1) network.putJson('bob', postPath(DAY_MS + i), { text: `bob ${i}` });
    const dead = failingGets(network, ({ author }) => author === 'bob');
    const crawler = crawlerOf(dead.transport);

    expect((await crawler.syncScope('alice')).failedHomeservers).toEqual(['hs2']);
    expect(dead.gets.length).toBeGreaterThanOrEqual(4);
    expect(dead.gets.length).toBeLessThanOrEqual(4 * 4);
    expect(await store.readCoverage({ author: 'bob', homeserver: 'hs2', group: ACTIVITY })).toEqual([]);

    const gets = dead.gets.length;
    const reads = network.reads.length;
    expect((await crawler.syncScope('alice')).failedHomeservers).toEqual(['hs2']);
    expect(dead.gets.length).toBe(gets);
    expect(network.reads.slice(reads).some((read) => read.homeserver === 'hs2')).toBe(false);
  });

  it('commits nothing of a batch whose fetch keeps failing, and the next sync reads its users from their heads', async () => {
    const users = ['u0', 'u1', 'u2', 'u3', 'u4'];
    const first = postPath(2 * DAY_MS);
    const { network, store, crawlerOf, clock } = oneHomeserver(users, first, { batchSize: 2 });
    let broken = true;
    const flaky = failingGets(network, ({ author }) => broken && author === 'u2');
    const crawler = crawlerOf(flaky.transport);
    const coverageOf = (user: string) => store.readCoverage({ author: user, homeserver: 'hs1', group: ACTIVITY });
    const afterBackoff = async () => {
      clock.now = (await store.readHomeserverState('hs1')).failure?.retryAt ?? clock.now;
    };

    // Batches [u0, u1], [u2, u3], [u4] commit as one stream, and u2's post shares the one slice with the others'.
    expect((await crawler.syncScope('alice')).failedHomeservers).toEqual(['hs1']);
    for (const user of users) expect(await coverageOf(user)).toEqual([]);

    broken = false;
    await afterBackoff();
    expect((await crawler.syncScope('alice')).failedHomeservers).toEqual([]);
    for (const user of users) {
      expect(await servedData(store, user, 'hs1', ACTIVITY)).toEqual(new Map([[first, { text: user }]]));
    }

    // Warm, the stored coverage stays where it was, below the event whose file did not come.
    const stored = await coverageOf('u2');
    const second = postPath(DAY_MS);
    network.putJson('u2', second, { text: 'again' });
    broken = true;
    expect((await crawler.syncScope('alice')).failedHomeservers).toEqual(['hs1']);
    expect(await coverageOf('u2')).toEqual(stored);
    expect((await served(store, 'u2', 'hs1', ACTIVITY)).has(second)).toBe(false);

    broken = false;
    await afterBackoff();
    expect((await crawler.syncScope('alice')).failedHomeservers).toEqual([]);
    expect(await servedData(store, 'u2', 'hs1', ACTIVITY)).toEqual(
      new Map([
        [first, { text: 'u2' }],
        [second, { text: 'again' }],
      ]),
    );
  });
});

describe('syncScope bodies', () => {
  it('keeps a record without data on a 404 or a hash mismatch until the superseding event', async () => {
    const { network, store, crawler } = harness();
    network.addHomeserver('hs1').addUser('alice', 'hs1');
    const [gone, changed] = [postPath(2 * DAY_MS), postPath(DAY_MS)];
    network.putJson('alice', gone, { text: 'gone' });
    network.overrideFile('alice', gone, null);
    network.putJson('alice', changed, { text: 'v1' });
    network.overrideFile('alice', changed, encodeJson({ text: 'v2' }));

    await crawler.syncScope('alice');
    expect(await servedData(store, 'alice', 'hs1', ACTIVITY)).toEqual(
      new Map([
        [gone, undefined],
        [changed, undefined],
      ]),
    );

    network.putJson('alice', gone, { text: 'back' });
    network.putJson('alice', changed, { text: 'v2' });
    await crawler.syncScope('alice');
    expect(await servedData(store, 'alice', 'hs1', ACTIVITY)).toEqual(
      new Map([
        [gone, { text: 'back' }],
        [changed, { text: 'v2' }],
      ]),
    );
  });
});

describe('backfill', () => {
  it('extends the windowed tail page by page down to the stream start', async () => {
    const { network, store, crawler } = harness({ sliceLimit: 5 });
    network.addHomeserver('hs1').addUser('alice', 'hs1');
    const old = Array.from({ length: 12 }, (_, i) => network.putJson('alice', postPath((60 - i) * DAY_MS), { i }));
    network.putJson('alice', postPath(2 * DAY_MS), { text: 'recent' });
    await crawler.syncScope('alice');
    expect(await served(store, 'alice', 'hs1', ACTIVITY)).toEqual(network.liveOf('alice', [POSTS], old[11]));

    const scope = { author: 'alice', homeserver: 'hs1', group: ACTIVITY };
    const once = await crawler.backfill('alice', ACTIVITY, 1);

    expect(once).toEqual({ tail: old[7] - BigInt(1), pages: 1, events: 5 });
    // Each page joins the top range, so the coverage stays one range.
    expect(await store.readCoverage(scope)).toHaveLength(1);
    expect(await served(store, 'alice', 'hs1', ACTIVITY)).toEqual(network.liveOf('alice', [POSTS], old[7] - BigInt(1)));

    expect(await crawler.backfill('alice', ACTIVITY, 10)).toEqual({ tail: CURSOR_ZERO, pages: 2, events: 7 });
    expect(await served(store, 'alice', 'hs1', ACTIVITY)).toEqual(network.liveOf('alice', [POSTS]));
    expect(await store.readCoverage(scope)).toEqual([{ tail: CURSOR_ZERO, head: network.headOf('hs1') }]);
  });

  it('shares one restore check between steps that follow each other under its epoch', async () => {
    const { network, store, crawler, clock } = harness({ sliceLimit: 2 });
    network.addHomeserver('hs1').addUser('alice', 'hs1');
    for (let i = 0; i < 12; i += 1) network.putJson('alice', postPath((60 - i) * DAY_MS), { i });
    network.putJson('alice', postPath(2 * DAY_MS), { text: 'recent' });
    await crawler.syncScope('alice');
    const requestsOf = async (step: () => Promise<unknown>) => {
      const before = crawler.stats().streamRequests;
      await step();
      return crawler.stats().streamRequests - before;
    };
    const stepBack = () => crawler.backfill('alice', ACTIVITY, 1);

    // The first step checks and reads a page, the next one only reads.
    expect(await requestsOf(stepBack)).toBe(2);
    expect(await requestsOf(stepBack)).toBe(1);
    clock.now += 30 * 1000;
    expect(await requestsOf(stepBack)).toBe(2);
    // A restore another operation found moves the epoch, and the next step checks again.
    expect(await requestsOf(stepBack)).toBe(1);
    network.del('alice', postPath(2 * DAY_MS));
    await crawler.syncScope('alice');
    network.restore('hs1');
    await crawler.syncScope('alice');
    expect((await store.readHomeserverState('hs1')).epoch).toBe(1);
    expect(await requestsOf(stepBack)).toBe(2);
  });

  it('starts at the newest event of an author whose window held none of theirs', async () => {
    const { network, store, crawler } = harness({ sliceLimit: 5 });
    network.addHomeserver('hs1').addUser('alice', 'hs1');
    const old = Array.from({ length: 3 }, (_, i) => network.putJson('alice', postPath((60 - i) * DAY_MS), { i }));
    await crawler.syncScope('alice');
    const scope = { author: 'alice', homeserver: 'hs1', group: ACTIVITY };
    expect(await store.readCoverage(scope)).toEqual([]);

    expect(await crawler.backfill('alice', ACTIVITY, 1)).toEqual({ tail: CURSOR_ZERO, pages: 1, events: 3 });

    expect(await store.readCoverage(scope)).toEqual([{ tail: CURSOR_ZERO, head: old[2] }]);
    expect(await served(store, 'alice', 'hs1', ACTIVITY)).toEqual(network.liveOf('alice', [POSTS]));
  });

  it('reads pages of its own size, fetching and committing each page before the next', async () => {
    const { network, store, crawler, crawlerOf } = harness({ sliceLimit: 4 });
    network.addHomeserver('hs1').addUser('alice', 'hs1');
    Array.from({ length: 10 }, (_, i) => network.putJson('alice', postPath((60 - i) * DAY_MS), { i }));
    network.putJson('alice', postPath(2 * DAY_MS), { text: 'recent' });
    await crawler.syncScope('alice');

    const limits: number[] = [];
    const log: string[] = [];
    const counting: IndexerTransport = {
      resolveHomeserver: (user) => network.resolveHomeserver(user),
      readEvents: (request) => {
        limits.push(request.limit);
        log.push('read');
        return network.readEvents(request);
      },
      getPublic: (request) => {
        log.push('get');
        return network.getPublic(request);
      },
      listIndexFiles: () => network.listIndexFiles(),
      readIndexFile: (name) => network.readIndexFile(name),
      writeIndexFile: (name, bytes) => network.writeIndexFile(name, bytes),
      deleteIndexFile: (name) => network.deleteIndexFile(name),
    };
    const backfiller = crawlerOf(counting);
    backfiller.onCommit(() => log.push('commit'));

    await backfiller.backfill('alice', ACTIVITY, 2);

    // The restore check reads the newest event of the high-water author first.
    expect(limits).toEqual([1, 4, 4]);
    const step = ['read', 'get', 'get', 'get', 'get', 'commit'];
    expect(log).toEqual(['read', ...step, ...step]);
    expect(await store.readCoverage({ author: 'alice', homeserver: 'hs1', group: ACTIVITY })).toHaveLength(1);
  });

  it('ends an exactly full page below its lowest cursor, and the empty page after it at the stream start', async () => {
    const { network, store, crawler } = harness({ sliceLimit: 5 });
    network.addHomeserver('hs1').addUser('alice', 'hs1').addUser('zed', 'hs1');
    // Someone else's event first, so alice's oldest post is not at cursor 1 and its page ends above zero.
    network.putJson('zed', postPath(90 * DAY_MS), { text: 'zed' });
    const old = Array.from({ length: 10 }, (_, i) => network.putJson('alice', postPath((60 - i) * DAY_MS), { i }));
    network.putJson('alice', postPath(2 * DAY_MS), { text: 'recent' });
    await crawler.syncScope('alice');
    const scope = { author: 'alice', homeserver: 'hs1', group: ACTIVITY };

    // The window starts at the newest old post, which lies outside the range: the first page reads it too.
    expect(await crawler.backfill('alice', ACTIVITY, 2)).toEqual({ tail: old[0] - BigInt(1), pages: 2, events: 10 });
    expect(await store.readCoverage(scope)).toHaveLength(1);
    expect(await crawler.backfill('alice', ACTIVITY, 5)).toEqual({ tail: CURSOR_ZERO, pages: 1, events: 0 });
    expect(await store.readCoverage(scope)).toEqual([{ tail: CURSOR_ZERO, head: network.headOf('hs1') }]);
    expect(await served(store, 'alice', 'hs1', ACTIVITY)).toEqual(network.liveOf('alice', [POSTS]));
  });
});

describe('abort', () => {
  it('leaves only valid scopes behind, and a later sync completes', async () => {
    const { network, store, crawlerOf } = harness({ batchSize: 2, pageLimit: 3 });
    network.addHomeserver('hs1').addUser('alice', 'hs1');
    const users = ['u0', 'u1', 'u2', 'u3', 'u4', 'u5'];
    for (const user of users) {
      network.addUser(user, 'hs1');
      network.put('alice', `${FOLLOWS}${user}`);
      network.putJson(user, postPath(DAY_MS), { text: user });
    }
    const controller = new AbortController();
    let reads = 0;
    const aborting: IndexerTransport = {
      resolveHomeserver: (user) => network.resolveHomeserver(user),
      readEvents: (request) => {
        reads += 1;
        if (reads === 6) controller.abort();
        return network.readEvents(request);
      },
      getPublic: (request) => network.getPublic(request),
      listIndexFiles: () => network.listIndexFiles(),
      readIndexFile: (name) => network.readIndexFile(name),
      writeIndexFile: (name, bytes) => network.writeIndexFile(name, bytes),
      deleteIndexFile: (name) => network.deleteIndexFile(name),
    };

    await expect(crawlerOf(aborting).syncScope('alice', controller.signal)).rejects.toThrow(IndexerAbortedError);

    const scopes = await store.listScopes();
    expect(scopes.length).toBeGreaterThan(0);
    for (const scope of scopes) {
      const runs = await store.exportRuns(scope);
      expect(runs.flatMap(validateRun)).toEqual([]);
      expect(await store.readScope(scope)).toEqual(mergeRuns(runs));
    }

    const { members } = await crawlerOf(network).syncScope('alice');
    expect(members.size).toBe(7);
    for (const user of users) {
      expect(await served(store, user, 'hs1', ACTIVITY)).toEqual(network.liveOf(user, [POSTS]));
    }
  });
});
