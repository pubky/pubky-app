import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostCountsModel } from '@/models/post/counts/postCounts';
import { PostTtlModel } from '@/models/post/ttl/postTtl';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import { LocalPostTagService } from './tag.post';

const { collection, saved, read } = vi.hoisted(() => ({
  collection: {
    tags: [],
    cache: undefined,
    mutations: undefined,
    ownsMutation: vi.fn(),
    addTagger: vi.fn(),
    removeTagger: vi.fn(),
    recordMutation: vi.fn(),
  },
  saved: vi.fn(),
  read: vi.fn(),
}));
vi.mock('@/database/franky/franky', () => ({
  db: { transaction: async (_mode: string, _tables: unknown, run: () => Promise<unknown>) => run() },
}));
vi.mock('@/models/post/tags/postTags', () => ({
  PostTagsModel: {
    table: {},
    getOrCreate: read,
    findById: read,
    upsert: saved,
  },
}));
vi.mock('@/models/user/counts/userCounts', () => ({ UserCountsModel: { table: {}, updateCounts: vi.fn() } }));
vi.mock('@/models/post/counts/postCounts', () => ({ PostCountsModel: { table: {}, updateCounts: vi.fn() } }));
vi.mock('@/models/post/ttl/postTtl', () => ({ PostTtlModel: { table: {}, upsert: vi.fn() } }));

describe('LocalPostTagService', () => {
  const params = { taggedId: 'author:post', taggerId: 'viewer', label: 'bitcoin', mutationId: 'operation' };
  beforeEach(() => {
    vi.resetAllMocks();
    read.mockResolvedValue(collection);
    collection.ownsMutation.mockReturnValue(true);
    collection.addTagger.mockReturnValue(false);
    collection.removeTagger.mockReturnValue(true);
  });

  it.each(['create', 'delete'] as const)(
    'rejects an older %s rollback before changing tags or counts',
    async (action) => {
      collection.ownsMutation.mockReturnValue(false);
      expect(await LocalPostTagService[action]({ ...params, expectedMutationId: 'older' })).toBe(false);
      expect(collection.ownsMutation).toHaveBeenCalledWith('bitcoin', 'viewer', 'older');
      expect(collection.addTagger).not.toHaveBeenCalled();
      expect(collection.removeTagger).not.toHaveBeenCalled();
      expect(saved).not.toHaveBeenCalled();
      expect(UserCountsModel.updateCounts).not.toHaveBeenCalled();
      expect(PostCountsModel.updateCounts).not.toHaveBeenCalled();
      expect(PostTtlModel.upsert).not.toHaveBeenCalled();
    },
  );

  it.each(['create', 'delete'] as const)(
    'skips a %s after its session changes during the local read',
    async (action) => {
      read.mockImplementation(async () => collection);
      expect(await LocalPostTagService[action]({ ...params, isCurrent: () => false })).toBe(false);
      expect(saved).not.toHaveBeenCalled();
      expect(UserCountsModel.updateCounts).not.toHaveBeenCalled();
      expect(PostCountsModel.updateCounts).not.toHaveBeenCalled();
      expect(PostTtlModel.upsert).not.toHaveBeenCalled();
    },
  );

  it.each(['create', 'delete'] as const)('does not write or change counts for an idempotent %s', async (action) => {
    collection.addTagger.mockReturnValue(null);
    collection.removeTagger.mockReturnValue(null);
    expect(await LocalPostTagService[action](params)).toBe(false);
    expect(saved).not.toHaveBeenCalled();
    expect(UserCountsModel.updateCounts).not.toHaveBeenCalled();
    expect(PostCountsModel.updateCounts).not.toHaveBeenCalled();
    expect(PostTtlModel.upsert).not.toHaveBeenCalled();
    expect(collection.recordMutation).not.toHaveBeenCalled();
  });

  it.each(['create', 'delete'] as const)(
    'settles a %s rollback even if the visible row was already restored',
    async (action) => {
      collection.addTagger.mockReturnValue(null);
      collection.removeTagger.mockReturnValue(null);
      expect(await LocalPostTagService[action]({ ...params, expectedMutationId: 'failed', synced: true })).toBe(true);
      expect(collection.recordMutation).toHaveBeenCalledWith(
        'bitcoin',
        'viewer',
        action === 'create',
        'operation',
        true,
      );
      expect(saved).toHaveBeenCalledOnce();
      expect(UserCountsModel.updateCounts).not.toHaveBeenCalled();
    },
  );

  it.each(['create', 'delete'] as const)('updates tag and viewer counts with a %s', async (action) => {
    expect(await LocalPostTagService[action](params)).toBe(true);
    const delta = action === 'create' ? 1 : -1;
    expect(collection.recordMutation).toHaveBeenCalledWith(
      'bitcoin',
      'viewer',
      action === 'create',
      'operation',
      false,
    );
    expect(PostCountsModel.updateCounts).toHaveBeenCalledWith({
      postCompositeId: params.taggedId,
      countChanges: { tags: delta, unique_tags: delta },
    });
    expect(UserCountsModel.updateCounts).toHaveBeenCalledWith({
      userId: params.taggerId,
      countChanges: { tagged: delta },
    });
    expect(PostTtlModel.upsert).toHaveBeenCalledWith({ id: params.taggedId, lastUpdatedAt: expect.any(Number) });
  });

  it('does not change unique tag count when adding to an existing label', async () => {
    collection.addTagger.mockReturnValue(true);
    await LocalPostTagService.create(params);
    expect(PostCountsModel.updateCounts).toHaveBeenCalledWith({
      postCompositeId: params.taggedId,
      countChanges: { tags: 1, unique_tags: undefined },
    });
  });

  it('keeps the unique tag count when another tagger remains after deletion', async () => {
    collection.removeTagger.mockReturnValue(false);
    expect(await LocalPostTagService.delete(params)).toBe(true);
    expect(PostCountsModel.updateCounts).toHaveBeenCalledWith({
      postCompositeId: params.taggedId,
      countChanges: { tags: -1, unique_tags: undefined },
    });
    expect(UserCountsModel.updateCounts).toHaveBeenCalledWith({
      userId: params.taggerId,
      countChanges: { tagged: -1 },
    });
  });

  it('does not write when deleting from a missing collection', async () => {
    read.mockResolvedValue(null);
    expect(await LocalPostTagService.delete(params)).toBe(false);
    expect(saved).not.toHaveBeenCalled();
    expect(collection.recordMutation).not.toHaveBeenCalled();
    expect(UserCountsModel.updateCounts).not.toHaveBeenCalled();
    expect(PostCountsModel.updateCounts).not.toHaveBeenCalled();
  });

  it('propagates a failed tag save', async () => {
    saved.mockRejectedValue(new Error('disk unavailable'));
    await expect(LocalPostTagService.create(params)).rejects.toThrow('Failed to create post tag');
  });
});
