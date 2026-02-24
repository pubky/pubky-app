import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PubkyAppFeedReach, PubkyAppFeedSort, FeedResult, PubkyAppFeedLayout } from 'pubky-app-specs';
import { FeedApplication } from './feed';
import * as Core from '@/core';
import { HttpMethod } from '@/libs';

// Mock the LocalFeedService
vi.mock('@/core/services/local/feed', () => ({
  LocalFeedService: {
    createOrUpdate: vi.fn(),
    delete: vi.fn(),
    read: vi.fn(),
  },
}));

// Mock the HomeserverService
vi.mock('@/core/services/homeserver', () => ({
  HomeserverService: {
    request: vi.fn(),
  },
}));

// Mock feedUriBuilder and FeedNormalizer
vi.mock('pubky-app-specs', async () => {
  const actual = await vi.importActual('pubky-app-specs');
  return {
    ...actual,
    feedUriBuilder: vi.fn((userId: string, feedId: string) => `pubky://${userId}/pub/pubky.app/feeds/${feedId}`),
  };
});

describe('FeedApplication', () => {
  const testUserId = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Core.Pubky;

  // Test data factory
  const createMockFeedResult = (): FeedResult =>
    ({
      feed: {
        name: 'Bitcoin News',
        feed: {
          tags: ['bitcoin', 'lightning'],
          reach: PubkyAppFeedReach.All,
          sort: PubkyAppFeedSort.Recent,
          layout: PubkyAppFeedLayout.Columns,
          content: null,
        },
        toJson: () => ({
          name: 'Bitcoin News',
          feed: { tags: ['bitcoin', 'lightning'], reach: 'all', sort: 'recent', layout: 'columns', content: null },
        }),
      },
      meta: {
        id: 'feed123',
        url: `pubky://${testUserId}/pub/pubky.app/feeds/feed123`,
        path: '/pub/pubky.app/feeds/feed123',
      },
    }) as unknown as FeedResult;

  const createMockCreateParams = (): Core.TFeedPersistCreateParams => ({
    feed: createMockFeedResult(),
  });

  const createMockDeleteParams = (): Core.TFeedPersistDeleteParams => ({
    feedId: 'feed123',
  });

  // Helper functions
  const setupMocks = () => {
    return {
      createOrUpdateSpy: vi.spyOn(Core.LocalFeedService, 'createOrUpdate'),
      deleteSpy: vi.spyOn(Core.LocalFeedService, 'delete'),
      readSpy: vi.spyOn(Core.LocalFeedService, 'read'),
      requestSpy: vi.spyOn(Core.HomeserverService, 'request'),
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('persist with PUT action (create)', () => {
    it('should save locally and sync to homeserver successfully', async () => {
      const mockParams = createMockCreateParams();
      const { createOrUpdateSpy, requestSpy } = setupMocks();

      const mockPersistedFeed: Core.FeedModelSchema = {
        id: 'feed123',
        name: 'Bitcoin News',
        tags: ['bitcoin', 'lightning'],
        reach: PubkyAppFeedReach.All,
        sort: PubkyAppFeedSort.Recent,
        content: null,
        layout: PubkyAppFeedLayout.Columns,
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      createOrUpdateSpy.mockResolvedValue(mockPersistedFeed);
      requestSpy.mockResolvedValue(undefined);

      const result = await FeedApplication.persist({ userId: testUserId, params: mockParams });

      expect(createOrUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'feed123',
          name: 'Bitcoin News',
          tags: ['bitcoin', 'lightning'],
        }),
      );
      expect(requestSpy).toHaveBeenCalledWith({
        method: HttpMethod.PUT,
        url: expect.stringContaining('pubky://'),
        bodyJson: expect.any(Object),
      });
      expect(result).toBeTruthy();
      expect(result!.id).toBe('feed123');
    });

    it('should preserve existing ID when updating', async () => {
      const mockParams: Core.TFeedPersistCreateParams = {
        feed: createMockFeedResult(),
        existingId: 'feed-existing',
      };
      const { createOrUpdateSpy, readSpy, requestSpy } = setupMocks();

      const existingFeed: Core.FeedModelSchema = {
        id: 'feed-existing',
        name: 'Existing Feed',
        tags: ['bitcoin'],
        reach: PubkyAppFeedReach.All,
        sort: PubkyAppFeedSort.Recent,
        content: null,
        layout: PubkyAppFeedLayout.Columns,
        created_at: 1000000,
        updated_at: 1000000,
      };
      readSpy.mockResolvedValue(existingFeed);
      createOrUpdateSpy.mockResolvedValue(existingFeed);
      requestSpy.mockResolvedValue(undefined);

      const result = await FeedApplication.persist({ userId: testUserId, params: mockParams });

      expect(result!.id).toBe('feed-existing');
      expect(result!.created_at).toBe(1000000);
    });

    it('should throw when local save fails', async () => {
      const mockParams = createMockCreateParams();
      const { createOrUpdateSpy } = setupMocks();

      createOrUpdateSpy.mockRejectedValue(new Error('Database error'));

      await expect(FeedApplication.persist({ userId: testUserId, params: mockParams })).rejects.toThrow(
        'Database error',
      );
    });

    it('should throw when homeserver sync fails', async () => {
      const mockParams = createMockCreateParams();
      const { createOrUpdateSpy, requestSpy } = setupMocks();

      const mockPersistedFeed: Core.FeedModelSchema = {
        id: 'feed123',
        name: 'Bitcoin News',
        tags: ['bitcoin', 'lightning'],
        reach: PubkyAppFeedReach.All,
        sort: PubkyAppFeedSort.Recent,
        content: null,
        layout: PubkyAppFeedLayout.Columns,
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      createOrUpdateSpy.mockResolvedValue(mockPersistedFeed);
      requestSpy.mockRejectedValue(new Error('Failed to PUT to homeserver: 500'));

      await expect(FeedApplication.persist({ userId: testUserId, params: mockParams })).rejects.toThrow(
        'Failed to PUT to homeserver: 500',
      );
    });
  });

  describe('persist with DELETE action', () => {
    it('should delete locally and sync to homeserver successfully', async () => {
      const mockParams = createMockDeleteParams();
      const { deleteSpy, requestSpy } = setupMocks();

      deleteSpy.mockResolvedValue(undefined);
      requestSpy.mockResolvedValue(undefined);

      const result = await FeedApplication.commitDelete({ userId: testUserId, params: mockParams });

      expect(deleteSpy).toHaveBeenCalledWith({ feedId: 'feed123' });
      expect(requestSpy).toHaveBeenCalledWith({
        method: HttpMethod.DELETE,
        url: expect.stringContaining('pubky://'),
      });
      expect(result).toBeUndefined();
    });

    it('should throw when local delete fails', async () => {
      const mockParams = createMockDeleteParams();
      const { deleteSpy } = setupMocks();

      deleteSpy.mockRejectedValue(new Error('Feed not found'));

      await expect(FeedApplication.commitDelete({ userId: testUserId, params: mockParams })).rejects.toThrow(
        'Feed not found',
      );
    });

    it('should throw when homeserver sync fails', async () => {
      const mockParams = createMockDeleteParams();
      const { deleteSpy, requestSpy } = setupMocks();

      deleteSpy.mockResolvedValue(undefined);
      requestSpy.mockRejectedValue(new Error('Failed to DELETE from homeserver: 404'));

      await expect(FeedApplication.commitDelete({ userId: testUserId, params: mockParams })).rejects.toThrow(
        'Failed to DELETE from homeserver: 404',
      );
    });
  });
});
