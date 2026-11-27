// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createCrawler } from './crawler';
import {
  ACTIVITY,
  DAY_MS,
  FOLLOWS,
  GRAPH,
  harness,
  NOW,
  type Post,
  postPath,
  POSTS,
  served,
  servedData,
  testDomain,
} from './crawler.fixtures';
import { CURSOR_ZERO } from './cursor';
import type { Domain } from './domain.types';
import type { FakeNetwork } from './fakeNetwork';
import { HomeserverUnreachableError, InvalidIndexInputError } from './indexer.errors';
import { createMemoryStore } from './memoryStore';
import { settle } from './runtime.fixtures';
import type { IndexerTransport } from './transport.types';

const MINUTE_MS = 60 * 1000;

/** Each user follows the next one, all on `homeserver`. */
function chain(network: FakeNetwork, users: string[], homeserver = 'hs1'): void {
  for (const user of users) network.addUser(user, homeserver);
  users.slice(1).forEach((user, i) => network.put(users[i], `${FOLLOWS}${user}`));
}

/** Events the fake served to forward reads from the read numbered `from` on, optionally of one author. */
function forwardEvents(network: FakeNetwork, from: number, author?: string): number {
  return network.reads
    .slice(from)
    .filter((read) => !read.reverse)
    .flatMap((read) => read.events)
    .filter((event) => author === undefined || event.author === author).length;
}

describe('createCrawler', () => {
  it('refuses a scope group without full history', () => {
    const domain: Domain<Post> = { ...testDomain, scopeGroup: ACTIVITY };
    const create = () =>
      createCrawler({ transport: harness().network, store: createMemoryStore<Post>(), domain, now: () => 0 });

    expect(create).toThrow(InvalidIndexInputError);
  });
});

