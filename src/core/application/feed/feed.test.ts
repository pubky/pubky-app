import {
  FeedResult,
  PubkyAppFeedLayout,
  PubkyAppFeedReach,
  PubkyAppFeedSort,
  PubkySpecsBuilder,
} from 'pubky-app-specs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TFeedPersistCreateParams, TFeedPersistDeleteParams } from '@/application/feed/feed.types';
import { db } from '@/database/franky/franky';
import { AppError } from '@/libs/error/error';
import { ServerErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { FeedModel } from '@/models/feed/feed';
import { buildFeedStreamId } from '@/models/feed/feed.helpers';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import type { Pubky } from '@/models/models.types';
import { PostStreamModel } from '@/models/stream/post/tables/postStream';
import { UnreadPostStreamModel } from '@/models/stream/post/tables/postStream.unread';
import { PubkySpecsSingleton } from '@/pipes/pipes.builder';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalFeedService } from '@/services/local/feed/feed';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import { asOpaque } from '@/test-utils/type-assertions';
import { FeedApplication } from './feed';

// Mock the LocalFeedService
vi.mock('@/services/local/feed/feed', () => ({
  LocalFeedService: {
    createOrUpdate: vi.fn(),
    createOrUpdateMany: vi.fn(),
    delete: vi.fn(),
    read: vi.fn(),
  },
}));

// Mock the HomeserverService
vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: {
    request: vi.fn(),
    list: vi.fn(),
  },
}));

// Mock the LocalStreamPostsService
vi.mock('@/services/local/stream/posts/posts', () => ({
  LocalStreamPostsService: {
    deleteById: vi.fn(),
    clearUnreadStream: vi.fn(),
  },
}));

// Mock pubky-app-specs URI builders
vi.mock('pubky-app-specs', async () => {
  const actual = await vi.importActual('pubky-app-specs');
  return {
    ...actual,
    feedUriBuilder: vi.fn((userId: string, feedId: string) => `pubky://${userId}/pub/pubky.app/feeds/${feedId}`),
    baseUriBuilder: vi.fn((userId: string) => `pubky://${userId}/pub/pubky.app/`),
  };
});

