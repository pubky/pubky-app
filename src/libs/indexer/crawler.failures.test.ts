// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  ACTIVITY,
  DAY_MS,
  FOLLOWS,
  GRAPH,
  harness,
  NOW,
  postPath,
  POSTS,
  served,
  servedData,
} from './crawler.fixtures';
import { CURSOR_ZERO } from './cursor';
import { encodeJson } from './fakeNetwork';
import { IndexerAbortedError } from './indexer.errors';
import { mergeRuns } from './merge';
import { validateRun } from './run';
import type { IndexerTransport } from './transport.types';

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
    const { network, store, crawler, clock } = threeHomeservers();
    network.setDown('hs2', true);

    const first = await crawler.syncScope('alice');

    expect(first.failedHomeservers).toEqual(['hs2']);
    expect(first.members.has('bob')).toBe(true);
    expect(await served(store, 'carol', 'hs3', ACTIVITY)).toEqual(network.liveOf('carol', [POSTS]));
    expect((await store.readHomeserverState('hs2')).failure).toEqual({ failures: 1, retryAt: NOW + MINUTE_MS });

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

  it('retries a rate-limited request after the asked wait and succeeds', async () => {
    const { network, store, crawler, waits } = threeHomeservers();
    network.rateLimit('hs3', 2, 250);

    const { failedHomeservers } = await crawler.syncScope('alice');

    expect(failedHomeservers).toEqual([]);
    expect(waits).toEqual([250, 250]);
    expect(await served(store, 'carol', 'hs3', ACTIVITY)).toEqual(network.liveOf('carol', [POSTS]));
  });

  it('gives up on a homeserver for this sync after three rate-limited retries, without backing off', async () => {
    const { network, store, crawler, waits } = threeHomeservers();
    network.rateLimit('hs3', 4);

    const { failedHomeservers } = await crawler.syncScope('alice');

    expect(failedHomeservers).toEqual(['hs3']);
    expect(waits).toEqual([1000, 2000, 4000]);
    expect((await store.readHomeserverState('hs3')).failure).toBeNull();
    expect(await served(store, 'bob', 'hs2', ACTIVITY)).toEqual(network.liveOf('bob', [POSTS]));
  });

  it('doubles the wait per consecutive 429 of a homeserver up to 8 s, until a success resets it', async () => {
    const { network, store, crawler, waits } = threeHomeservers();
    network.rateLimit('hs3', 4);
    await crawler.syncScope('alice');
    expect(waits).toEqual([1000, 2000, 4000]);

    network.rateLimit('hs3', 1);
    expect((await crawler.syncScope('alice')).failedHomeservers).toEqual([]);
    expect(waits.slice(3)).toEqual([8000]);
    expect(await served(store, 'carol', 'hs3', ACTIVITY)).toEqual(network.liveOf('carol', [POSTS]));

    network.rateLimit('hs3', 1);
    network.rateLimit('hs2', 2);
    await crawler.syncScope('alice');
    expect(waits.slice(4).sort((a, b) => a - b)).toEqual([1000, 1000, 2000]);
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
    const { network, store, crawler } = harness({ backfillPageLimit: 5 });
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

  it('reads pages of its own size, fetching and committing each page before the next', async () => {
    const { network, store, crawler, crawlerOf } = harness({ backfillPageLimit: 4 });
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

    expect(limits).toEqual([4, 4]);
    const step = ['read', 'get', 'get', 'get', 'get', 'commit'];
    expect(log).toEqual([...step, ...step]);
    expect(await store.readCoverage({ author: 'alice', homeserver: 'hs1', group: ACTIVITY })).toHaveLength(1);
  });

  it('ends an exactly full page below its lowest cursor, and the empty page after it at the stream start', async () => {
    const { network, store, crawler } = harness({ backfillPageLimit: 5 });
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
