import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TagCollectionModelSchema } from '@/models/shared/tag/tag.schema';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { LocalTagCacheService } from './tag-cache';

const { tagTable, countsTable, findByIds, transaction } = vi.hoisted(() => ({
  tagTable: { name: 'tags', get: vi.fn(), put: vi.fn() },
  countsTable: { name: 'counts', get: vi.fn(), put: vi.fn() },
  findByIds: vi.fn(),
  transaction: vi.fn(
    async (_mode: string, _table: unknown, tableOrOperation: unknown, operation?: () => Promise<unknown>) => {
      if (operation) return operation();
      if (typeof tableOrOperation === 'function') return tableOrOperation();
    },
  ),
}));
vi.mock('@/database/franky/franky', () => ({ db: { transaction } }));
vi.mock('@/models/post/tags/postTags', () => ({
  PostTagsModel: { table: tagTable, findByIdsPreserveOrder: findByIds, findById: tagTable.get },
}));
vi.mock('@/models/user/tags/userTags', () => ({
  UserTagsModel: { table: tagTable, findByIdsPreserveOrder: findByIds, findById: tagTable.get },
}));
vi.mock('@/models/post/counts/postCounts', () => ({ PostCountsModel: { table: countsTable } }));
vi.mock('@/models/user/counts/userCounts', () => ({ UserCountsModel: { table: countsTable } }));

const entity = { kind: 'user', id: 'profile' } as const;
const tags = (count: number, start = 0): NexusTag[] =>
  Array.from({ length: count }, (_, i) => ({
    label: `tag-${start + i}`,
    taggers: [],
    taggers_count: 1,
    relationship: false,
  }));
const record = (cursor = 5): TagCollectionModelSchema<string> => ({
  id: entity.id,
  tags: tags(cursor),
  cache: { cursor, exhausted: false, fetchedAt: 1, revision: 2, viewerId: 'viewer' },
});