describe('syncScope scope', () => {
  it('puts hops 0 to 2 in scope and stops before hop 3', async () => {
    const { network, store, crawler } = harness();
    network.addHomeserver('hs1').addHomeserver('hs2');
    chain(network, ['alice', 'bob'], 'hs1');
    network.addUser('carol', 'hs2').addUser('dave', 'hs2');
    network.put('bob', `${FOLLOWS}carol`);
    network.put('carol', `${FOLLOWS}dave`);
    const listener = vi.fn();
    crawler.subscribe(listener);

    const result = await crawler.syncScope('alice');

    const expected = new Map([
      ['alice', 0],
      ['bob', 1],
      ['carol', 2],
    ]);
    expect(result).toEqual({ members: expected, failedHomeservers: [] });
    expect(await store.readScopeMembers('alice')).toEqual(expected);
    expect(await served(store, 'carol', 'hs2', GRAPH)).toEqual(network.liveOf('carol', [FOLLOWS]));
    expect(crawler.stats()).toMatchObject({ usersPerHop: [1, 1, 1], homeserversSeen: 2, lookups: 3 });
    expect(listener).toHaveBeenLastCalledWith(crawler.stats());
  });

  it("looks up the next hop's users while the current hop's activity is read", async () => {
    const { network, crawlerOf } = harness();
    network.addHomeserver('hs1');
    chain(network, ['alice', 'bob']);
    network.putJson('alice', postPath(DAY_MS), { text: 'hello' });
    let bobLookedUp = false;
    let bobLookedUpByAliceActivity: boolean | null = null;
    const watching: IndexerTransport = {
      resolveHomeserver: (user) => {
        if (user === 'bob') bobLookedUp = true;
        return network.resolveHomeserver(user);
      },
      readEvents: async (request) => {
        const aliceActivity = request.paths.includes(POSTS) && request.users[0].user === 'alice';
        if (aliceActivity && bobLookedUpByAliceActivity === null) {
          for (let turn = 0; turn < 20 && !bobLookedUp; turn += 1)
            await new Promise((resolve) => setTimeout(resolve, 0));
          bobLookedUpByAliceActivity = bobLookedUp;
        }
        return network.readEvents(request);
      },
      getPublic: (request) => network.getPublic(request),
      indexFiles: network.indexFiles,
    };

    const { members } = await crawlerOf(watching).syncScope('alice');

    expect(bobLookedUpByAliceActivity).toBe(true);
    expect(members.get('bob')).toBe(1);
  });

  it('leaves out excluded users and whoever is reached only through them', async () => {
    const { network, crawler } = harness({ excluded: new Set(['erin']) });
    network.addHomeserver('hs1');
    chain(network, ['alice', 'bob', 'carol']);
    chain(network, ['erin', 'frank']);
    network.put('alice', `${FOLLOWS}erin`);

    const { members } = await crawler.syncScope('alice');

    expect([...members.keys()]).toEqual(['alice', 'bob', 'carol']);
  });

  it('caps the scope at maxUsers, nearest hops first', async () => {
    const { network, crawler } = harness({ maxUsers: 3 });
    network.addHomeserver('hs1');
    for (const user of ['alice', 'bob', 'carol', 'dave', 'erin']) network.addUser(user, 'hs1');
    network.put('alice', `${FOLLOWS}bob`);
    network.put('alice', `${FOLLOWS}carol`);
    network.put('alice', `${FOLLOWS}dave`);
    network.put('bob', `${FOLLOWS}erin`);

    const { members } = await crawler.syncScope('alice');

    expect(members).toEqual(
      new Map([
        ['alice', 0],
        ['bob', 1],
        ['carol', 1],
      ]),
    );
  });

  it('keeps an unresolved user in scope and skips it', async () => {
    const { network, crawler } = harness();
    network.addHomeserver('hs1').addUser('alice', 'hs1');
    network.put('alice', `${FOLLOWS}ghost`);

    const { members } = await crawler.syncScope('alice');

    expect(members.get('ghost')).toBe(1);
    expect(network.reads.every((read) => !read.users.includes('ghost'))).toBe(true);
  });

  it('commits each hop’s members before reading the next hop, and says how it reached the seed', async () => {
    const { network, store, crawlerOf } = harness();
    network.addHomeserver('hs1');
    chain(network, ['alice', 'bob', 'carol']);
    const membersAtBob: Array<Promise<Map<string, number>>> = [];
    const transport: IndexerTransport = {
      resolveHomeserver: (user) => network.resolveHomeserver(user),
      readEvents: async (request) => {
        if (membersAtBob.length === 0 && request.users.some(({ user }) => user === 'bob')) {
          membersAtBob.push(store.readScopeMembers('alice'));
        }
        return network.readEvents(request);
      },
      getPublic: (request) => network.getPublic(request),
      indexFiles: network.indexFiles,
    };
    const crawler = crawlerOf(transport);

    await crawler.syncScope('alice');

    expect(await Promise.all(membersAtBob)).toEqual([
      new Map([
        ['alice', 0],
        ['bob', 1],
      ]),
    ]);
    expect(crawler.stats().seed).toEqual({ homeserver: 'hs1', failed: false });
  });

  it('reads the activity of the seed beside its graph, and makes it and its follows members once the graph is in', async () => {
    const { network, store, crawlerOf } = harness();
    network.addHomeserver('hs1');
    chain(network, ['alice', 'bob']);
    network.putJson('alice', postPath(DAY_MS), { text: 'alice' });
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transport: IndexerTransport = {
      resolveHomeserver: (user) => network.resolveHomeserver(user),
      readEvents: async (request) => {
        const ofAlice = request.users.some(({ user }) => user === 'alice');
        if (ofAlice && request.paths.includes(POSTS)) await held;
        return network.readEvents(request);
      },
      getPublic: (request) => network.getPublic(request),
      indexFiles: network.indexFiles,
    };

    const sync = crawlerOf(transport).syncScope('alice');
    for (let turn = 0; turn < 50 && (await store.readScopeMembers('alice')).size === 0; turn += 1) await settle();

    // alice's activity read is still held: her graph alone made the members.
    expect(await store.readScopeMembers('alice')).toEqual(
      new Map([
        ['alice', 0],
        ['bob', 1],
      ]),
    );
    expect(await store.readCoverage({ author: 'alice', homeserver: 'hs1', group: ACTIVITY })).toEqual([]);
    // The next hop starts once the graph is in, without waiting for her activity.
    const readsBob = () => network.reads.some((read) => read.users.includes('bob'));
    for (let turn = 0; turn < 50 && !readsBob(); turn += 1) await settle();
    expect(readsBob()).toBe(true);
    release();
    await sync;
    expect(await served(store, 'alice', 'hs1', ACTIVITY)).toEqual(network.liveOf('alice', [POSTS]));
  });

  it('says when the seed did not resolve or its homeserver failed', async () => {
    const unresolved = harness();
    unresolved.network.addHomeserver('hs1');
    await unresolved.crawler.syncScope('alice');
    expect(unresolved.crawler.stats().seed).toEqual({ homeserver: null, failed: false });

    const down = harness();
    down.network.addHomeserver('hs1').addUser('alice', 'hs1');
    down.network.setDown('hs1', true);
    await down.crawler.syncScope('alice');
    expect(down.crawler.stats().seed).toEqual({ homeserver: 'hs1', failed: true });
  });
});

