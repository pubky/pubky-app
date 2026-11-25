// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { InvalidIndexInputError } from './indexer.errors';
import type { Run, RunMeta } from './indexer.types';
import { createMemoryStore } from './memoryStore';
import { EMPTY_HOMESERVER_STATE } from './store.types';

const META: RunMeta = { author: 'alice', homeserver: 'hs1', group: 'posts' };
const c = (n: number) => BigInt(n);
const runOf = (tail: number, head: number, meta: RunMeta = META): Run<{ n: number }> => ({
  ...meta,
  tail: c(tail),
  head: c(head),
  entries: [{ kind: 'record', path: 'a', cursor: c(head), data: { n: head } }],
});

describe('createMemoryStore', () => {
  it('appends runs per scope and lists the scopes', async () => {
    const store = createMemoryStore<{ n: number }>();
    const other: RunMeta = { ...META, group: 'graph' };

    await store.appendRuns([runOf(0, 2), runOf(2, 4), runOf(0, 1, other)]);

    expect(await store.readRuns(META)).toEqual([runOf(0, 2), runOf(2, 4)]);
    expect(await store.listScopes()).toEqual([META, other]);
  });

  it('replaces the runs of a scope and removes it when the replacement is empty', async () => {
    const store = createMemoryStore<{ n: number }>();
    await store.appendRuns([runOf(0, 2), runOf(2, 4)]);

    await store.replaceRuns(META, [runOf(0, 4)]);
    expect(await store.readRuns(META)).toEqual([runOf(0, 4)]);

    await store.replaceRuns(META, []);
    expect(await store.listScopes()).toEqual([]);
  });

  it('deletes every run of a homeserver only', async () => {
    const store = createMemoryStore<{ n: number }>();
    const elsewhere: RunMeta = { ...META, homeserver: 'hs2' };
    await store.appendRuns([runOf(0, 2), runOf(0, 2, { ...META, author: 'bob' }), runOf(0, 3, elsewhere)]);

    await store.deleteHomeserverRuns('hs1');

    expect(await store.listScopes()).toEqual([elsewhere]);
  });

  it('copies on the way in and out', async () => {
    const store = createMemoryStore<{ n: number }>();
    const run = runOf(0, 2);
    await store.appendRuns([run]);

    run.entries.length = 0;
    const read = await store.readRuns(META);
    read[0].entries.length = 0;

    expect(await store.readRuns(META)).toEqual([runOf(0, 2)]);
  });

  it('rejects an invalid run or a run of another scope, changing nothing', async () => {
    const store = createMemoryStore<{ n: number }>();

    await expect(store.commit({ appendRuns: [runOf(0, 2), runOf(3, 3)] })).rejects.toThrow(InvalidIndexInputError);
    await expect(store.replaceRuns(META, [runOf(0, 2, { ...META, author: 'bob' })])).rejects.toThrow(
      InvalidIndexInputError,
    );
    expect(await store.listScopes()).toEqual([]);
  });

  it('keeps homeserver state fields a patch leaves out', async () => {
    const store = createMemoryStore<{ n: number }>();
    expect(await store.readHomeserverState('hs1')).toEqual(EMPTY_HOMESERVER_STATE);

    await store.patchHomeserverState('hs1', { highWater: { cursor: c(9), author: 'alice' } });
    await store.patchHomeserverState('hs1', { failure: { failures: 1, retryAt: 60 } });
    await store.patchHomeserverState('hs1', { failure: null });

    expect(await store.readHomeserverState('hs1')).toEqual({
      highWater: { cursor: c(9), author: 'alice' },
      windowStart: null,
      failure: null,
    });
  });

  it('stores user homeservers and scope members', async () => {
    const store = createMemoryStore<{ n: number }>();
    const members = new Map([
      ['alice', 0],
      ['bob', 1],
    ]);

    await store.commit({
      userHomeservers: [{ user: 'bob', value: { homeserver: null, resolvedAt: 5 } }],
      scopeMembers: [{ seed: 'alice', members }],
    });
    members.set('carol', 2);

    expect(await store.readUserHomeserver('bob')).toEqual({ homeserver: null, resolvedAt: 5 });
    expect(await store.readUserHomeserver('carol')).toBeNull();
    expect(await store.readScopeMembers('alice')).toEqual(
      new Map([
        ['alice', 0],
        ['bob', 1],
      ]),
    );
    expect(await store.readScopeMembers('bob')).toEqual(new Map());
  });

  it('applies a commit in order: deletions, replacements, then appends', async () => {
    const store = createMemoryStore<{ n: number }>();
    await store.appendRuns([runOf(0, 2)]);

    await store.commit({
      deleteHomeservers: ['hs1'],
      replaceRuns: [{ scope: META, runs: [runOf(0, 3)] }],
      appendRuns: [runOf(3, 5)],
    });

    expect(await store.readRuns(META)).toEqual([runOf(0, 3), runOf(3, 5)]);
  });
});