describe('LocalTagCacheService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tagTable.get.mockReset().mockResolvedValue(record());
    tagTable.put.mockReset().mockResolvedValue(undefined);
    countsTable.get.mockReset().mockResolvedValue({ tags: 5, unique_tags: 5 });
    findByIds.mockReset().mockResolvedValue([]);
  });

  it('records cooldown when an invalidation supersedes a failing refresh', async () => {
    tagTable.get.mockResolvedValue({ ...record(), cache: { ...record().cache!, fetchedAt: 0, revision: 3 } });
    await LocalTagCacheService.deferRefresh(entity, { revision: 2, retryAt: 30_000 });
    expect(tagTable.put).toHaveBeenCalledWith(
      expect.objectContaining({ cache: expect.objectContaining({ fetchedAt: 0, revision: 3, retryAt: 30_000 }) }),
    );
  });

  it('does not delay a newer successful refresh after an older request fails', async () => {
    tagTable.get.mockResolvedValue({ ...record(), cache: { ...record().cache!, fetchedAt: 10_000, revision: 3 } });
    await LocalTagCacheService.deferRefresh(entity, { revision: 2, retryAt: 30_000 });
    expect(tagTable.put).not.toHaveBeenCalled();
  });

  it.each(['viewer', undefined])(
    'reopens an exhausted expanded list for a fresh total from viewer %s',
    async (viewerId) => {
      tagTable.get.mockResolvedValue({ ...record(25), cache: { ...record(25).cache!, exhausted: true } });
      await LocalTagCacheService.savePreviews('user', [[entity.id, tags(5)]], { viewerId }, [
        [entity.id, { tags: 30, unique_tags: 30, replies: 0, reposts: 0 }],
      ]);
      expect(tagTable.put).toHaveBeenCalledWith(
        expect.objectContaining({ tags: tags(25), cache: expect.objectContaining({ exhausted: false, cursor: 25 }) }),
      );
    },
  );

  it('rejects pages from an older revision without writing', async () => {
    expect(await LocalTagCacheService.savePage(entity, tags(20, 5), { skip: 5, limit: 20, revision: 1 })).toBe(false);
    expect(tagTable.put).not.toHaveBeenCalled();
  });

  it('rechecks the viewer session after the pending local read', async () => {
    const pending = Promise.withResolvers<TagCollectionModelSchema<string>>();
    tagTable.get.mockReturnValue(pending.promise);
    let current = true;
    const save = LocalTagCacheService.savePage(entity, tags(20), {
      skip: 0,
      limit: 20,
      revision: 2,
      isCurrent: () => current,
    });
    current = false;
    pending.resolve(record());
    expect(await save).toBe(false);
    expect(tagTable.put).not.toHaveBeenCalled();
  });

  it('appends a page without resetting the age of the loaded prefix', async () => {
    await LocalTagCacheService.savePage(entity, tags(20, 5), { skip: 5, limit: 20, revision: 2, viewerId: 'viewer' });
    expect(tagTable.put).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: tags(25),
        cache: expect.objectContaining({ cursor: 25, exhausted: false, fetchedAt: 1, revision: 3 }),
      }),
    );
  });

  it.each([
    { prefix: 100, page: 200, expected: 100 },
    { prefix: 200, page: 100, expected: 100 },
    { prefix: undefined, page: 200, expected: undefined },
    { prefix: 100, page: undefined, expected: undefined },
  ])('keeps the oldest proven snapshot when appending ($prefix, $page)', async ({ prefix, page, expected }) => {
    tagTable.get.mockResolvedValue({ ...record(), cache: { ...record().cache!, validatedAt: prefix } });
    await LocalTagCacheService.savePage(entity, tags(20, 5), {
      skip: 5,
      limit: 20,
      revision: 2,
      viewerId: 'viewer',
      validatedAt: page,
    });
    expect(tagTable.put.mock.calls[0][0].cache.validatedAt).toBe(expected);
  });

  it('replaces a refreshed prefix so deleted labels disappear and clears its cooldown', async () => {
    tagTable.get.mockResolvedValue({ ...record(25), cache: { ...record(25).cache, retryAt: Date.now() + 30_000 } });
    await LocalTagCacheService.savePage(entity, tags(2), { skip: 0, limit: 25, revision: 2, viewerId: 'viewer' });
    const saved = tagTable.put.mock.calls[0][0];
    expect(saved.tags).toEqual(tags(2));
    expect(saved.cache).toMatchObject({ cursor: 2, exhausted: true });
    expect(saved.cache.retryAt).toBeUndefined();
  });

  it('initializes a locally-created placeholder without losing its optimistic tag', async () => {
    const optimistic = { label: 'local', taggers: ['viewer'], taggers_count: 1, relationship: true };
    tagTable.get.mockResolvedValue({
      id: entity.id,
      tags: [optimistic],
      cache: { cursor: 0, revision: 1, fetchedAt: 0, exhausted: false, initialized: false },
      mutations: {
        local: {
          id: 'viewer-operation',
          label: 'local',
          synced: true,
          viewerId: 'viewer',
          relationship: true,
          expiresAt: Date.now() + 60_000,
        },
      },
    });
    expect(
      await LocalTagCacheService.savePage(entity, [], { skip: 0, limit: 20, revision: 1, viewerId: 'viewer' }),
    ).toBe(true);
    expect(tagTable.put).toHaveBeenCalledWith(
      expect.objectContaining({ tags: [optimistic], cache: expect.objectContaining({ cursor: 0, exhausted: true }) }),
    );
  });

  it.each(['post', 'user'] as const)(
    'keeps an expanded %s window while accepting independent batch counts',
    async (kind) => {
      tagTable.get.mockResolvedValue(record(25));
      await LocalTagCacheService.savePreviews(kind, [[entity.id, tags(5)]], { viewerId: 'viewer' }, [
        [entity.id, { tags: 7, unique_tags: 7, replies: 3, reposts: 0 }],
      ]);
      expect(tagTable.put).not.toHaveBeenCalled();
      expect(countsTable.put).toHaveBeenCalledWith(expect.objectContaining({ tags: 7, unique_tags: 7, replies: 3 }));
      expect(transaction).toHaveBeenCalledWith('rw', tagTable, countsTable, expect.any(Function));
    },
  );

  it('preserves newer tag counts when an old batch loses the revision race', async () => {
    await LocalTagCacheService.savePreviews(
      'post',
      [[entity.id, tags(3)]],
      { viewerId: 'viewer', revisions: new Map([[entity.id, 1]]) },
      [[entity.id, { tags: 3, unique_tags: 3, replies: 9, reposts: 0 }]],
    );
    expect(tagTable.put).not.toHaveBeenCalled();
    expect(countsTable.put).toHaveBeenCalledWith(expect.objectContaining({ tags: 5, unique_tags: 5, replies: 9 }));
  });

  it('does not let a viewerless preview replace cached viewer relationships', async () => {
    await LocalTagCacheService.savePreviews('user', [[entity.id, tags(5)]]);
    expect(tagTable.put).not.toHaveBeenCalled();
  });

  it('distinguishes an initialized empty preview from never-loaded tags', async () => {
    tagTable.get.mockResolvedValue(undefined);
    await LocalTagCacheService.savePreviews('post', [[entity.id, []]], {}, [
      [entity.id, { tags: 0, unique_tags: 0, replies: 0, reposts: 0 }],
    ]);
    expect(tagTable.put).toHaveBeenCalledWith(
      expect.objectContaining({ tags: [], cache: expect.objectContaining({ cursor: 0, exhausted: true }) }),
    );
  });

  it('persists cooldown metadata without discarding a legacy expanded window', async () => {
    tagTable.get.mockResolvedValue({ id: entity.id, tags: tags(25) });
    await LocalTagCacheService.deferRefresh(entity, { revision: 0, retryAt: 300_000 });
    expect(tagTable.put).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: tags(25),
        cache: expect.objectContaining({ cursor: 25, fetchedAt: 0, retryAt: 300_000 }),
      }),
    );
  });

  it('does not mark newer accepted data stale when an older background request fails', async () => {
    await LocalTagCacheService.deferRefresh(entity, { revision: 1, retryAt: 300_000 });
    expect(tagTable.put).not.toHaveBeenCalled();
  });

  it('does not persist a cooldown after its session ends', async () => {
    await LocalTagCacheService.deferRefresh(entity, { revision: 2, retryAt: 300_000, isCurrent: () => false });
    expect(tagTable.put).not.toHaveBeenCalled();
  });

  it('new notification invalidation clears the previous cooldown', async () => {
    tagTable.get.mockResolvedValue({ ...record(), cache: { ...record().cache, retryAt: 300_000 } });
    await LocalTagCacheService.invalidate(entity);
    expect(tagTable.put).toHaveBeenCalledWith(
      expect.objectContaining({ cache: expect.objectContaining({ fetchedAt: 0, retryAt: undefined, revision: 3 }) }),
    );
  });

  it('selects only expired windows whose cooldown has elapsed', async () => {
    const now = Date.now();
    findByIds.mockResolvedValue([
      { ...record(), cache: { ...record().cache, retryAt: now + 60_000 } },
      { ...record(), cache: { ...record().cache, fetchedAt: now } },
      record(),
      null,
      { id: 'legacy', tags: [] },
    ]);
    expect(
      await LocalTagCacheService.findStale('user', ['cooldown', 'fresh', 'stale', 'missing', 'legacy'], 1000),
    ).toEqual(['stale']);
  });
});