describe('syncScope paging', () => {
  it('syncs more than one batch of users and more than one page of events completely', async () => {
    const { network, store, crawler } = harness({ hops: 1, pageLimit: 7 });
    network.addHomeserver('hs1').addUser('seed', 'hs1');
    const users = Array.from({ length: 60 }, (_, i) => `u${i}`);
    for (const user of users) network.addUser(user, 'hs1');
    users.forEach((user, i) => {
      network.put('seed', `${FOLLOWS}${user}`);
      network.put(user, `${FOLLOWS}${users[(i + 1) % users.length]}`);
      network.putJson(user, postPath(2 * DAY_MS + i), { text: `first ${user}` });
      network.putJson(user, postPath(DAY_MS + i), { text: `second ${user}` });
      if (i % 2 === 0) network.del(user, postPath(2 * DAY_MS + i));
    });

    const { members } = await crawler.syncScope('seed');

    expect(members.size).toBe(61);
    for (const user of members.keys()) {
      expect(await served(store, user, 'hs1', GRAPH)).toEqual(network.liveOf(user, [FOLLOWS]));
      expect(await served(store, user, 'hs1', ACTIVITY)).toEqual(network.liveOf(user, [POSTS]));
    }
    expect(await servedData(store, 'u1', 'hs1', ACTIVITY)).toEqual(
      new Map([
        [postPath(2 * DAY_MS + 1), { text: 'first u1' }],
        [postPath(DAY_MS + 1), { text: 'second u1' }],
      ]),
    );
    expect(network.reads.every((read) => read.users.length <= 50 && read.events.length <= 7)).toBe(true);
  });

  it('does not replay the history of a quiet user in a busy batch', async () => {
    const { network, crawler } = harness({ pageLimit: 5 });
    network.addHomeserver('hs1');
    chain(network, ['alice', 'quiet']);
    network.putJson('quiet', postPath(DAY_MS), { text: 'once' });
    const busy = ['b1', 'b2', 'b3'];
    for (const user of busy) {
      network.addUser(user, 'hs1');
      network.put('alice', `${FOLLOWS}${user}`);
    }
    const burst = (round: number) => {
      for (let i = 0; i < 6; i += 1) {
        for (const user of busy) network.putJson(user, postPath(MINUTE_MS * (100 * round + i)), { text: user });
      }
    };
    burst(1);
    await crawler.syncScope('alice');
    burst(2);
    const mark = network.reads.length;

    await crawler.syncScope('alice');

    expect(forwardEvents(network, mark, 'quiet')).toBe(0);
    expect(forwardEvents(network, mark)).toBe(18);
  });

  it('picks up exactly the delta on the next sync, and an unfollow shrinks the scope', async () => {
    const { network, store, crawler } = harness();
    network.addHomeserver('hs1');
    chain(network, ['alice', 'bob', 'carol']);
    network.addUser('dave', 'hs1').addUser('erin', 'hs1');
    network.put('alice', `${FOLLOWS}dave`);
    network.putJson('alice', postPath(DAY_MS), { text: 'hello' });
    await crawler.syncScope('alice');
    network.del('alice', `${FOLLOWS}bob`);
    network.del('alice', postPath(DAY_MS));
    network.put('alice', `${FOLLOWS}erin`);
    const mark = network.reads.length;

    const { members } = await crawler.syncScope('alice');

    expect(forwardEvents(network, mark)).toBe(3);
    expect(members).toEqual(
      new Map([
        ['alice', 0],
        ['dave', 1],
        ['erin', 1],
      ]),
    );
    expect(await served(store, 'alice', 'hs1', GRAPH)).toEqual(network.liveOf('alice', [FOLLOWS]));
    expect(await served(store, 'alice', 'hs1', ACTIVITY)).toEqual(new Map());
  });
});

