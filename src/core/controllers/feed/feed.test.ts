import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort } from 'pubky-app-specs';
import type { TFeedCreateParams, TFeedUpdateParams, TFeedIdParam } from './feed.types';
import { asInvalid } from '@/test-utils';
import { FeedApplication } from '@/application/feed/feed';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { AuthStore } from '@/stores/auth/auth.types';
const testData = {
  userPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky,
};

const createFeedParams = (overrides: Partial<TFeedCreateParams> = {}): TFeedCreateParams => ({
  name: 'Bitcoin News',
  tags: ['bitcoin', 'lightning'],
  reach: PubkyAppFeedReach.All,
  sort: PubkyAppFeedSort.Recent,
  content: null,
  layout: PubkyAppFeedLayout.Columns,
  ...overrides,
});

const createMockFeedSchema = (overrides: Partial<FeedModelSchema> = {}): FeedModelSchema => ({
  id: 'feed-abc123',
  name: 'Bitcoin News',
  tags: ['bitcoin', 'lightning'],
  reach: PubkyAppFeedReach.All,
  sort: PubkyAppFeedSort.Recent,
  content: null,
  layout: PubkyAppFeedLayout.Columns,
  created_at: Date.now(),
  updated_at: Date.now(),
  ...overrides,
});

