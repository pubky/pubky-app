// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ACTIVITY, DAY_MS, FOLLOWS, GRAPH, harness, postPath, POSTS, served, servedData } from './crawler.fixtures';
import type { CrawlerOptions, StoreChange } from './crawler.types';
import { CURSOR_ZERO } from './cursor';
import type { FakeNetwork } from './fakeNetwork';
import { InvalidIndexInputError } from './indexer.errors';
import { scopeId } from './store.helpers';
import type { ScopeKey } from './store.types';

const LEAF = 'post:old';

/** Events the fake served to forward reads from the read numbered `from` on. */
const forwardEvents = (network: FakeNetwork, from: number) =>
  network.reads
    .slice(from)
    .filter((read) => !read.reverse)
    .flatMap((read) => read.events).length;

/** The ids of every scope the changes name, sorted. */
const changedIds = (changes: readonly StoreChange[]) =>
  [...new Set(changes.flatMap((change) => change.scopes.map(scopeId)))].sort();

const idsOf = (scopes: readonly ScopeKey[]) => scopes.map(scopeId).sort();

/** alice follows bob; carol, outside the scope, follows dave. Everyone on hs1 posted once recently. */
function twoCircles(options: Partial<CrawlerOptions> = {}) {
  const setup = harness(options);
  const { network } = setup;
  network.addHomeserver('hs1');
  for (const user of ['alice', 'bob', 'carol', 'dave']) {
    network.addUser(user, 'hs1');
    network.putJson(user, postPath(DAY_MS), { text: user });
  }
  network.put('alice', `${FOLLOWS}bob`);
  network.put('carol', `${FOLLOWS}dave`);
  return setup;
}

describe('syncUsers', () => {
  it('syncs users outside the scope without changing the members or following their links', async () => {
    const { network, store, crawler } = twoCircles();
    await crawler.syncScope('alice');
    const members = await store.readScopeMembers('alice');

    const result = await crawler.syncUsers(['carol']);

    expect(result).toEqual({ failedHomeservers: [] });
    expect(await served(store, 'carol', 'hs1', GRAPH)).toEqual(network.liveOf('carol', [FOLLOWS]));
    expect(await servedData(store, 'carol', 'hs1', ACTIVITY)).toEqual(new Map([[postPath(DAY_MS), { text: 'carol' }]]));
    expect((await store.listScopes()).some((scope) => scope.author === 'dave')).toBe(false);
    expect(await store.readScopeMembers('alice')).toEqual(members);
  });

  it('reads only the delta of the given users', async () => {
    const { network, store, crawler } = twoCircles();
    await crawler.syncScope('alice');
    network.putJson('alice', postPath(DAY_MS / 2), { text: 'again' });
    network.putJson('bob', postPath(DAY_MS / 2), { text: 'not asked' });
    const mark = network.reads.length;

    await crawler.syncUsers(['alice']);

    expect(forwardEvents(network, mark)).toBe(1);
    expect(network.reads.slice(mark).every((read) => read.users.every((user) => user === 'alice'))).toBe(true);
    expect(await served(store, 'alice', 'hs1', ACTIVITY)).toEqual(network.liveOf('alice', [POSTS]));
  });

  it('reads a user with no history newest page first, keeping its tombstones, then forward from its head', async () => {
    const { network, store, crawler } = twoCircles({ backfillPageLimit: 4 });
    network.putJson('carol', postPath(60 * DAY_MS), { text: 'oldest' });
    const old = postPath(50 * DAY_MS);
    const oldCursor = network.putJson('carol', old, { text: 'old' });
    const deleted = postPath(3 * DAY_MS);
    network.putJson('carol', deleted, { text: 'deleted' });
    const kept = postPath(2 * DAY_MS);
    network.putJson('carol', kept, { text: 'kept' });
    const head = network.del('carol', deleted);
    const scope = { author: 'carol', homeserver: 'hs1', group: ACTIVITY };

    await crawler.syncUsers(['carol']);

    // One page of four events, read backwards from the newest: no cutoff looked for, no range read twice.
    const carolReads = network.reads.filter((read) => read.users.includes('carol'));
    expect(carolReads.filter((read) => read.reverse).map((read) => read.events.length)).toEqual([4]);
    expect(await store.readCoverage(scope)).toEqual([{ tail: oldCursor - BigInt(1), head }]);
    expect((await store.readScope(scope)).entries.get(deleted)?.kind).toBe('tombstone');
    expect(await servedData(store, 'carol', 'hs1', ACTIVITY)).toEqual(
      new Map([
        [old, { text: 'old' }],
        [kept, { text: 'kept' }],
      ]),
    );

    // Within a page of the newest event, the next sync catches up forward from the head: still one range.
    const fresh = network.putJson('carol', postPath(DAY_MS / 2), { text: 'fresh' });
    const mark = network.reads.length;
    await crawler.syncUsers(['carol']);
    expect(await store.readCoverage(scope)).toEqual([{ tail: oldCursor - BigInt(1), head: fresh }]);
    // Only the restore check reads backwards, one event: no cutoff looked for.
    expect(network.reads.slice(mark).filter((read) => read.reverse && read.events.length > 1)).toEqual([]);

    // More than a page behind: the newest page, above a gap that backfill closes, after which one range holds all.
    const burst = Array.from({ length: 5 }, (_, i) => network.putJson('carol', postPath(DAY_MS / 4 - i), { i }));
    await crawler.syncUsers(['carol']);
    expect(await store.readCoverage(scope)).toEqual([
      { tail: oldCursor - BigInt(1), head: fresh },
      { tail: burst[0], head: burst[4] },
    ]);
    expect((await served(store, 'carol', 'hs1', ACTIVITY)).has(kept)).toBe(false);

    await crawler.backfill('carol', ACTIVITY, 5);
    expect(await store.readCoverage(scope)).toEqual([{ tail: CURSOR_ZERO, head: burst[4] }]);
    expect(await served(store, 'carol', 'hs1', ACTIVITY)).toEqual(network.liveOf('carol', [POSTS]));
  });

  it('reports a dead homeserver instead of throwing', async () => {
    const { network, crawler } = twoCircles();
    network.setDown('hs1', true);

    expect(await crawler.syncUsers(['carol'])).toEqual({ failedHomeservers: ['hs1'] });
  });
});