describe('syncScope window', () => {
  /** The users' activity coverage on hs1. */
  const coverageOf = (store: ReturnType<typeof harness>['store'], users: readonly string[]) =>
    Promise.all(users.map((user) => store.readCoverage({ author: user, homeserver: 'hs1', group: ACTIVITY })));

  /** Events the fake served to backwards reads from the read numbered `from` on. */
  const backwardEvents = (network: FakeNetwork, from: number) =>
    network.reads
      .slice(from)
      .filter((read) => read.reverse)
      .map((read) => read.events.length);

  it("indexes the windowed group down to the homeserver's window start and the graph in full", async () => {
    const { network, store, crawler } = harness();
    network.addHomeserver('hs1').addHomeserver('hs2');
    network.addUser('alice', 'hs1').addUser('bob', 'hs2');
    network.put('alice', `${FOLLOWS}bob`);
    network.putJson('alice', postPath(40 * DAY_MS), { text: 'old' });
    const start = network.putJson('alice', postPath(32 * DAY_MS), { text: 'old too' });
    network.putJson('alice', postPath(2 * DAY_MS), { text: 'recent' });
    const top = network.putJson('alice', postPath(DAY_MS), { text: 'newest' });
    network.putJson('bob', postPath(3 * DAY_MS), { text: 'young homeserver' });

    await crawler.syncScope('alice');

    expect(await served(store, 'alice', 'hs1', GRAPH)).toEqual(network.liveOf('alice', [FOLLOWS]));
    expect([...(await servedData(store, 'alice', 'hs1', ACTIVITY)).values()]).toEqual([
      { text: 'recent' },
      { text: 'newest' },
    ]);
    expect(await coverageOf(store, ['alice'])).toEqual([[{ tail: start, head: top }]]);
    // No write of hs2 is older than the window, so its clock never places the start: bob is read to his first event.
    expect(await served(store, 'bob', 'hs2', ACTIVITY)).toEqual(network.liveOf('bob', [POSTS]));
    expect((await store.readCoverage({ author: 'bob', homeserver: 'hs2', group: ACTIVITY }))[0].tail).toBe(CURSOR_ZERO);
    // Every dated write read is stored as the homeserver's clock.
    expect((await store.readHomeserverState('hs1')).clock.map(({ ms }) => ms)).toEqual(
      [40, 32, 2, 1].map((days) => NOW - days * DAY_MS),
    );
  });

  it('starts every window of a homeserver at one cursor, whoever wrote what around it', async () => {
    const { network, store, crawler } = harness();
    network.addHomeserver('hs1').addUser('alice', 'hs1').addUser('bob', 'hs1');
    network.put('alice', `${FOLLOWS}bob`);
    network.putJson('alice', postPath(200 * DAY_MS), { text: 'long ago' });
    network.putJson('bob', postPath(100 * DAY_MS), { text: 'outside the window' });
    const start = network.putJson('bob', postPath(31 * DAY_MS), { text: 'just before the window' });
    network.putJson('bob', postPath(10 * DAY_MS), { text: 'inside' });
    network.putJson('alice', postPath(DAY_MS), { text: 'back' });

    await crawler.syncScope('alice');
    // alice's own hop was read while the clock knew only her two posts, so the next sync reads her down to the start.
    expect((await coverageOf(store, ['alice']))[0][0].tail).toBeGreaterThan(start);
    await crawler.syncScope('alice');

    expect([...(await servedData(store, 'alice', 'hs1', ACTIVITY)).values()]).toEqual([{ text: 'back' }]);
    expect([...(await servedData(store, 'bob', 'hs1', ACTIVITY)).values()]).toEqual([{ text: 'inside' }]);
    for (const [range] of await coverageOf(store, ['alice', 'bob'])) expect(range.tail).toBe(start);
  });

  it('dates the clock by writes only, never by a later delete of an old post', async () => {
    const { network, store, crawler } = harness();
    network.addHomeserver('hs1').addUser('alice', 'hs1');
    const old = postPath(31 * DAY_MS);
    const start = network.putJson('alice', old, { text: 'old' });
    const recent = postPath(2 * DAY_MS);
    network.putJson('alice', recent, { text: 'recent' });
    network.del('alice', old);

    await crawler.syncScope('alice');

    expect((await coverageOf(store, ['alice']))[0][0].tail).toBe(start);
    expect(await servedData(store, 'alice', 'hs1', ACTIVITY)).toEqual(new Map([[recent, { text: 'recent' }]]));
  });

  it('reads every in-window post of other users when one old-dated write lands at a fresh cursor', async () => {
    const { network, store, crawler } = harness();
    network.addHomeserver('hs1');
    for (const user of ['alice', 'u1', 'u2']) network.addUser(user, 'hs1');
    network.put('alice', `${FOLLOWS}u1`);
    network.put('alice', `${FOLLOWS}u2`);
    for (let day = 20; day >= 2; day -= 1) network.putJson('u1', postPath(day * DAY_MS), { text: `u1 ${day}` });
    // u2 moves today: a copy of a post first written 31 days ago lands at the newest cursor.
    network.putJson('u2', postPath(31 * DAY_MS), { text: 'migrated' });

    await crawler.syncScope('alice');

    expect((await served(store, 'u1', 'hs1', ACTIVITY)).size).toBe(19);
    expect(await served(store, 'u2', 'hs1', ACTIVITY)).toEqual(network.liveOf('u2', [POSTS]));
  });

  /** A burst at the newest cursors: what it is, its writer, the age of its `i`-th write, how many writes. */
  const bursts: Array<[string, string, (i: number) => number, number]> = [
    ['a move of hundreds of old posts', 'mover', (i) => (400 - i) * DAY_MS, 300],
    ['an edit burst of old posts', 'u1', (i) => (90 - i) * DAY_MS, 40],
  ];

  it.each(bursts)(
    'reads the same window whatever %s written at the newest cursors',
    async (_, writer, ageOf, count) => {
      const { network, store, crawler } = harness();
      network.addHomeserver('hs1');
      for (const user of ['alice', 'u1', 'u2', 'mover']) network.addUser(user, 'hs1');
      for (const user of ['u1', 'u2', 'mover']) network.put('alice', `${FOLLOWS}${user}`);
      network.putJson('u1', postPath(40 * DAY_MS), { text: 'old' });
      const start = network.putJson('u2', postPath(35 * DAY_MS), { text: 'old' });
      for (let day = 20; day >= 1; day -= 1) {
        network.putJson('u1', postPath(day * DAY_MS), { text: `u1 ${day}` });
        network.putJson('u2', postPath(day * DAY_MS - MINUTE_MS), { text: `u2 ${day}` });
      }
      // Oldest first, as a move copies them, each dated by its post.
      for (let i = 0; i < count; i += 1) network.putJson(writer, postPath(ageOf(i)), { text: 'copy' });

      await crawler.syncScope('alice');

      for (const [range] of await coverageOf(store, ['u1', 'u2', 'mover'])) expect(range.tail).toBe(start);
      expect((await served(store, 'u2', 'hs1', ACTIVITY)).size).toBe(20);
      // Written now, the copies are inside the window, shown at their own old times.
      expect((await served(store, writer, 'hs1', ACTIVITY)).size).toBe(writer === 'u1' ? 20 + count : count);
    },
  );

  it('reads the same window whatever a writer whose clock runs two months late keeps posting', async () => {
    const { network, store, crawler } = harness();
    network.addHomeserver('hs1');
    for (const user of ['alice', 'u1', 'u2', 'late']) network.addUser(user, 'hs1');
    for (const user of ['u1', 'u2', 'late']) network.put('alice', `${FOLLOWS}${user}`);
    const start = network.putJson('u1', postPath(35 * DAY_MS), { text: 'old' });
    for (let day = 20; day >= 1; day -= 1) {
      network.putJson('u1', postPath(day * DAY_MS), { text: `u1 ${day}` });
      network.putJson('late', postPath((day + 60) * DAY_MS), { text: `late ${day}` });
      network.putJson('u2', postPath(day * DAY_MS - MINUTE_MS), { text: `u2 ${day}` });
    }

    await crawler.syncScope('alice');

    for (const [range] of await coverageOf(store, ['u1', 'u2', 'late'])) expect(range.tail).toBe(start);
    expect((await served(store, 'late', 'hs1', ACTIVITY)).size).toBe(20);
  });

  it('reads each user to their cap or stream start on a homeserver with no write older than the window', async () => {
    const { network, store, crawler } = harness({ windowMaxEntries: 5 });
    network.addHomeserver('hs1').addUser('busy', 'hs1').addUser('calm', 'hs1');
    network.put('busy', `${FOLLOWS}calm`);
    const busy: bigint[] = [];
    for (let day = 10; day >= 3; day -= 1)
      busy.push(network.putJson('busy', postPath(day * DAY_MS), { text: `${day}` }));
    for (let day = 9; day >= 7; day -= 1) network.putJson('calm', postPath(day * DAY_MS), { text: `${day}` });

    await crawler.syncScope('busy');
    const mark = network.reads.length;
    await crawler.syncScope('busy');

    // Five paths each at most: busy's range ends just above their sixth newest post.
    expect(await coverageOf(store, ['busy', 'calm'])).toEqual([
      [{ tail: busy[2], head: busy[7] }],
      [{ tail: CURSOR_ZERO, head: expect.anything() }],
    ]);
    expect(await served(store, 'calm', 'hs1', ACTIVITY)).toEqual(network.liveOf('calm', [POSTS]));
    // A range at its cap is not read below again: only the restore check reads backwards.
    expect(backwardEvents(network, mark)).toEqual([1]);
  });

  it('catches up forward once the window start moved on, dropping nothing older', async () => {
    const { network, store, crawler, clock } = harness();
    network.addHomeserver('hs1').addUser('alice', 'hs1');
    const start = network.putJson('alice', postPath(40 * DAY_MS), { text: 'old' });
    network.putJson('alice', postPath(20 * DAY_MS), { text: '20' });
    network.putJson('alice', postPath(10 * DAY_MS), { text: '10' });
    await crawler.syncScope('alice');

    clock.now += 15 * DAY_MS;
    const top = network.putJson('alice', postPath(-14 * DAY_MS), { text: 'new' });
    const mark = network.reads.length;
    await crawler.syncScope('alice');

    // The post of 20 days ago is now 35 days old and stays: no sync drops anything.
    expect(await coverageOf(store, ['alice'])).toEqual([[{ tail: start, head: top }]]);
    expect((await served(store, 'alice', 'hs1', ACTIVITY)).size).toBe(3);
    expect(backwardEvents(network, mark)).toEqual([1]);
  });

  it('reads newest first down to the new window start after two months closed, the old range left below a gap', async () => {
    const { network, store, crawler, clock } = harness();
    network.addHomeserver('hs1').addUser('alice', 'hs1').addUser('bob', 'hs1');
    network.put('alice', `${FOLLOWS}bob`);
    network.putJson('alice', postPath(40 * DAY_MS), { text: 'old' });
    network.putJson('alice', postPath(5 * DAY_MS), { text: 'before' });
    network.putJson('bob', postPath(4 * DAY_MS), { text: 'before' });
    await crawler.syncScope('alice');
    const [[before]] = await coverageOf(store, ['alice']);

    clock.now += 60 * DAY_MS;
    let start = CURSOR_ZERO;
    for (let day = 1; day <= 59; day += 1) {
      const cursor = network.putJson(day % 2 === 0 ? 'alice' : 'bob', postPath(-day * DAY_MS), { text: `${day}` });
      if (day === 30) start = cursor;
    }
    const mark = network.reads.length;
    await crawler.syncScope('alice');

    const [alice, bob] = await coverageOf(store, ['alice', 'bob']);
    expect(alice).toEqual([before, { tail: start, head: expect.anything() }]);
    expect(bob[bob.length - 1].tail).toBe(start);
    // Only the range above the gap is served: the posts of the last 30 days.
    expect((await served(store, 'alice', 'hs1', ACTIVITY)).size).toBe(14);
    expect(forwardEvents(network, mark, 'alice') + forwardEvents(network, mark, 'bob')).toBe(0);
  });

  it('continues a window a sync left halfway, and reads a finished one no further', async () => {
    const { network, store, crawlerOf } = harness({ pageLimit: 4, sliceLimit: 4 });
    network.addHomeserver('hs1').addUser('alice', 'hs1');
    const olds = [40, 39, 38].map((age) => network.putJson('alice', postPath(age * DAY_MS), { text: 'old' }));
    let top = CURSOR_ZERO;
    for (let day = 12; day >= 1; day -= 1) top = network.putJson('alice', postPath(day * DAY_MS), { text: `${day}` });
    let reads = 0;
    const failing: IndexerTransport = {
      resolveHomeserver: (user) => network.resolveHomeserver(user),
      readEvents: async (request) => {
        reads += 1;
        if (request.reverse && reads > 3) throw new HomeserverUnreachableError('hs1');
        return network.readEvents(request);
      },
      getPublic: (request) => network.getPublic(request),
      indexFiles: network.indexFiles,
    };
    const scope = { author: 'alice', homeserver: 'hs1', group: ACTIVITY };

    expect((await crawlerOf(failing).syncScope('alice')).failedHomeservers).toEqual(['hs1']);
    expect((await served(store, 'alice', 'hs1', ACTIVITY)).size).toBeLessThan(12);

    const crawler = crawlerOf(network);
    await store.patchHomeserverState('hs1', { failure: null });
    await crawler.syncScope('alice');
    expect((await served(store, 'alice', 'hs1', ACTIVITY)).size).toBe(12);
    expect(await store.readCoverage(scope)).toEqual([{ tail: olds[2], head: top }]);

    const mark = network.reads.length;
    await crawler.syncScope('alice');
    // Only the restore check reads backwards, one event.
    expect(backwardEvents(network, mark)).toEqual([1]);
  });
});