describe('FeedController', () => {
  let FeedController: typeof import('./feed').FeedController;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock auth store (needed for application layer)
    vi.spyOn(useAuthStore, 'getState').mockReturnValue({
      selectCurrentUserPubky: () => testData.userPubky,
      currentUserPubky: testData.userPubky,
    } as AuthStore);

    // Mock FeedApplication
    vi.spyOn(FeedApplication, 'persist').mockResolvedValue(createMockFeedSchema());
    vi.spyOn(FeedApplication, 'commitDelete').mockResolvedValue(undefined);
    vi.spyOn(FeedApplication, 'getList').mockResolvedValue([createMockFeedSchema()]);
    vi.spyOn(FeedApplication, 'get').mockResolvedValue(createMockFeedSchema());
    vi.spyOn(FeedApplication, 'fetchFeeds').mockResolvedValue([createMockFeedSchema()]);

    // Import FeedController
    const feedModule = await import('./feed');
    FeedController = feedModule.FeedController;
  });

  describe('create', () => {
    it('should pass params to application layer for persistence', async () => {
      const params = createFeedParams();
      const persistSpy = vi.spyOn(FeedApplication, 'persist');

      const result = await FeedController.commitCreate(params);

      expect(persistSpy).toHaveBeenCalledWith({
        userId: testData.userPubky,
        params: {
          feed: expect.any(Object),
        },
      });
      expect(result).toBeTruthy();
      expect(result.id).toBe('feed-abc123');
    });

    it('should throw when user is not authenticated (via application layer)', async () => {
      vi.spyOn(FeedApplication, 'persist').mockRejectedValue(new Error('User not authenticated'));

      await expect(FeedController.commitCreate(createFeedParams())).rejects.toThrow('User not authenticated');
    });

    it('should validate tags before normalizing', async () => {
      const params = createFeedParams({ tags: [] });

      await expect(FeedController.commitCreate(params)).rejects.toThrow('At least one tag is required');
    });

    it('should validate tags count before normalizing', async () => {
      const params = createFeedParams({ tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6'] });

      await expect(FeedController.commitCreate(params)).rejects.toThrow('Maximum 5 tags allowed');
    });
  });

  describe('update', () => {
    it('should pass changes to application layer for persistence', async () => {
      const persistSpy = vi.spyOn(FeedApplication, 'persist');
      const prepareSpy = vi
        .spyOn(FeedApplication, 'prepareUpdateParams')
        .mockResolvedValue(createFeedParams({ tags: ['bitcoin', 'mining'] }));

      const updateParams: TFeedUpdateParams = {
        feedId: 'feed-abc123',
        changes: { tags: ['bitcoin', 'mining'] },
      };

      const result = await FeedController.commitUpdate(updateParams);

      expect(prepareSpy).toHaveBeenCalledWith({
        feedId: 'feed-abc123',
        changes: { tags: ['bitcoin', 'mining'] },
      });
      expect(persistSpy).toHaveBeenCalledWith({
        userId: testData.userPubky,
        params: {
          feed: expect.any(Object),
          existingId: 'feed-abc123',
        },
      });
      expect(result).toBeTruthy();
    });

    it('should throw when feed not found', async () => {
      vi.spyOn(FeedApplication, 'prepareUpdateParams').mockRejectedValue(new Error('Feed not found'));

      const updateParams: TFeedUpdateParams = {
        feedId: 'feed-nonexistent',
        changes: { tags: ['new'] },
      };

      await expect(FeedController.commitUpdate(updateParams)).rejects.toThrow('Feed not found');
    });

    it('should pass name change to application layer for persistence', async () => {
      const persistSpy = vi.spyOn(FeedApplication, 'persist');
      const prepareSpy = vi
        .spyOn(FeedApplication, 'prepareUpdateParams')
        .mockResolvedValue(createFeedParams({ name: 'Renamed Feed' }));

      const updateParams: TFeedUpdateParams = {
        feedId: 'feed-abc123',
        changes: { name: 'Renamed Feed' },
      };

      const result = await FeedController.commitUpdate(updateParams);

      expect(prepareSpy).toHaveBeenCalledWith({
        feedId: 'feed-abc123',
        changes: { name: 'Renamed Feed' },
      });
      expect(persistSpy).toHaveBeenCalledWith({
        userId: testData.userPubky,
        params: {
          feed: expect.any(Object),
          existingId: 'feed-abc123',
        },
      });
      expect(result).toBeTruthy();
    });

    it('should throw when user is not authenticated (via application layer)', async () => {
      vi.spyOn(FeedApplication, 'prepareUpdateParams').mockResolvedValue(createFeedParams({ tags: ['new'] }));
      vi.spyOn(FeedApplication, 'persist').mockRejectedValue(new Error('User not authenticated'));

      await expect(FeedController.commitUpdate({ feedId: 'feed-abc123', changes: { tags: ['new'] } })).rejects.toThrow(
        'User not authenticated',
      );
    });
  });

  describe('delete', () => {
    it('should call delete in application layer', async () => {
      const deleteSpy = vi.spyOn(FeedApplication, 'commitDelete');
      const deleteParams: TFeedIdParam = { feedId: 'feed-abc123' };

      await FeedController.commitDelete(deleteParams);

      expect(deleteSpy).toHaveBeenCalledWith({ userId: testData.userPubky, params: { feedId: 'feed-abc123' } });
    });

    it('should throw when user is not authenticated (via application layer)', async () => {
      vi.spyOn(FeedApplication, 'commitDelete').mockRejectedValue(new Error('User not authenticated'));

      await expect(FeedController.commitDelete({ feedId: 'feed-abc123' })).rejects.toThrow('User not authenticated');
    });
  });

  describe('fetchFeeds', () => {
    it('should pass userId from auth store to application layer', async () => {
      const fetchSpy = vi.spyOn(FeedApplication, 'fetchFeeds');

      await FeedController.fetchFeeds();

      expect(fetchSpy).toHaveBeenCalledWith(testData.userPubky);
    });

    it('should return persisted feeds from application layer', async () => {
      const feeds = [createMockFeedSchema({ id: 'feed-1' }), createMockFeedSchema({ id: 'feed-2' })];
      vi.spyOn(FeedApplication, 'fetchFeeds').mockResolvedValue(feeds);

      const result = await FeedController.fetchFeeds();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('feed-1');
      expect(result[1].id).toBe('feed-2');
    });

    it('should return empty array when no feeds on homeserver', async () => {
      vi.spyOn(FeedApplication, 'fetchFeeds').mockResolvedValue([]);

      const result = await FeedController.fetchFeeds();

      expect(result).toEqual([]);
    });

    it('should propagate errors from application layer', async () => {
      vi.spyOn(FeedApplication, 'fetchFeeds').mockRejectedValue(new Error('Network error'));

      await expect(FeedController.fetchFeeds()).rejects.toThrow('Network error');
    });
  });

  describe('list', () => {
    it('should return all feeds sorted', async () => {
      const feeds = [
        createMockFeedSchema({ id: 'feed-1', name: 'Feed 1' }),
        createMockFeedSchema({ id: 'feed-2', name: 'Feed 2' }),
      ];
      vi.spyOn(FeedApplication, 'getList').mockResolvedValue(feeds);

      const result = await FeedController.getList();

      expect(result).toHaveLength(2);
      expect(FeedApplication.getList).toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('should return feed by ID', async () => {
      const feed = createMockFeedSchema();
      vi.spyOn(FeedApplication, 'get').mockResolvedValue(feed);

      const result = await FeedController.get({ feedId: 'feed-abc123' });

      expect(result).toBeTruthy();
      expect(result!.id).toBe('feed-abc123');
    });

    it('should return undefined when not found', async () => {
      vi.spyOn(FeedApplication, 'get').mockResolvedValue(asInvalid<FeedModelSchema>(undefined));

      const result = await FeedController.get({ feedId: 'feed-nonexistent' });

      expect(result).toBeUndefined();
    });
  });
});