describe('FeedApplication', () => {
  const testUserId = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky;

  // Test data factory
  const createMockFeedResult = (): FeedResult =>
    asOpaque<FeedResult>({
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
    });

  const createMockCreateParams = (): TFeedPersistCreateParams => ({
    feed: createMockFeedResult(),
  });

  const createMockDeleteParams = (): TFeedPersistDeleteParams => ({
    feedId: 'feed123',
  });

  const createMockFeedSchema = (overrides: Partial<FeedModelSchema> = {}): FeedModelSchema => ({
    id: 'feed123',
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

  // Helper functions
  const setupMocks = () => {
    return {
      createOrUpdateSpy: vi.spyOn(LocalFeedService, 'createOrUpdate'),
      createOrUpdateManySpy: vi.spyOn(LocalFeedService, 'createOrUpdateMany'),
      deleteSpy: vi.spyOn(LocalFeedService, 'delete'),
      readSpy: vi.spyOn(LocalFeedService, 'read'),
      requestSpy: vi.spyOn(HomeserverService, 'request'),
      listSpy: vi.spyOn(HomeserverService, 'list'),
      streamDeleteSpy: vi.spyOn(LocalStreamPostsService, 'deleteById'),
      streamClearUnreadSpy: vi.spyOn(LocalStreamPostsService, 'clearUnreadStream'),
      dbTransactionSpy: vi.spyOn(db, 'transaction'),
      feedUpsertSpy: vi.spyOn(FeedModel, 'upsert'),
      feedDeleteByIdSpy: vi.spyOn(FeedModel, 'deleteById'),
      feedFindByIdOrThrowSpy: vi.spyOn(FeedModel, 'findByIdOrThrow'),
      postStreamDeleteByIdSpy: vi.spyOn(PostStreamModel, 'deleteById'),
      unreadPostStreamDeleteByIdSpy: vi.spyOn(UnreadPostStreamModel, 'deleteById'),
      loggerWarnSpy: vi.spyOn(Logger, 'warn'),
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('persist with PUT action (create)', () => {
    it('should save locally and sync to homeserver successfully', async () => {
      const mockParams = createMockCreateParams();
      const { createOrUpdateSpy, requestSpy } = setupMocks();

      const mockPersistedFeed: FeedModelSchema = {
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

    it('should migrate to new ID and preserve created_at when updating config', async () => {
      const mockParams: TFeedPersistCreateParams = {
        feed: createMockFeedResult(),
        existingId: 'feed-existing',
      };
      const {
        readSpy,
        requestSpy,
        dbTransactionSpy,
        feedUpsertSpy,
        feedDeleteByIdSpy,
        feedFindByIdOrThrowSpy,
        postStreamDeleteByIdSpy,
        unreadPostStreamDeleteByIdSpy,
      } = setupMocks();

      const existingFeed: FeedModelSchema = {
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
      dbTransactionSpy.mockImplementation(((...args: unknown[]) =>
        (args[args.length - 1] as () => Promise<unknown>)()) as never);
      feedUpsertSpy.mockResolvedValue(undefined);
      feedDeleteByIdSpy.mockResolvedValue(undefined);
      postStreamDeleteByIdSpy.mockResolvedValue(undefined);
      unreadPostStreamDeleteByIdSpy.mockResolvedValue(undefined);
      feedFindByIdOrThrowSpy.mockResolvedValue(createMockFeedSchema({ id: 'feed123', created_at: 1000000 }));
      requestSpy.mockResolvedValue(undefined);

      const result = await FeedApplication.persist({ userId: testUserId, params: mockParams });

      expect(result!.id).toBe('feed123');
      expect(result!.created_at).toBe(1000000);
      expect(requestSpy).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ method: HttpMethod.PUT, url: expect.stringContaining('/feed123') }),
      );
      expect(requestSpy).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ method: HttpMethod.DELETE, url: expect.stringContaining('/feed-existing') }),
      );
      expect(dbTransactionSpy).toHaveBeenCalledTimes(1);
      expect(feedUpsertSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'feed123' }));
      expect(feedDeleteByIdSpy).toHaveBeenCalledWith('feed-existing');
      const oldStreamId = buildFeedStreamId(existingFeed);
      expect(postStreamDeleteByIdSpy).toHaveBeenCalledWith(oldStreamId);
      expect(unreadPostStreamDeleteByIdSpy).toHaveBeenCalledWith(oldStreamId);
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

      const mockPersistedFeed: FeedModelSchema = {
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

    it('should not mutate local state when migration PUT fails', async () => {
      const mockParams: TFeedPersistCreateParams = {
        feed: createMockFeedResult(),
        existingId: 'feed-existing',
      };
      const { readSpy, requestSpy, dbTransactionSpy, feedUpsertSpy, feedDeleteByIdSpy } = setupMocks();

      readSpy.mockResolvedValue(createMockFeedSchema({ id: 'feed-existing', created_at: 1000000 }));
      requestSpy.mockRejectedValueOnce(new Error('Failed to PUT to homeserver: 500'));

      await expect(FeedApplication.persist({ userId: testUserId, params: mockParams })).rejects.toThrow(
        'Failed to PUT to homeserver: 500',
      );

      expect(requestSpy).toHaveBeenCalledTimes(1);
      expect(requestSpy).toHaveBeenCalledWith(
        expect.objectContaining({ method: HttpMethod.PUT, url: expect.stringContaining('/feed123') }),
      );
      expect(dbTransactionSpy).not.toHaveBeenCalled();
      expect(feedUpsertSpy).not.toHaveBeenCalled();
      expect(feedDeleteByIdSpy).not.toHaveBeenCalled();
    });

    it('should keep local migration committed when old homeserver delete fails', async () => {
      const mockParams: TFeedPersistCreateParams = {
        feed: createMockFeedResult(),
        existingId: 'feed-existing',
      };
      const {
        readSpy,
        requestSpy,
        dbTransactionSpy,
        feedUpsertSpy,
        feedDeleteByIdSpy,
        feedFindByIdOrThrowSpy,
        postStreamDeleteByIdSpy,
        unreadPostStreamDeleteByIdSpy,
        loggerWarnSpy,
      } = setupMocks();

      const existingFeed = createMockFeedSchema({ id: 'feed-existing', created_at: 1000000 });
      readSpy.mockResolvedValue(existingFeed);
      dbTransactionSpy.mockImplementation(((...args: unknown[]) =>
        (args[args.length - 1] as () => Promise<unknown>)()) as never);
      feedUpsertSpy.mockResolvedValue(undefined);
      feedDeleteByIdSpy.mockResolvedValue(undefined);
      postStreamDeleteByIdSpy.mockResolvedValue(undefined);
      unreadPostStreamDeleteByIdSpy.mockResolvedValue(undefined);
      feedFindByIdOrThrowSpy.mockResolvedValue(createMockFeedSchema({ id: 'feed123', created_at: 1000000 }));
      requestSpy.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Failed to DELETE old feed: 500'));

      const result = await FeedApplication.persist({ userId: testUserId, params: mockParams });

      expect(result.id).toBe('feed123');
      expect(requestSpy).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ method: HttpMethod.PUT, url: expect.stringContaining('/feed123') }),
      );
      expect(requestSpy).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ method: HttpMethod.DELETE, url: expect.stringContaining('/feed-existing') }),
      );
      expect(dbTransactionSpy).toHaveBeenCalledTimes(1);
      expect(feedUpsertSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'feed123' }));
      expect(feedDeleteByIdSpy).toHaveBeenCalledWith('feed-existing');
      const oldStreamId = buildFeedStreamId(existingFeed);
      expect(postStreamDeleteByIdSpy).toHaveBeenCalledWith(oldStreamId);
      expect(unreadPostStreamDeleteByIdSpy).toHaveBeenCalledWith(oldStreamId);
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        'Failed to cleanup old homeserver feed after successful migration to new feed ID',
        expect.objectContaining({ oldFeedId: 'feed-existing', newFeedId: 'feed123' }),
      );
    });
  });

  describe('prepareUpdateParams', () => {
    it('should override name when provided in changes', async () => {
      const { readSpy } = setupMocks();
      readSpy.mockResolvedValue(createMockFeedSchema({ name: 'Original Name' }));

      const result = await FeedApplication.prepareUpdateParams({
        feedId: 'feed123',
        changes: { name: 'Updated Name' },
      });

      expect(result.name).toBe('Updated Name');
      expect(result.tags).toEqual(['bitcoin', 'lightning']);
    });

    it('should keep existing name when not provided in changes', async () => {
      const { readSpy } = setupMocks();
      readSpy.mockResolvedValue(createMockFeedSchema({ name: 'Original Name' }));

      const result = await FeedApplication.prepareUpdateParams({
        feedId: 'feed123',
        changes: { tags: ['new-tag'] },
      });

      expect(result.name).toBe('Original Name');
      expect(result.tags).toEqual(['new-tag']);
    });
  });

  describe('persist with DELETE action', () => {
    it('should delete locally and sync to homeserver successfully', async () => {
      const mockParams = createMockDeleteParams();
      const { deleteSpy, readSpy, requestSpy } = setupMocks();

      readSpy.mockRejectedValue(new Error('not found'));
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

    it('should also delete the post stream when feed exists locally', async () => {
      const mockParams = createMockDeleteParams();
      const feed = createMockFeedSchema();
      const { deleteSpy, readSpy, requestSpy, streamDeleteSpy, streamClearUnreadSpy } = setupMocks();

      readSpy.mockResolvedValue(feed);
      deleteSpy.mockResolvedValue(undefined);
      requestSpy.mockResolvedValue(undefined);
      streamDeleteSpy.mockResolvedValue(undefined);
      streamClearUnreadSpy.mockResolvedValue([]);

      await FeedApplication.commitDelete({ userId: testUserId, params: mockParams });

      const expectedStreamId = buildFeedStreamId(feed);
      expect(streamDeleteSpy).toHaveBeenCalledWith({ streamId: expectedStreamId });
      expect(streamClearUnreadSpy).toHaveBeenCalledWith({ streamId: expectedStreamId });
    });

    it('should skip stream cleanup when feed is not found locally', async () => {
      const mockParams = createMockDeleteParams();
      const { deleteSpy, readSpy, requestSpy, streamDeleteSpy, streamClearUnreadSpy } = setupMocks();

      readSpy.mockRejectedValue(new Error('not found'));
      deleteSpy.mockResolvedValue(undefined);
      requestSpy.mockResolvedValue(undefined);

      await FeedApplication.commitDelete({ userId: testUserId, params: mockParams });

      expect(streamDeleteSpy).not.toHaveBeenCalled();
      expect(streamClearUnreadSpy).not.toHaveBeenCalled();
    });

    it('should throw when local delete fails', async () => {
      const mockParams = createMockDeleteParams();
      const { deleteSpy, readSpy } = setupMocks();

      readSpy.mockRejectedValue(new Error('not found'));
      deleteSpy.mockRejectedValue(new Error('Feed not found'));

      await expect(FeedApplication.commitDelete({ userId: testUserId, params: mockParams })).rejects.toThrow(
        'Feed not found',
      );
    });

    it('should throw when homeserver sync fails', async () => {
      const mockParams = createMockDeleteParams();
      const { deleteSpy, readSpy, requestSpy } = setupMocks();

      readSpy.mockRejectedValue(new Error('not found'));
      deleteSpy.mockResolvedValue(undefined);
      requestSpy.mockRejectedValue(new Error('Failed to DELETE from homeserver: 404'));

      await expect(FeedApplication.commitDelete({ userId: testUserId, params: mockParams })).rejects.toThrow(
        'Failed to DELETE from homeserver: 404',
      );
    });
  });

  describe('fetchFeeds', () => {
    const feedUri1 = `pubky://${testUserId}/pub/pubky.app/feeds/feed-abc`;
    const feedUri2 = `pubky://${testUserId}/pub/pubky.app/feeds/feed-def`;

    const createRemoteFeedJson = (name: string, tags: string[] = ['bitcoin'], domainTags?: string[]) => ({
      name,
      feed: {
        tags,
        domain_tags: domainTags,
        reach: 'all',
        layout: 'columns',
        sort: 'recent',
        content: null,
      },
      created_at: 1700000000,
    });

    const setupFetchMocks = () => {
      const mocks = setupMocks();
      const mockBuilder = {
        createFeed: vi.fn().mockReturnValue(createMockFeedResult()),
      };
      const specsSpy = vi.spyOn(PubkySpecsSingleton, 'get').mockReturnValue(asOpaque<PubkySpecsBuilder>(mockBuilder));
      return { ...mocks, mockBuilder, specsSpy };
    };

    it('should fetch, normalize, and persist feeds from homeserver', async () => {
      const { listSpy, requestSpy, createOrUpdateManySpy, mockBuilder } = setupFetchMocks();

      listSpy.mockResolvedValue([feedUri1]);
      requestSpy.mockResolvedValue(createRemoteFeedJson('Bitcoin News'));
      createOrUpdateManySpy.mockImplementation((feeds) => Promise.resolve(feeds));

      const result = await FeedApplication.fetchFeeds(testUserId);

      expect(listSpy).toHaveBeenCalledWith({
        baseDirectory: `pubky://${testUserId}/pub/pubky.app/feeds/`,
      });
      expect(requestSpy).toHaveBeenCalledWith({
        method: HttpMethod.GET,
        url: feedUri1,
      });
      expect(mockBuilder.createFeed).toHaveBeenCalledWith(
        ['bitcoin'],
        'all',
        'columns',
        'recent',
        null,
        'Bitcoin News',
        undefined,
      );
      expect(createOrUpdateManySpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'feed123',
            created_at: 1700000000,
            updated_at: 1700000000,
          }),
        ]),
      );
      expect(result).toHaveLength(1);
    });

    it('preserves remote domain tags while validating the feed hash', async () => {
      const { listSpy, requestSpy, createOrUpdateManySpy, mockBuilder } = setupFetchMocks();

      listSpy.mockResolvedValue([feedUri1]);
      requestSpy.mockResolvedValue(createRemoteFeedJson('Network Feed', ['bitcoin'], ['synonym']));
      createOrUpdateManySpy.mockImplementation((feeds) => Promise.resolve(feeds));

      await FeedApplication.fetchFeeds(testUserId);

      expect(mockBuilder.createFeed).toHaveBeenCalledWith(
        ['bitcoin'],
        'all',
        'columns',
        'recent',
        null,
        'Network Feed',
        ['synonym'],
      );
    });

    it('should handle multiple feeds', async () => {
      const { listSpy, requestSpy, createOrUpdateManySpy } = setupFetchMocks();

      listSpy.mockResolvedValue([feedUri1, feedUri2]);
      requestSpy
        .mockResolvedValueOnce(createRemoteFeedJson('Feed 1'))
        .mockResolvedValueOnce(createRemoteFeedJson('Feed 2', ['lightning']));
      createOrUpdateManySpy.mockImplementation((feeds) => Promise.resolve(feeds));

      const result = await FeedApplication.fetchFeeds(testUserId);

      expect(requestSpy).toHaveBeenCalledTimes(2);
      expect(createOrUpdateManySpy).toHaveBeenCalledWith(
        expect.arrayContaining([expect.any(Object), expect.any(Object)]),
      );
      expect(result).toHaveLength(2);
    });

    it('should continue when one feed request fails', async () => {
      const { listSpy, requestSpy, createOrUpdateManySpy } = setupFetchMocks();

      listSpy.mockResolvedValue([feedUri1, feedUri2]);
      requestSpy
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce(createRemoteFeedJson('Feed 2', ['lightning']));
      createOrUpdateManySpy.mockImplementation((feeds) => Promise.resolve(feeds));

      const result = await FeedApplication.fetchFeeds(testUserId);

      expect(requestSpy).toHaveBeenCalledTimes(2);
      expect(createOrUpdateManySpy).toHaveBeenCalledWith(expect.arrayContaining([expect.any(Object)]));
      expect(result).toHaveLength(1);
    });

    it('should process large feed lists and persist all valid feeds', async () => {
      const { listSpy, requestSpy, createOrUpdateManySpy } = setupFetchMocks();

      const feedUris = Array.from(
        { length: 12 },
        (_, i) => `pubky://${testUserId}/pub/pubky.app/feeds/feed-${i.toString().padStart(2, '0')}`,
      );

      listSpy.mockResolvedValue(feedUris);
      requestSpy.mockImplementation((params) => {
        const feedId = String(params.url).split('/').pop() ?? 'feed';
        return Promise.resolve(createRemoteFeedJson(`Feed ${feedId}`));
      });
      createOrUpdateManySpy.mockImplementation((feeds) => Promise.resolve(feeds));

      const result = await FeedApplication.fetchFeeds(testUserId);

      expect(requestSpy).toHaveBeenCalledTimes(12);
      expect(createOrUpdateManySpy).toHaveBeenCalledWith(expect.arrayContaining(Array(12).fill(expect.any(Object))));
      expect(result).toHaveLength(12);
    });

    it('should return empty array when no feeds exist on homeserver', async () => {
      const { listSpy, createOrUpdateManySpy } = setupFetchMocks();

      listSpy.mockResolvedValue([]);

      const result = await FeedApplication.fetchFeeds(testUserId);

      expect(result).toEqual([]);
      expect(createOrUpdateManySpy).not.toHaveBeenCalled();
    });

    it('should skip invalid feeds and persist valid ones', async () => {
      const { listSpy, requestSpy, createOrUpdateManySpy, mockBuilder } = setupFetchMocks();

      listSpy.mockResolvedValue([feedUri1, feedUri2]);
      requestSpy
        .mockResolvedValueOnce(createRemoteFeedJson('Feed 1'))
        .mockResolvedValueOnce(createRemoteFeedJson('Feed 2'));
      mockBuilder.createFeed
        .mockImplementationOnce(() => {
          throw new Error('specs validation failed');
        })
        .mockReturnValueOnce(createMockFeedResult());
      createOrUpdateManySpy.mockImplementation((feeds) => Promise.resolve(feeds));

      const result = await FeedApplication.fetchFeeds(testUserId);

      expect(result).toHaveLength(1);
    });

    it('should return empty array when all feeds are invalid', async () => {
      const { listSpy, requestSpy } = setupFetchMocks();

      listSpy.mockResolvedValue([feedUri1]);
      requestSpy.mockResolvedValue({ name: null, feed: null });

      const result = await FeedApplication.fetchFeeds(testUserId);

      expect(result).toEqual([]);
    });

    it('should propagate non-404 AppError from HomeserverService.list', async () => {
      const { listSpy } = setupFetchMocks();
      const serverError = new AppError({
        category: ErrorCategory.Server,
        code: ServerErrorCode.INTERNAL_ERROR,
        message: 'Server error',
        service: ErrorService.Homeserver,
        operation: 'list',
        context: { statusCode: 500 },
      });
      listSpy.mockRejectedValue(serverError);

      await expect(FeedApplication.fetchFeeds(testUserId)).rejects.toThrow('Server error');
    });

    it('should propagate non-AppError exceptions', async () => {
      const { listSpy } = setupFetchMocks();
      listSpy.mockRejectedValue(new Error('network-fail'));

      await expect(FeedApplication.fetchFeeds(testUserId)).rejects.toThrow('network-fail');
    });
  });
});