describe('syncScope coverage', () => {
  it('keeps one range per scope over syncs where only one user of the batch writes', async () => {
    const { network, store, crawler } = harness();
    network.addHomeserver('hs1');
    chain(network, ['alice', 'bob']);
    network.addUser('carol', 'hs1');
    network.put('alice', `${FOLLOWS}carol`);
    await crawler.syncScope('alice');
    let lastPost = CURSOR_ZERO;
    let lastFollow = CURSOR_ZERO;
    for (let round = 1; round <= 5; round += 1) {
      lastPost = network.putJson('bob', postPath(round * MINUTE_MS), { text: `round ${round}` });
      // Toggling a link already in scope moves the graph group without growing the scope.
      lastFollow = round % 2 === 1 ? network.put('bob', `${FOLLOWS}alice`) : network.del('bob', `${FOLLOWS}alice`);
      await crawler.syncScope('alice');
    }
    await crawler.syncScope('alice');

    // carol never wrote: each sync only moved her ranges up behind bob's events, and they stay joined.
    const carolGraph = { author: 'carol', homeserver: 'hs1', group: GRAPH };
    expect(await store.readCoverage(carolGraph)).toEqual([{ tail: CURSOR_ZERO, head: lastFollow }]);
    expect((await store.readScope(carolGraph)).entries).toEqual(new Map());
    expect(await store.readCoverage({ author: 'carol', homeserver: 'hs1', group: ACTIVITY })).toEqual([
      { tail: CURSOR_ZERO, head: lastPost },
    ]);
    const scopes = await store.listScopes();
    expect(scopes).toHaveLength(5);
    for (const scope of scopes) expect(await store.readCoverage(scope)).toHaveLength(1);
    expect(await served(store, 'bob', 'hs1', GRAPH)).toEqual(network.liveOf('bob', [FOLLOWS]));
    expect(await served(store, 'bob', 'hs1', ACTIVITY)).toEqual(network.liveOf('bob', [POSTS]));
  });

  it('catches up forward from a stored head, however old, in one range', async () => {
    const { network, store, crawler } = harness();
    network.addHomeserver('hs1').addUser('alice', 'hs1');
    const ancient = postPath(40 * DAY_MS);
    const ancientCursor = network.putJson('alice', ancient, { text: 'ancient' });
    network.putJson('alice', postPath(35 * DAY_MS), { text: 'old' });
    const recent = network.putJson('alice', postPath(DAY_MS), { text: 'recent' });
    const scope = { author: 'alice', homeserver: 'hs1', group: ACTIVITY };
    await store.applyRuns([
      {
        ...scope,
        tail: CURSOR_ZERO,
        head: ancientCursor,
        entries: [{ kind: 'record', path: ancient, cursor: ancientCursor }],
      },
    ]);

    await crawler.syncScope('alice');
    await crawler.syncScope('alice');

    // The range reaches the stream start, so it is complete whatever the cutoff, and the forward read joins it.
    expect(await store.readCoverage(scope)).toEqual([{ tail: CURSOR_ZERO, head: recent }]);
    expect(await served(store, 'alice', 'hs1', ACTIVITY)).toEqual(network.liveOf('alice', [POSTS]));
  });
});
