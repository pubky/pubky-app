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
import { InvalidIndexInputError } from './indexer.errors';
import { createMemoryStore } from './memoryStore';

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
  it('indexes the windowed group from the window start and the graph in full', async () => {
    const { network, store, crawler } = harness();
    network.addHomeserver('hs1').addHomeserver('hs2');
    network.addUser('alice', 'hs1').addUser('bob', 'hs2');
    network.put('alice', `${FOLLOWS}bob`);
    network.putJson('alice', postPath(40 * DAY_MS), { text: 'old' });
    const windowStart = network.putJson('alice', postPath(35 * DAY_MS), { text: 'old too' });
    network.putJson('alice', postPath(2 * DAY_MS), { text: 'recent' });
    network.putJson('alice', postPath(DAY_MS), { text: 'newest' });
    network.putJson('bob', postPath(3 * DAY_MS), { text: 'young homeserver' });

    await crawler.syncScope('alice');

    expect(await served(store, 'alice', 'hs1', GRAPH)).toEqual(network.liveOf('alice', [FOLLOWS]));
    expect([...(await servedData(store, 'alice', 'hs1', ACTIVITY)).values()]).toEqual([
      { text: 'recent' },
      { text: 'newest' },
    ]);
    expect(await served(store, 'alice', 'hs1', ACTIVITY)).toEqual(network.liveOf('alice', [POSTS], windowStart));
    expect((await store.readHomeserverState('hs1')).windowStart).toEqual({ cursor: windowStart, foundAt: NOW });
    expect((await store.readHomeserverState('hs2')).windowStart?.cursor).toBe(CURSOR_ZERO);
    expect(await served(store, 'bob', 'hs2', ACTIVITY)).toEqual(network.liveOf('bob', [POSTS]));
  });
});

describe('syncScope compaction', () => {
  it('keeps one run per scope over syncs where only one user of the batch writes', async () => {
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

    // carol never wrote: each sync only moved her ranges up behind bob's events, one run more without compaction.
    expect(await store.readRuns({ author: 'carol', homeserver: 'hs1', group: GRAPH })).toEqual([
      { author: 'carol', homeserver: 'hs1', group: GRAPH, tail: CURSOR_ZERO, head: lastFollow, entries: [] },
    ]);
    expect(await store.readRuns({ author: 'carol', homeserver: 'hs1', group: ACTIVITY })).toEqual([
      { author: 'carol', homeserver: 'hs1', group: ACTIVITY, tail: CURSOR_ZERO, head: lastPost, entries: [] },
    ]);
    const scopes = await store.listScopes();
    expect(scopes).toHaveLength(5);
    for (const scope of scopes) expect(await store.readRuns(scope)).toHaveLength(1);
    expect(await served(store, 'bob', 'hs1', GRAPH)).toEqual(network.liveOf('bob', [FOLLOWS]));
    expect(await served(store, 'bob', 'hs1', ACTIVITY)).toEqual(network.liveOf('bob', [POSTS]));
  });

  it('keeps a stored range below the window start apart, behind the gap', async () => {
    const { network, store, crawler } = harness();
    network.addHomeserver('hs1').addUser('alice', 'hs1');
    const ancient = postPath(40 * DAY_MS);
    const ancientCursor = network.putJson('alice', ancient, { text: 'ancient' });
    const windowStart = network.putJson('alice', postPath(35 * DAY_MS), { text: 'old' });
    const recent = network.putJson('alice', postPath(DAY_MS), { text: 'recent' });
    const scope = { author: 'alice', homeserver: 'hs1', group: ACTIVITY };
    await store.appendRuns([
      {
        ...scope,
        tail: CURSOR_ZERO,
        head: ancientCursor,
        entries: [{ kind: 'record', path: ancient, cursor: ancientCursor }],
      },
    ]);

    await crawler.syncScope('alice');
    await crawler.syncScope('alice');

    // A delete inside (ancientCursor, windowStart] would be missed, so the two ranges must not join.
    expect((await store.readRuns(scope)).map(({ tail, head }) => [tail, head])).toEqual([
      [CURSOR_ZERO, ancientCursor],
      [windowStart, recent],
    ]);
    expect(await served(store, 'alice', 'hs1', ACTIVITY)).toEqual(network.liveOf('alice', [POSTS], windowStart));
  });
});