describe('syncLeaf', () => {
  it('loads a post older than the window into its own scope, then only its delta', async () => {
    const { network, store, crawler } = twoCircles();
    const old = postPath(40 * DAY_MS);
    // Three old posts in a row end alice's window: one alone could be a copy of an old post.
    network.putJson('alice', postPath(42 * DAY_MS), { text: 'older' });
    network.putJson('alice', postPath(41 * DAY_MS), { text: 'older' });
    network.putJson('alice', old, { text: 'old' });
    network.putJson('alice', postPath(DAY_MS / 2), { text: 'recent' });
    await crawler.syncScope('alice');
    expect((await served(store, 'alice', 'hs1', ACTIVITY)).has(old)).toBe(false);
    const changes: StoreChange[] = [];
    crawler.onCommit((change) => changes.push(change));

    await crawler.syncLeaf({ author: 'alice', group: LEAF, paths: [old] });

    const leaf = { author: 'alice', homeserver: 'hs1', group: LEAF };
    expect(await servedData(store, 'alice', 'hs1', LEAF)).toEqual(new Map([[old, { text: 'old' }]]));
    expect(changes).toEqual([{ scopes: [leaf], seeds: [] }]);

    network.del('alice', old);
    const mark = network.reads.length;
    await crawler.syncLeaf({ author: 'alice', group: LEAF, paths: [old] });

    expect(forwardEvents(network, mark)).toBe(1);
    expect(await served(store, 'alice', 'hs1', LEAF)).toEqual(new Map());
    expect(await store.readCoverage(leaf)).toHaveLength(1);
  });

  it('refuses a domain group id and paths outside the domain', async () => {
    const { crawler } = twoCircles();

    await expect(crawler.syncLeaf({ author: 'alice', group: GRAPH, paths: [POSTS] })).rejects.toThrow(
      InvalidIndexInputError,
    );
    await expect(crawler.syncLeaf({ author: 'alice', group: LEAF, paths: ['/elsewhere/'] })).rejects.toThrow(
      InvalidIndexInputError,
    );
    await expect(crawler.syncLeaf({ author: 'alice', group: LEAF, paths: [] })).rejects.toThrow(InvalidIndexInputError);
  });
});

