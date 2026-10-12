import { buildFeed, buildUri, decodeObject, parsePubkyUrl } from 'pubky-social-specs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TFeedCreateParams } from '@/controllers/feed/feed.types';
import { db } from '@/database/franky/franky';
import { AppError } from '@/libs/error/error';
import { DatabaseErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { FeedModel } from '@/models/feed/feed';
import { buildFeedStreamId } from '@/models/feed/feed.helpers';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import type { Pubky } from '@/models/models.types';
import { PostStreamModel } from '@/models/stream/post/tables/postStream';
import { UnreadPostStreamModel } from '@/models/stream/post/tables/postStream.unread';
import { FeedNormalizer } from '@/pipes/feed/feed.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalFeedService } from '@/services/local/feed/feed';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import { FeedApplication } from './feed';

vi.mock('@/services/local/feed/feed', () => ({
  LocalFeedService: {
    createOrUpdate: vi.fn(),
    createOrUpdateMany: vi.fn(),
    delete: vi.fn(),
    read: vi.fn(),
    rollback: vi.fn(),
  },
}));

vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: {
    request: vi.fn(),
    putBlob: vi.fn(),
    list: vi.fn(),
    getBytes: vi.fn(),
    getBytesIfExists: vi.fn(),
  },
}));

vi.mock('@/services/local/stream/posts/posts', () => ({
  LocalStreamPostsService: {
    deleteById: vi.fn(),
    clearUnreadStream: vi.fn(),
  },
}));