describe('LocalTagCacheService shared mutations', () => {
  const mutation = {
    label: 'bitcoin',
    viewerId: 'viewer',
    relationship: true,
    expiresAt: Date.now() + 100_000,
    id: 'latest',
    synced: false,
  };
  beforeEach(() => {
    vi.clearAllMocks();
    tagTable.get.mockResolvedValue({ ...record(), mutations: { 'viewer:bitcoin': mutation } });
  });

  it('does not settle an older operation over a newer toggle', async () => {
    await LocalTagCacheService.completeMutation(entity, { mutationId: 'older' });
    expect(tagTable.put).not.toHaveBeenCalled();
    await LocalTagCacheService.completeMutation(entity, { mutationId: 'latest' });
    expect(tagTable.put).toHaveBeenCalledWith(
      expect.objectContaining({
        mutations: {
          'viewer:bitcoin': { ...mutation, synced: true },
        },
      }),
    );
  });

  it('does not settle into a replaced session', async () => {
    await LocalTagCacheService.completeMutation(entity, { mutationId: 'latest', isCurrent: () => false });
    expect(tagTable.put).not.toHaveBeenCalled();
  });

  it('reads only the requested viewer intent without writing', async () => {
    expect((await LocalTagCacheService.getViewerMutations(entity, 'viewer')).get('bitcoin')).toMatchObject({
      id: 'latest',
      relationship: true,
    });
    expect((await LocalTagCacheService.getViewerMutations(entity, 'other')).size).toBe(0);
    expect(tagTable.put).not.toHaveBeenCalled();
  });
});