describe('syncLeaves', () => {
  it('resolves an author once, checks the homeserver once and refuses an invalid leaf alone', async () => {
    const { network, store, crawler } = twoCircles();
    const first = postPath(40 * DAY_MS);
    const second = postPath(41 * DAY_MS);
    network.putJson('carol', first, { text: 'first' });
    network.putJson('carol', second, { text: 'second' });
    const leaves = [
      { author: 'carol', group: 'post:first', paths: [first] },
      { author: 'carol', group: 'post:second', paths: [second] },
      { author: 'carol', group: GRAPH, paths: [POSTS] },
    ];

    const outcome = await crawler.syncLeaves(leaves);

    expect(crawler.stats().lookups).toBe(1);
    expect(outcome.failedHomeservers).toEqual([]);
    expect(outcome.refused.map((error) => error instanceof InvalidIndexInputError)).toEqual([false, false, true]);
    expect(await servedData(store, 'carol', 'hs1', 'post:first')).toEqual(new Map([[first, { text: 'first' }]]));
    expect(await servedData(store, 'carol', 'hs1', 'post:second')).toEqual(new Map([[second, { text: 'second' }]]));

    const mark = network.reads.length;
    await crawler.syncLeaves(leaves.slice(0, 2));

    // The restore check is the one backward read, made once for the homeserver of both leaves.
    expect(network.reads.slice(mark).filter((read) => read.reverse)).toHaveLength(1);
  });
});

describe('onCommit', () => {
  it('reports the scopes and members a sync changed, and nothing on a sync that found nothing', async () => {
    const { network, crawler } = twoCircles();
    const changes: StoreChange[] = [];
    const unsubscribe = crawler.onCommit((change) => changes.push(change));

    await crawler.syncScope('alice');

    const alice = { author: 'alice', homeserver: 'hs1' };
    const bob = { author: 'bob', homeserver: 'hs1' };
    expect(changedIds(changes)).toEqual(
      idsOf([
        { ...alice, group: GRAPH },
        { ...alice, group: ACTIVITY },
        { ...bob, group: ACTIVITY },
      ]),
    );
    // One member set, once the seed's graph is in: the seed with bob, whom it names.
    expect(changes.flatMap((change) => change.seeds)).toEqual(['alice']);

    changes.length = 0;
    await crawler.syncScope('alice');
    expect(changes).toEqual([]);

    network.putJson('bob', postPath(DAY_MS / 2), { text: 'more' });
    network.del('alice', `${FOLLOWS}bob`);
    await crawler.syncScope('alice');
    expect(changedIds(changes)).toEqual(idsOf([{ ...alice, group: GRAPH }]));
    expect(changes.flatMap((change) => change.seeds)).toEqual(['alice']);

    unsubscribe();
    changes.length = 0;
    network.putJson('alice', postPath(DAY_MS / 2), { text: 'unheard' });
    await crawler.syncScope('alice');
    expect(changes).toEqual([]);
  });

  it('reports the members once for the seed and once per hop that adds any, in a first sync of two hops', async () => {
    const { network, store, crawler } = harness();
    network.addHomeserver('hs1');
    for (const user of ['alice', 'bob', 'carol']) network.addUser(user, 'hs1');
    network.put('alice', `${FOLLOWS}bob`);
    network.put('bob', `${FOLLOWS}carol`);
    const changes: StoreChange[] = [];
    crawler.onCommit((change) => changes.push(change));

    await crawler.syncScope('alice');

    // The seed with bob once its graph is in, then with carol once bob's is; the end of the sync stores nothing new.
    expect(changes.filter((change) => change.seeds.length > 0)).toHaveLength(2);
    expect(await store.readScopeMembers('alice')).toEqual(
      new Map([
        ['alice', 0],
        ['bob', 1],
        ['carol', 2],
      ]),
    );
  });

  it('reports every scope of a restored homeserver and a backfilled scope', async () => {
    const { network, store, crawler } = twoCircles();
    for (const age of [42, 41, 40]) network.putJson('alice', postPath(age * DAY_MS), { text: 'old' });
    network.putJson('alice', postPath(DAY_MS / 2), { text: 'recent' });
    await crawler.syncScope('alice');
    const before = idsOf(await store.listScopes());
    const changes: StoreChange[] = [];
    crawler.onCommit((change) => changes.push(change));

    await crawler.backfill('alice', ACTIVITY, 1);
    expect(changes).toEqual([{ scopes: [{ author: 'alice', homeserver: 'hs1', group: ACTIVITY }], seeds: [] }]);

    changes.length = 0;
    // The delete makes the rebuilt log shorter, so the newest cursor goes backwards.
    network.del('dave', postPath(DAY_MS));
    network.restore('hs1');
    await crawler.syncScope('alice');
    expect(idsOf(changes[0].scopes)).toEqual(before);
  });
});