describe('FeedApplication', () => {
  const testUserId = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky;

  const feedParams = (overrides: Partial<TFeedCreateParams> = {}): TFeedCreateParams => ({
    name: 'Bitcoin News',
    icon: 'activity',
    tags: ['bitcoin', 'lightning'],
    domain_tags: [],
    reach: 'all',
    sort: 'recent',
    content: null,
    layout: 'columns',
    ...overrides,
  });
  const built = (overrides: Partial<TFeedCreateParams> = {}) =>
    FeedNormalizer.to({ params: feedParams(overrides), userId: testUserId });
  const FEED = built();
  const EXISTING = built({ tags: ['bitcoin'] });

  const createMockFeedSchema = (overrides: Partial<FeedModelSchema> = {}): FeedModelSchema => ({
    id: FEED.id,
    name: 'Bitcoin News',
    icon: 'activity',
    tags: ['bitcoin', 'lightning'],
    domain_tags: [],
    reach: 'all',
    sort: 'recent',
    content: null,
    layout: 'columns',
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  });

  // The homeserver service normalizes every SDK rejection, so a PUT failure reaches commit as an AppError.
  const createPutFailure = () =>
    new AppError({
      category: ErrorCategory.Server,
      code: ServerErrorCode.INTERNAL_ERROR,
      message: 'Failed to PUT to homeserver: 500',
      service: ErrorService.Homeserver,
      operation: 'request',
    });

  /** The feed a PUT wrote, decoded. */
  const putFeed = (call = 0) => {
    const [{ url, blob }] = vi.mocked(HomeserverService.putBlob).mock.calls[call];
    return { url, feed: decodeObject(parsePubkyUrl(url), blob, 'feed') };
  };

  const setupMocks = () => ({
    createOrUpdateSpy: vi.spyOn(LocalFeedService, 'createOrUpdate'),
    createOrUpdateManySpy: vi.spyOn(LocalFeedService, 'createOrUpdateMany'),
    deleteSpy: vi.spyOn(LocalFeedService, 'delete'),
    readSpy: vi.spyOn(LocalFeedService, 'read'),
    rollbackSpy: vi.spyOn(LocalFeedService, 'rollback'),
    requestSpy: vi.spyOn(HomeserverService, 'request'),
    putSpy: vi.spyOn(HomeserverService, 'putBlob'),
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
    loggerErrorSpy: vi.spyOn(Logger, 'error'),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(HomeserverService.getBytesIfExists).mockResolvedValue(null);
  });

  describe('get', () => {
    it('should return null when the feed is not found locally', async () => {
      const { readSpy } = setupMocks();
      readSpy.mockResolvedValue(null);

      await expect(FeedApplication.get({ feedId: 'feed-nonexistent' })).resolves.toBeNull();
      expect(readSpy).toHaveBeenCalledWith({ feedId: 'feed-nonexistent' });
    });
  });

  describe('persist (create and update)', () => {
    it('saves locally and PUTs the feed bytes at its private path', async () => {
      const { createOrUpdateSpy, putSpy } = setupMocks();
      createOrUpdateSpy.mockImplementation((feed) => Promise.resolve({ persisted: feed, prior: null }));
      putSpy.mockResolvedValue(undefined);

      const result = await FeedApplication.persist({ userId: testUserId, params: { feed: FEED } });

      expect(createOrUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: FEED.id,
          name: 'Bitcoin News',
          icon: 'activity',
          tags: ['bitcoin', 'lightning'],
        }),
      );
      expect(putSpy).toHaveBeenCalledWith({ url: FEED.url, blob: FEED.body });
      expect(FEED.path.startsWith('/priv/social/v1/feeds/')).toBe(true);
      expect(result.id).toBe(FEED.id);
    });

    it('persists profile tags locally and in the stored feed', async () => {
      const wot = built({ tags: [], domain_tags: ['bitcoiner', '🔥'], reach: 'wot' });
      const { createOrUpdateSpy, putSpy } = setupMocks();
      createOrUpdateSpy.mockImplementation((feed) => Promise.resolve({ persisted: feed, prior: null }));
      putSpy.mockResolvedValue(undefined);

      const result = await FeedApplication.persist({ userId: testUserId, params: { feed: wot } });

      expect(putFeed().feed.feed).toMatchObject({ tags: null, domain_tags: ['bitcoiner', '🔥'], reach: 'wot' });
      expect(result.domain_tags).toEqual(['bitcoiner', '🔥']);
    });

    it('moves the feed to its new id, keeping created_at, when the filter changes', async () => {
      const m = setupMocks();
      const existingFeed = createMockFeedSchema({ id: EXISTING.id, tags: ['bitcoin'], created_at: 1000000 });
      m.readSpy.mockResolvedValue(existingFeed);
      m.dbTransactionSpy.mockImplementation(((...args: unknown[]) =>
        (args[args.length - 1] as () => Promise<unknown>)()) as never);
      m.feedUpsertSpy.mockResolvedValue(undefined);
      m.feedDeleteByIdSpy.mockResolvedValue(undefined);
      m.postStreamDeleteByIdSpy.mockResolvedValue(undefined);
      m.unreadPostStreamDeleteByIdSpy.mockResolvedValue(undefined);
      m.feedFindByIdOrThrowSpy.mockResolvedValue(createMockFeedSchema({ created_at: 1000000 }));
      m.putSpy.mockResolvedValue(undefined);
      m.requestSpy.mockResolvedValue(undefined);

      const result = await FeedApplication.persist({
        userId: testUserId,
        params: { feed: FEED, existingId: EXISTING.id },
      });

      expect(result.id).toBe(FEED.id);
      expect(result.created_at).toBe(1000000);
      expect(m.putSpy).toHaveBeenCalledWith({ url: FEED.url, blob: FEED.body });
      expect(m.requestSpy).toHaveBeenCalledWith({
        method: HttpMethod.DELETE,
        url: buildUri(testUserId, 'feed', EXISTING.id),
      });
      expect(m.putSpy.mock.invocationCallOrder[0]).toBeLessThan(m.requestSpy.mock.invocationCallOrder[0]);
      expect(m.feedUpsertSpy).toHaveBeenCalledWith(expect.objectContaining({ id: FEED.id }));
      expect(m.feedDeleteByIdSpy).toHaveBeenCalledWith(EXISTING.id);
      const oldStreamId = buildFeedStreamId(existingFeed, testUserId);
      expect(m.postStreamDeleteByIdSpy).toHaveBeenCalledWith(oldStreamId);
      expect(m.unreadPostStreamDeleteByIdSpy).toHaveBeenCalledWith(oldStreamId);
    });

    it('edits on top of the stored feed, keeping the members another client added', async () => {
      const stored = buildFeed(testUserId, {
        name: 'Old name',
        icon: 'activity',
        reach: 'all',
        layout: 'columns',
        sort: 'recent',
        tags: ['bitcoin', 'lightning'],
      });
      const withUnknown = { ...stored.object, $unknown: '{"color":"orange"}' };
      const { encodeObject } = await import('pubky-social-specs');
      vi.mocked(HomeserverService.getBytesIfExists).mockResolvedValue({
        bytes: encodeObject(stored.url, withUnknown),
        modifiedAt: null,
      });
      const m = setupMocks();
      m.readSpy.mockResolvedValue(createMockFeedSchema({ created_at: 5 }));
      m.createOrUpdateSpy.mockImplementation((feed) => Promise.resolve({ persisted: feed, prior: null }));
      m.putSpy.mockResolvedValue(undefined);

      await FeedApplication.persist({
        userId: testUserId,
        params: { feed: built({ name: 'Renamed' }), existingId: FEED.id },
      });

      const { url, feed } = putFeed();
      expect(url).toBe(FEED.url);
      expect(feed).toMatchObject({
        name: 'Renamed',
        created_at: stored.object.created_at,
        $unknown: '{"color":"orange"}',
      });
    });

    it('throws when local save fails', async () => {
      const { createOrUpdateSpy, putSpy } = setupMocks();
      createOrUpdateSpy.mockRejectedValue(new Error('Database error'));

      await expect(FeedApplication.persist({ userId: testUserId, params: { feed: FEED } })).rejects.toThrow(
        'Database error',
      );
      expect(putSpy).not.toHaveBeenCalled();
    });

    it('rolls back the local create and rethrows when homeserver sync fails', async () => {
      const { createOrUpdateSpy, rollbackSpy, putSpy } = setupMocks();
      const persisted = createMockFeedSchema();
      createOrUpdateSpy.mockResolvedValue({ persisted, prior: null });
      rollbackSpy.mockResolvedValue(true);
      putSpy.mockRejectedValue(createPutFailure());

      await expect(FeedApplication.persist({ userId: testUserId, params: { feed: FEED } })).rejects.toThrow(
        'Failed to PUT to homeserver: 500',
      );
      expect(rollbackSpy).toHaveBeenCalledWith(expect.objectContaining({ feedId: persisted.id, priorFeed: null }));
    });

    it('does not mutate local state when the migration PUT fails', async () => {
      const m = setupMocks();
      m.readSpy.mockResolvedValue(createMockFeedSchema({ id: EXISTING.id }));
      m.putSpy.mockRejectedValueOnce(new Error('Failed to PUT to homeserver: 500'));

      await expect(
        FeedApplication.persist({ userId: testUserId, params: { feed: FEED, existingId: EXISTING.id } }),
      ).rejects.toThrow('Failed to PUT to homeserver: 500');
      expect(m.dbTransactionSpy).not.toHaveBeenCalled();
      expect(m.requestSpy).not.toHaveBeenCalled();
    });

    it('keeps the local migration when the old homeserver delete fails', async () => {
      const m = setupMocks();
      m.readSpy.mockResolvedValue(createMockFeedSchema({ id: EXISTING.id }));
      m.dbTransactionSpy.mockImplementation(((...args: unknown[]) =>
        (args[args.length - 1] as () => Promise<unknown>)()) as never);
      m.feedUpsertSpy.mockResolvedValue(undefined);
      m.feedDeleteByIdSpy.mockResolvedValue(undefined);
      m.postStreamDeleteByIdSpy.mockResolvedValue(undefined);
      m.unreadPostStreamDeleteByIdSpy.mockResolvedValue(undefined);
      m.feedFindByIdOrThrowSpy.mockResolvedValue(createMockFeedSchema());
      m.putSpy.mockResolvedValue(undefined);
      m.requestSpy.mockRejectedValueOnce(new Error('Failed to DELETE old feed: 500'));
      m.loggerWarnSpy.mockImplementation(() => {});

      const result = await FeedApplication.persist({
        userId: testUserId,
        params: { feed: FEED, existingId: EXISTING.id },
      });

      expect(result.id).toBe(FEED.id);
      expect(m.loggerWarnSpy).toHaveBeenCalled();
    });
  });

  describe('prepareUpdateParams', () => {
    it('should override name when provided in changes', async () => {
      const { readSpy } = setupMocks();
      readSpy.mockResolvedValue(createMockFeedSchema({ name: 'Original Name' }));

      const result = await FeedApplication.prepareUpdateParams({
        feedId: FEED.id,
        changes: { name: 'Updated Name' },
      });

      expect(result.name).toBe('Updated Name');
      expect(result.icon).toBe('activity');
      expect(result.tags).toEqual(['bitcoin', 'lightning']);
    });

    it('should keep existing name when not provided in changes', async () => {
      const { readSpy } = setupMocks();
      readSpy.mockResolvedValue(createMockFeedSchema({ name: 'Original Name' }));

      const result = await FeedApplication.prepareUpdateParams({
        feedId: FEED.id,
        changes: { tags: ['new-tag'] },
      });

      expect(result.name).toBe('Original Name');
      expect(result.icon).toBe('activity');
      expect(result.tags).toEqual(['new-tag']);
    });

    it('should throw RECORD_NOT_FOUND when the feed no longer exists locally', async () => {
      const { readSpy } = setupMocks();
      readSpy.mockResolvedValue(null);

      await expect(
        FeedApplication.prepareUpdateParams({ feedId: FEED.id, changes: { name: 'Updated Name' } }),
      ).rejects.toMatchObject({
        code: DatabaseErrorCode.RECORD_NOT_FOUND,
      });
    });

    it('should apply an icon-only update without changing the other feed fields', async () => {
      const { readSpy } = setupMocks();
      readSpy.mockResolvedValue(createMockFeedSchema({ icon: 'activity' }));

      const result = await FeedApplication.prepareUpdateParams({
        feedId: FEED.id,
        changes: { icon: 'mountain' },
      });

      expect(result).toEqual(
        expect.objectContaining({
          name: 'Bitcoin News',
          icon: 'mountain',
          tags: ['bitcoin', 'lightning'],
        }),
      );
    });
  });

  describe('commitDelete', () => {
    it('deletes locally and on the homeserver, with the stream cache', async () => {
      const m = setupMocks();
      const feed = createMockFeedSchema();
      m.readSpy.mockResolvedValue(feed);
      m.deleteSpy.mockResolvedValue(undefined);
      m.requestSpy.mockResolvedValue(undefined);
      m.streamDeleteSpy.mockResolvedValue(undefined);
      m.streamClearUnreadSpy.mockResolvedValue([]);

      await FeedApplication.commitDelete({ userId: testUserId, params: { feedId: FEED.id } });

      expect(m.deleteSpy).toHaveBeenCalledWith({ feedId: FEED.id });
      expect(m.requestSpy).toHaveBeenCalledWith({ method: HttpMethod.DELETE, url: FEED.url });
      expect(m.streamDeleteSpy).toHaveBeenCalledWith({ streamId: buildFeedStreamId(feed, testUserId) });
    });

    it('throws when homeserver sync fails', async () => {
      const m = setupMocks();
      m.readSpy.mockResolvedValue(null);
      m.deleteSpy.mockResolvedValue(undefined);
      m.requestSpy.mockRejectedValue(new Error('Failed to DELETE from homeserver: 404'));

      await expect(FeedApplication.commitDelete({ userId: testUserId, params: { feedId: FEED.id } })).rejects.toThrow(
        'Failed to DELETE from homeserver: 404',
      );
    });
  });

  describe('fetchFeeds', () => {
    const feedsDir = `pubky://${testUserId}/priv/social/v1/feeds/`;

    it('lists the private feeds, decodes each and persists them', async () => {
      const list = built({ layout: 'list' });
      const m = setupMocks();
      m.listSpy.mockResolvedValue([FEED.url, list.url]);
      vi.mocked(HomeserverService.getBytes).mockImplementation(async (url) =>
        url === FEED.url ? FEED.body : list.body,
      );
      m.createOrUpdateManySpy.mockImplementation((feeds) => Promise.resolve(feeds));

      const result = await FeedApplication.fetchFeeds(testUserId);

      expect(m.listSpy).toHaveBeenCalledWith({ baseDirectory: feedsDir });
      expect(result.map((feed) => [feed.id, feed.layout])).toEqual([
        [FEED.id, 'columns'],
        [list.id, 'list'],
      ]);
      // created_at is stored in microseconds, the local row keeps milliseconds
      expect(result[0].created_at).toBe(Math.floor(FEED.object.created_at / 1000));
      expect(m.putSpy).not.toHaveBeenCalled();
    });

    it('skips a feed that does not decode and keeps the others', async () => {
      const m = setupMocks();
      m.loggerWarnSpy.mockImplementation(() => {});
      m.listSpy.mockResolvedValue([FEED.url, EXISTING.url]);
      vi.mocked(HomeserverService.getBytes).mockImplementation(async (url) =>
        url === FEED.url ? FEED.body : new TextEncoder().encode('{'),
      );
      m.createOrUpdateManySpy.mockImplementation((feeds) => Promise.resolve(feeds));

      const result = await FeedApplication.fetchFeeds(testUserId);

      expect(result.map((feed) => feed.id)).toEqual([FEED.id]);
    });

    it('skips a feed whose read fails and keeps the others', async () => {
      const m = setupMocks();
      m.loggerWarnSpy.mockImplementation(() => {});
      m.listSpy.mockResolvedValue([FEED.url, EXISTING.url]);
      vi.mocked(HomeserverService.getBytes).mockImplementation(async (url) => {
        if (url === FEED.url) return FEED.body;
        throw new Error('network');
      });
      m.createOrUpdateManySpy.mockImplementation((feeds) => Promise.resolve(feeds));

      expect((await FeedApplication.fetchFeeds(testUserId)).map((feed) => feed.id)).toEqual([FEED.id]);
    });

    it('admits a Me profile-tag feed and skips one with an unsupported reach', async () => {
      const me = built({ tags: [], domain_tags: ['bitcoiner'], reach: 'me' });
      const all = buildFeed(testUserId, {
        name: 'All with profile tags',
        icon: 'activity',
        reach: 'all',
        layout: 'columns',
        sort: 'recent',
        domain_tags: ['bitcoiner'],
      });
      const m = setupMocks();
      m.loggerWarnSpy.mockImplementation(() => {});
      m.listSpy.mockResolvedValue([me.url, all.url]);
      vi.mocked(HomeserverService.getBytes).mockImplementation(async (url) => (url === me.url ? me.body : all.body));
      m.createOrUpdateManySpy.mockImplementation((feeds) => Promise.resolve(feeds));

      expect((await FeedApplication.fetchFeeds(testUserId)).map((feed) => feed.id)).toEqual([me.id]);
    });

    it('returns no feeds for an empty directory without persisting', async () => {
      const m = setupMocks();
      m.listSpy.mockResolvedValue([]);

      expect(await FeedApplication.fetchFeeds(testUserId)).toEqual([]);
      expect(m.createOrUpdateManySpy).not.toHaveBeenCalled();
    });
  });
});
