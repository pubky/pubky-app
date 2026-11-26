// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createCrawler } from './crawler';
import {
  ACTIVITY,
  DAY_MS,
  FOLLOWS,
  GRAPH,
  harness,
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
      listIndexFiles: () => network.listIndexFiles(),
      readIndexFile: (name) => network.readIndexFile(name),
      writeIndexFile: (name, bytes) => network.writeIndexFile(name, bytes),
      deleteIndexFile: (name) => network.deleteIndexFile(name),
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
      listIndexFiles: () => network.listIndexFiles(),
      readIndexFile: (name) => network.readIndexFile(name),
      writeIndexFile: (name, bytes) => network.writeIndexFile(name, bytes),
      deleteIndexFile: (name) => network.deleteIndexFile(name),
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
      listIndexFiles: () => network.listIndexFiles(),
      readIndexFile: (name) => network.readIndexFile(name),
      writeIndexFile: (name, bytes) => network.writeIndexFile(name, bytes),
      deleteIndexFile: (name) => network.deleteIndexFile(name),
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
  it("indexes the windowed group down to where each author's window ends and the graph in full", async () => {
    const { network, store, crawler } = harness();
    network.addHomeserver('hs1').addHomeserver('hs2');
    network.addUser('alice', 'hs1').addUser('bob', 'hs2');
    network.put('alice', `${FOLLOWS}bob`);
    network.putJson('alice', postPath(40 * DAY_MS), { text: 'old' });
    const end = network.putJson('alice', postPath(32 * DAY_MS), { text: 'old too' });
    network.putJson('alice', postPath(2 * DAY_MS), { text: 'recent' });
    network.putJson('alice', postPath(DAY_MS), { text: 'newest' });
    network.putJson('bob', postPath(3 * DAY_MS), { text: 'young homeserver' });

    await crawler.syncScope('alice');

    expect(await served(store, 'alice', 'hs1', GRAPH)).toEqual(network.liveOf('alice', [FOLLOWS]));
    expect([...(await servedData(store, 'alice', 'hs1', ACTIVITY)).values()]).toEqual([
      { text: 'recent' },
      { text: 'newest' },
    ]);
    expect(await served(store, 'alice', 'hs1', ACTIVITY)).toEqual(network.liveOf('alice', [POSTS], end));
    // Older writes alone, then the stream start: the window ends at the first of them.
    expect(await store.readWindowEnd({ author: 'alice', homeserver: 'hs1', group: ACTIVITY })).toBe(end);
    expect(await served(store, 'bob', 'hs2', ACTIVITY)).toEqual(network.liveOf('bob', [POSTS]));
    expect(await store.readWindowEnd({ author: 'bob', homeserver: 'hs2', group: ACTIVITY })).toBe(CURSOR_ZERO);
  });

  it("ends each user's window at their own writes, whatever another user's quiet spell", async () => {
    const { network, store, crawler } = harness();
    network.addHomeserver('hs1').addUser('alice', 'hs1').addUser('bob', 'hs1');
    network.put('alice', `${FOLLOWS}bob`);
    network.putJson('alice', postPath(200 * DAY_MS), { text: 'long ago' });
    network.putJson('bob', postPath(100 * DAY_MS), { text: 'outside the window' });
    const bobEnd = network.putJson('bob', postPath(31 * DAY_MS), { text: 'just before the window' });
    network.putJson('bob', postPath(10 * DAY_MS), { text: 'inside' });
    network.putJson('alice', postPath(DAY_MS), { text: 'back' });

    await crawler.syncScope('alice');

    expect([...(await servedData(store, 'alice', 'hs1', ACTIVITY)).values()]).toEqual([{ text: 'back' }]);
    expect([...(await servedData(store, 'bob', 'hs1', ACTIVITY)).values()]).toEqual([{ text: 'inside' }]);
    expect(await store.readWindowEnd({ author: 'bob', homeserver: 'hs1', group: ACTIVITY })).toBe(bobEnd);
  });

  it('ends a window at writes only, never at a later delete of an old post', async () => {
    const { network, store, crawler } = harness();
    network.addHomeserver('hs1').addUser('alice', 'hs1');
    const old = postPath(31 * DAY_MS);
    const end = network.putJson('alice', old, { text: 'old' });
    const recent = postPath(2 * DAY_MS);
    network.putJson('alice', recent, { text: 'recent' });
    network.del('alice', old);

    await crawler.syncScope('alice');

    expect(await store.readWindowEnd({ author: 'alice', homeserver: 'hs1', group: ACTIVITY })).toBe(end);
    expect(await servedData(store, 'alice', 'hs1', ACTIVITY)).toEqual(new Map([[recent, { text: 'recent' }]]));
  });

  it("reads every post of a user's window however old the paths another user writes above it", async () => {
    const { network, store, crawler } = harness();
    network.addHomeserver('hs1');
    for (const user of ['alice', 'u1', 'u2']) network.addUser(user, 'hs1');
    network.put('alice', `${FOLLOWS}u1`);
    network.put('alice', `${FOLLOWS}u2`);
    for (let day = 20; day >= 2; day -= 1) network.putJson('u1', postPath(day * DAY_MS), { text: `u1 ${day}` });
    // u2 moves today: copies of posts first written long ago land at the newest cursors, oldest first, the copies of
    // the posts still inside the window last.
    for (let day = 90; day >= 25; day -= 1) network.putJson('u2', postPath(day * DAY_MS), { text: `u2 ${day}` });

    await crawler.syncScope('alice');
    await crawler.syncScope('alice');

    expect(await served(store, 'u1', 'hs1', ACTIVITY)).toEqual(network.liveOf('u1', [POSTS]));
    const u2 = [...(await servedData(store, 'u2', 'hs1', ACTIVITY)).values()].map((post) => post?.text);
    expect(u2.sort()).toEqual(['u2 25', 'u2 26', 'u2 27', 'u2 28', 'u2 29', 'u2 30']);
  });

  it("reads past a user's own old-dated writes until enough of them come in a row", async () => {
    const { network, store, crawler } = harness();
    network.addHomeserver('hs1').addUser('alice', 'hs1');
    for (const age of [60, 59, 58]) network.putJson('alice', postPath(age * DAY_MS), { text: `old ${age}` });
    for (let day = 20; day >= 3; day -= 1) network.putJson('alice', postPath(day * DAY_MS), { text: `${day}` });
    // An edit of an old post that dates by the post, then another one: two in a row end nothing.
    network.putJson('alice', postPath(45 * DAY_MS), { text: 'edited' });
    network.putJson('alice', postPath(2 * DAY_MS), { text: '2' });
    network.putJson('alice', postPath(50 * DAY_MS), { text: 'edited' });
    network.putJson('alice', postPath(51 * DAY_MS), { text: 'edited' });

    await crawler.syncScope('alice');

    const texts = [...(await servedData(store, 'alice', 'hs1', ACTIVITY)).values()].map((post) => post?.text);
    expect(texts.filter((text) => text !== 'edited')).toHaveLength(19);
    expect(texts.filter((text) => text?.startsWith('old'))).toEqual([]);
  });

  it('continues a window a sync left halfway, and reads a finished one no further', async () => {
    const { network, store, crawlerOf } = harness({ pageLimit: 4, backfillPageLimit: 4 });
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
      listIndexFiles: () => network.listIndexFiles(),
      readIndexFile: (name) => network.readIndexFile(name),
      writeIndexFile: (name, bytes) => network.writeIndexFile(name, bytes),
      deleteIndexFile: (name) => network.deleteIndexFile(name),
    };
    const scope = { author: 'alice', homeserver: 'hs1', group: ACTIVITY };

    expect((await crawlerOf(failing).syncScope('alice')).failedHomeservers).toEqual(['hs1']);
    expect(await store.readWindowEnd(scope)).toBeNull();
    expect((await served(store, 'alice', 'hs1', ACTIVITY)).size).toBeLessThan(12);

    const crawler = crawlerOf(network);
    await store.patchHomeserverState('hs1', { failure: null });
    await crawler.syncScope('alice');
    expect((await served(store, 'alice', 'hs1', ACTIVITY)).size).toBe(12);
    expect(await store.readWindowEnd(scope)).toBe(olds[2]);
    expect(await store.readCoverage(scope)).toEqual([{ tail: olds[2], head: top }]);

    const mark = network.reads.length;
    await crawler.syncScope('alice');
    // Only the restore check reads backwards, one event.
    const backwards = network.reads.slice(mark).filter(({ reverse }) => reverse);
    expect(backwards.map(({ events }) => events.length)).toEqual([1]);
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

    // The range reaches the stream start, so it is complete without a window end, and the forward read joins it.
    expect(await store.readCoverage(scope)).toEqual([{ tail: CURSOR_ZERO, head: recent }]);
    expect(await served(store, 'alice', 'hs1', ACTIVITY)).toEqual(network.liveOf('alice', [POSTS]));
  });
});
