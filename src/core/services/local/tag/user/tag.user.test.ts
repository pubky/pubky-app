import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import { postStreamDirtyRegistry } from '@/services/local/stream/posts/postStreamDirtyRegistry';
import { LocalUserTagService } from './tag.user';

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
vi.mock('@/models/user/tags/userTags', () => ({
  UserTagsModel: {
    table: {},
    getOrCreate: read,
    findById: read,
    upsert: saved,
  },
}));
vi.mock('@/models/user/counts/userCounts', () => ({ UserCountsModel: { table: {}, updateCounts: vi.fn() } }));
vi.mock('@/services/local/stream/posts/postStreamDirtyRegistry', () => ({
  postStreamDirtyRegistry: { markDirty: vi.fn() },
}));

describe('LocalUserTagService', () => {
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
      expect(await LocalUserTagService[action]({ ...params, expectedMutationId: 'older' })).toBe(false);
      expect(collection.ownsMutation).toHaveBeenCalledWith('bitcoin', 'viewer', 'older');
      expect(collection.addTagger).not.toHaveBeenCalled();
      expect(collection.removeTagger).not.toHaveBeenCalled();
      expect(saved).not.toHaveBeenCalled();
      expect(UserCountsModel.updateCounts).not.toHaveBeenCalled();
    },
  );

  it.each(['create', 'delete'] as const)(
    'skips a %s after its session changes during the local read',
    async (action) => {
      read.mockImplementation(async () => collection);
      expect(await LocalUserTagService[action]({ ...params, isCurrent: () => false })).toBe(false);
      expect(saved).not.toHaveBeenCalled();
    },
  );

  it.each(['create', 'delete'] as const)('does not write or change counts for an idempotent %s', async (action) => {
    collection.addTagger.mockReturnValue(null);
    collection.removeTagger.mockReturnValue(null);
    expect(await LocalUserTagService[action](params)).toBe(false);
    expect(saved).not.toHaveBeenCalled();
    expect(collection.recordMutation).not.toHaveBeenCalled();
  });

  it.each(['create', 'delete'] as const)(
    'settles a %s rollback even if the visible row was already restored',
    async (action) => {
      collection.addTagger.mockReturnValue(null);
      collection.removeTagger.mockReturnValue(null);
      expect(await LocalUserTagService[action]({ ...params, expectedMutationId: 'failed', synced: true })).toBe(true);
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
    expect(await LocalUserTagService[action](params)).toBe(true);
    const delta = action === 'create' ? 1 : -1;
    expect(collection.recordMutation).toHaveBeenCalledWith(
      'bitcoin',
      'viewer',
      action === 'create',
      'operation',
      false,
    );
    expect(UserCountsModel.updateCounts).toHaveBeenCalledWith({
      userId: params.taggedId,
      countChanges: { tags: delta, unique_tags: delta },
    });
    expect(UserCountsModel.updateCounts).toHaveBeenCalledWith({
      userId: params.taggerId,
      countChanges: { tagged: delta },
    });
    expect(postStreamDirtyRegistry.markDirty).toHaveBeenCalledWith('profile_tag');
  });

  it('does not change unique tag count when adding to an existing label', async () => {
    collection.addTagger.mockReturnValue(true);
    await LocalUserTagService.create(params);
    expect(UserCountsModel.updateCounts).toHaveBeenCalledWith({
      userId: params.taggedId,
      countChanges: { tags: 1, unique_tags: undefined },
    });
  });

  it('propagates a failed tag save', async () => {
    saved.mockRejectedValue(new Error('disk unavailable'));
    await expect(LocalUserTagService.create(params)).rejects.toThrow('Failed to create user tag');
  });
});
