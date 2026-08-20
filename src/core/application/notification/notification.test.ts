import { LastReadResult } from 'pubky-app-specs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostStreamApplication } from '@/application/stream/posts/post';
import { UserStreamApplication } from '@/application/stream/users/users';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { type FlatNotification, NotificationType } from '@/models/notification/notification.types';
import { NotificationNormalizer } from '@/pipes/notification/notification.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalNotificationService } from '@/services/local/notification/notification';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import type { NexusNotification } from '@/services/nexus/nexus.types';
import { NexusUserService } from '@/services/nexus/user/user';
import { asInvalid, asOpaque } from '@/test-utils/type-assertions';
import { NotificationApplication } from './notification';

const userId = 'pubky_user' as Pubky;

const createFlat = (timestamp: number): FlatNotification => {
  const type = NotificationType.Follow;
  const followed_by = `user-${timestamp}`;
  return {
    id: `${type}:${timestamp}:${followed_by}`, // Business key
    type,
    timestamp,
    followed_by,
  } as FlatNotification;
};

const createReplyFlat = (timestamp: number): FlatNotification =>
  ({
    id: `reply:${timestamp}:user-${timestamp}`,
    type: NotificationType.Reply,
    timestamp,
    replied_by: `user-${timestamp}`,
    parent_post_uri: 'pubky://post/1',
    reply_uri: 'pubky://post/2',
  }) as FlatNotification;

const createNexus = (timestamp: number): NexusNotification => ({
  timestamp,
  body: { type: NotificationType.Follow, followed_by: `user-${timestamp}` },
});

const createNexusReply = (timestamp: number): NexusNotification => ({
  timestamp,
  body: {
    type: NotificationType.Reply,
    replied_by: `user-${timestamp}`,
    parent_post_uri: 'pubky://post/1',
    reply_uri: 'pubky://post/2',
  },
});

const mockNormalizer = () =>
  vi.spyOn(NotificationNormalizer, 'toFlatNotification').mockImplementation((n) => createFlat(n.timestamp));

const mockNormalizerWithReply = () =>
  vi
    .spyOn(NotificationNormalizer, 'toFlatNotification')
    .mockImplementation((n) =>
      n.body.type === NotificationType.Reply ? createReplyFlat(n.timestamp) : createFlat(n.timestamp),
    );

const mockFetchMissingEntities = () => {
  vi.spyOn(LocalNotificationService, 'parseNotifications').mockReturnValue({
    relatedPostIds: [],
    relatedUserIds: [],
  });
  vi.spyOn(LocalStreamPostsService, 'getNotPersistedPostsInCache').mockResolvedValue([]);
  vi.spyOn(LocalStreamUsersService, 'getNotPersistedUsersInCache').mockResolvedValue([]);
  vi.spyOn(PostStreamApplication, 'fetchMissingPostsFromNexus').mockResolvedValue(undefined);
  vi.spyOn(UserStreamApplication, 'fetchMissingUsersFromNexus').mockResolvedValue(undefined);
};

describe('NotificationApplication.persistAndSummarize', () => {
  const lastRead = 1234;
  const allowedTypes = Object.values(NotificationType);

  beforeEach(() => vi.restoreAllMocks());

  it('should bulkSave, count filtered unread, and return nextPollCursor', async () => {
    const notifications = [createNexus(2000), createNexus(1000)];
    const flatNotifications = [createFlat(2000), createFlat(1000)];
    mockNormalizer();
    const bulkSaveSpy = vi.spyOn(LocalNotificationService, 'bulkSave').mockResolvedValue(undefined);
    const countSpy = vi.spyOn(LocalNotificationService, 'countFilteredUnreadSince').mockResolvedValue(1);

    const result = await NotificationApplication.persistAndSummarize({ notifications, lastRead, allowedTypes });

    expect(bulkSaveSpy).toHaveBeenCalledWith({ flatNotifications });
    expect(countSpy).toHaveBeenCalledWith(lastRead, allowedTypes);
    expect(result).toEqual({ unread: 1, nextPollCursor: 2001 });
  });

  it('should return nextPollCursor undefined when notifications are empty', async () => {
    mockNormalizer();
    vi.spyOn(LocalNotificationService, 'bulkSave').mockResolvedValue(undefined);
    vi.spyOn(LocalNotificationService, 'countFilteredUnreadSince').mockResolvedValue(0);

    const result = await NotificationApplication.persistAndSummarize({ notifications: [], lastRead, allowedTypes });

    expect(result).toEqual({ unread: 0, nextPollCursor: undefined });
  });

  it('should bubble bulkSave errors', async () => {
    mockNormalizer();
    vi.spyOn(LocalNotificationService, 'bulkSave').mockRejectedValue(new Error('save-fail'));

    await expect(
      NotificationApplication.persistAndSummarize({ notifications: [createNexus(1000)], lastRead, allowedTypes }),
    ).rejects.toThrow('save-fail');
  });

  it('should bubble countFilteredUnreadSince errors', async () => {
    mockNormalizer();
    vi.spyOn(LocalNotificationService, 'bulkSave').mockResolvedValue(undefined);
    vi.spyOn(LocalNotificationService, 'countFilteredUnreadSince').mockRejectedValue(new Error('count-fail'));

    await expect(
      NotificationApplication.persistAndSummarize({ notifications: [createNexus(1000)], lastRead, allowedTypes }),
    ).rejects.toThrow('count-fail');
  });
});

describe('NotificationApplication.fetchNotifications', () => {
  const lastPolledTimestamp = 500;
  const lastRead = 1234;
  const allowedTypes = Object.values(NotificationType);
  const fetchParams = { userId, lastPolledTimestamp, lastRead, allowedTypes };

  beforeEach(() => vi.clearAllMocks());

  it('should fetch, persist via bulkSave, count filtered unread from IndexedDB, and return result', async () => {
    const notifications = [createNexus(2000), createNexus(1000)];
    const flatNotifications = [createFlat(2000), createFlat(1000)];
    const nexusSpy = vi.spyOn(NexusUserService, 'notifications').mockResolvedValue(notifications);
    const bulkSaveSpy = vi.spyOn(LocalNotificationService, 'bulkSave').mockResolvedValue(undefined);
    const countSpy = vi.spyOn(LocalNotificationService, 'countFilteredUnreadSince').mockResolvedValue(1);
    mockNormalizer();
    mockFetchMissingEntities();

    const result = await NotificationApplication.fetchNotifications(fetchParams);

    expect(nexusSpy).toHaveBeenCalledWith({ user_id: userId, end: lastPolledTimestamp });
    expect(bulkSaveSpy).toHaveBeenCalledWith({ flatNotifications });
    expect(countSpy).toHaveBeenCalledWith(lastRead, expect.arrayContaining(Object.values(NotificationType)));
    expect(result).toEqual({ unread: 1, nextPollCursor: 2001 });
  });

  it('should use lastPolledTimestamp as Nexus end param, not lastRead', async () => {
    const nexusSpy = vi.spyOn(NexusUserService, 'notifications').mockResolvedValue([]);
    vi.spyOn(LocalNotificationService, 'bulkSave').mockResolvedValue(undefined);
    vi.spyOn(LocalNotificationService, 'countFilteredUnreadSince').mockResolvedValue(0);
    mockNormalizer();
    mockFetchMissingEntities();

    await NotificationApplication.fetchNotifications(fetchParams);

    expect(nexusSpy).toHaveBeenCalledWith({ user_id: userId, end: lastPolledTimestamp });
  });

  it('should omit end param when lastPolledTimestamp is undefined (first poll after bootstrap with no notifications)', async () => {
    const nexusSpy = vi.spyOn(NexusUserService, 'notifications').mockResolvedValue([]);
    vi.spyOn(LocalNotificationService, 'bulkSave').mockResolvedValue(undefined);
    vi.spyOn(LocalNotificationService, 'countFilteredUnreadSince').mockResolvedValue(0);
    mockNormalizer();
    mockFetchMissingEntities();

    await NotificationApplication.fetchNotifications({ ...fetchParams, lastPolledTimestamp: undefined });

    expect(nexusSpy).toHaveBeenCalledWith({ user_id: userId, end: undefined });
  });

  it('should return nextPollCursor undefined when Nexus returns empty array', async () => {
    vi.spyOn(NexusUserService, 'notifications').mockResolvedValue([]);
    vi.spyOn(LocalNotificationService, 'bulkSave').mockResolvedValue(undefined);
    vi.spyOn(LocalNotificationService, 'countFilteredUnreadSince').mockResolvedValue(0);
    mockNormalizer();
    mockFetchMissingEntities();

    const result = await NotificationApplication.fetchNotifications(fetchParams);

    expect(result).toEqual({ unread: 0, nextPollCursor: undefined });
  });

  it('should bubble Nexus errors without persisting', async () => {
    vi.spyOn(NexusUserService, 'notifications').mockRejectedValue(new Error('nexus-fail'));
    const bulkSaveSpy = vi.spyOn(LocalNotificationService, 'bulkSave');

    await expect(NotificationApplication.fetchNotifications(fetchParams)).rejects.toThrow('nexus-fail');
    expect(bulkSaveSpy).not.toHaveBeenCalled();
  });

  it('should bubble bulkSave errors', async () => {
    vi.spyOn(NexusUserService, 'notifications').mockResolvedValue([createNexus(2000)]);
    vi.spyOn(LocalNotificationService, 'bulkSave').mockRejectedValue(new Error('save-fail'));
    mockNormalizer();
    mockFetchMissingEntities();

    await expect(NotificationApplication.fetchNotifications(fetchParams)).rejects.toThrow('save-fail');
  });

  it('should bubble countFilteredUnreadSince errors', async () => {
    vi.spyOn(NexusUserService, 'notifications').mockResolvedValue([]);
    vi.spyOn(LocalNotificationService, 'bulkSave').mockResolvedValue(undefined);
    vi.spyOn(LocalNotificationService, 'countFilteredUnreadSince').mockRejectedValue(new Error('count-fail'));
    mockNormalizer();
    mockFetchMissingEntities();

    await expect(NotificationApplication.fetchNotifications(fetchParams)).rejects.toThrow('count-fail');
  });
});

describe('NotificationApplication.getOrFetchNotifications', () => {
  const limit = 10;

  beforeEach(() => vi.clearAllMocks());

  describe('full cache hit', () => {
    it('should return cached notifications without calling Nexus', async () => {
      const cached = Array.from({ length: limit }, (_, i) => createFlat(1000 - i * 10));
      vi.spyOn(LocalNotificationService, 'getOlderThan').mockResolvedValue(cached);
      const nexusSpy = vi.spyOn(NexusUserService, 'notifications');

      const result = await NotificationApplication.getOrFetchNotifications({ userId, olderThan: Infinity, limit });

      expect(result.flatNotifications).toEqual(cached);
      expect(result.olderThan).toBe(cached[cached.length - 1].timestamp);
      expect(nexusSpy).not.toHaveBeenCalled();
    });
  });

  describe('cache miss', () => {
    beforeEach(() => {
      vi.spyOn(LocalNotificationService, 'getOlderThan').mockResolvedValue([]);
    });

    it('should fetch from Nexus and persist', async () => {
      const nexusData = [createNexus(500), createNexus(400)];
      vi.spyOn(NexusUserService, 'notifications').mockResolvedValue(nexusData);
      mockNormalizer();
      mockFetchMissingEntities();
      const bulkSaveSpy = vi.spyOn(LocalNotificationService, 'bulkSave').mockResolvedValue(undefined);

      const result = await NotificationApplication.getOrFetchNotifications({ userId, olderThan: Infinity, limit });

      expect(result.flatNotifications).toHaveLength(2);
      expect(bulkSaveSpy).toHaveBeenCalledOnce();
    });

    it('should call Nexus with user_id and limit', async () => {
      const nexusSpy = vi.spyOn(NexusUserService, 'notifications').mockResolvedValue([]);
      mockNormalizer();
      mockFetchMissingEntities();

      await NotificationApplication.getOrFetchNotifications({ userId, olderThan: Infinity, limit });

      expect(nexusSpy).toHaveBeenCalledWith({ user_id: userId, limit });
    });

    it.each([
      { nexusResponse: [], desc: 'empty array' },
      { nexusResponse: asInvalid<NexusNotification[]>(null), desc: 'null' },
    ])('should return empty response when Nexus returns $desc', async ({ nexusResponse }) => {
      vi.spyOn(NexusUserService, 'notifications').mockResolvedValue(nexusResponse);
      mockNormalizer();
      mockFetchMissingEntities();

      const result = await NotificationApplication.getOrFetchNotifications({ userId, olderThan: Infinity, limit });

      expect(result.flatNotifications).toHaveLength(0);
      expect(result.olderThan).toBeUndefined();
    });
  });

  describe('partial cache hit', () => {
    it('should combine cached and fetched notifications', async () => {
      const cached = [createFlat(1000), createFlat(900)];
      const nexusData = [createNexus(800), createNexus(700)];

      vi.spyOn(LocalNotificationService, 'getOlderThan').mockResolvedValue(cached);
      vi.spyOn(NexusUserService, 'notifications').mockResolvedValue(nexusData);
      mockNormalizer();
      mockFetchMissingEntities();
      vi.spyOn(LocalNotificationService, 'bulkSave').mockResolvedValue(undefined);

      const result = await NotificationApplication.getOrFetchNotifications({ userId, olderThan: Infinity, limit: 10 });

      expect(result.flatNotifications.map((n) => n.timestamp)).toEqual([1000, 900, 800, 700]);
    });

    it('should fetch remaining with correct limit using last cached timestamp', async () => {
      const cached = [createFlat(1000), createFlat(900)];
      vi.spyOn(LocalNotificationService, 'getOlderThan').mockResolvedValue(cached);
      const nexusSpy = vi.spyOn(NexusUserService, 'notifications').mockResolvedValue([]);
      mockNormalizer();
      mockFetchMissingEntities();

      await NotificationApplication.getOrFetchNotifications({ userId, olderThan: Infinity, limit: 10 });

      expect(nexusSpy).toHaveBeenCalledWith({ user_id: userId, limit: 8, start: 900 });
    });

    it('should deduplicate by id', async () => {
      const cached = [createFlat(1000), createFlat(900)];
      const nexusData = [createNexus(900), createNexus(800)]; // 900 is duplicate

      vi.spyOn(LocalNotificationService, 'getOlderThan').mockResolvedValue(cached);
      vi.spyOn(NexusUserService, 'notifications').mockResolvedValue(nexusData);
      mockNormalizer();
      mockFetchMissingEntities();
      vi.spyOn(LocalNotificationService, 'bulkSave').mockResolvedValue(undefined);

      const result = await NotificationApplication.getOrFetchNotifications({ userId, olderThan: Infinity, limit: 10 });

      expect(result.flatNotifications.map((n) => n.timestamp)).toEqual([1000, 900, 800]);
    });
  });

  describe('error handling', () => {
    it('should log warning and return empty on Nexus failure', async () => {
      vi.spyOn(LocalNotificationService, 'getOlderThan').mockResolvedValue([]);
      vi.spyOn(NexusUserService, 'notifications').mockRejectedValue(new Error('network-error'));
      const loggerSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => {});

      const result = await NotificationApplication.getOrFetchNotifications({ userId, olderThan: Infinity, limit });

      expect(result).toEqual({ flatNotifications: [], olderThan: undefined });
      expect(loggerSpy).toHaveBeenCalledWith('Failed to fetch notifications from Nexus', expect.any(Object));
    });

    it('should gracefully handle bulkSave failure and still return notifications', async () => {
      vi.spyOn(LocalNotificationService, 'getOlderThan').mockResolvedValue([]);
      vi.spyOn(NexusUserService, 'notifications').mockResolvedValue([createNexus(1000)]);
      mockNormalizer();
      mockFetchMissingEntities();
      vi.spyOn(LocalNotificationService, 'bulkSave').mockRejectedValue(new Error('db-error'));

      const result = await NotificationApplication.getOrFetchNotifications({ userId, olderThan: Infinity, limit });

      expect(result.flatNotifications).toHaveLength(1);
    });
  });
});

describe('NotificationApplication.getOrFetchNotifications (filtered pagination)', () => {
  const limit = 30;
  const allTypes = Object.values(NotificationType);
  const replyOnly = [NotificationType.Reply];

  beforeEach(() => vi.clearAllMocks());

  it('should return immediately when filtered results are found on first page', async () => {
    vi.spyOn(LocalNotificationService, 'getOlderThan').mockResolvedValue([createFlat(3000)]);
    vi.spyOn(NexusUserService, 'notifications').mockResolvedValue([]);
    mockNormalizer();
    mockFetchMissingEntities();

    const result = await NotificationApplication.getOrFetchNotifications({
      userId,
      olderThan: Infinity,
      limit,
      allowedTypes: allTypes,
    });

    expect(result.flatNotifications).toHaveLength(1);
    expect(result.olderThan).toBeUndefined();
  });

  it('should fetch next pages when filter removes all items from a page', async () => {
    const getOlderThanSpy = vi.spyOn(LocalNotificationService, 'getOlderThan').mockResolvedValue([]);

    vi.spyOn(NexusUserService, 'notifications')
      .mockResolvedValueOnce([createNexus(3000)]) // create a Follow notification which will be filtered out
      .mockResolvedValueOnce([createNexusReply(2000)]) // create a Reply notification which is allowed by filter
      .mockResolvedValueOnce([]); // no more notifications to fetch

    mockNormalizerWithReply();
    mockFetchMissingEntities();
    vi.spyOn(LocalNotificationService, 'bulkSave').mockResolvedValue(undefined);

    const result = await NotificationApplication.getOrFetchNotifications({
      userId,
      olderThan: Infinity,
      limit,
      allowedTypes: replyOnly,
    });

    expect(getOlderThanSpy).toHaveBeenCalledTimes(3); // first page filtered out, second page yields reply, third stops
    expect(getOlderThanSpy).toHaveBeenNthCalledWith(2, { olderThan: 2999, limit });
    expect(result.flatNotifications).toHaveLength(1);
    expect(result.flatNotifications[0].type).toBe(NotificationType.Reply);
    expect(result.olderThan).toBeUndefined(); // no more pages to fetch
  });

  it('should stop when no more pages exist even if filtered result is empty', async () => {
    vi.spyOn(LocalNotificationService, 'getOlderThan').mockResolvedValue([createFlat(1000)]); // cache hit: returns a Follow from local DB
    vi.spyOn(NexusUserService, 'notifications').mockResolvedValue([]); // meaning no more notifications to fetch
    mockNormalizer();
    mockFetchMissingEntities();

    const result = await NotificationApplication.getOrFetchNotifications({
      userId,
      olderThan: Infinity,
      limit,
      allowedTypes: replyOnly,
    });

    expect(result.flatNotifications).toHaveLength(0);
    expect(result.olderThan).toBeUndefined(); // no more pages to fetch
  });

  it('should accumulate filtered results across pages until limit is filled', async () => {
    vi.spyOn(LocalNotificationService, 'getOlderThan').mockResolvedValue([]); // cache miss: nothing in local DB for this page
    vi.spyOn(NexusUserService, 'notifications')
      .mockResolvedValueOnce([createNexusReply(5000)])
      .mockResolvedValueOnce([createNexusReply(4000)]);
    mockNormalizerWithReply();
    mockFetchMissingEntities();
    vi.spyOn(LocalNotificationService, 'bulkSave').mockResolvedValue(undefined);

    const result = await NotificationApplication.getOrFetchNotifications({
      userId,
      olderThan: Infinity,
      limit: 2, // Request exactly two filtered items; collection should stop once two replies are found.
      allowedTypes: replyOnly,
    });

    expect(result.flatNotifications).toHaveLength(2);
    expect(result.olderThan).toBe(3999);
  });

  it('should set cursor from last included item when page has more matches than remaining', async () => {
    // Scenario: limit = 2, filter = Reply only
    //
    // Round 1: Nexus returns [Reply:5000, Reply:4000, Reply:3000]
    //   (numbers are timestamps, descending = newest first)
    //   - All 3 pass the filter, but we only need 2 (remaining = 2)
    //   - collected = [Reply:5000, Reply:4000] (sliced to remaining)
    //   - raw page olderThan = 2999 (oldest item timestamp - 1)
    //
    // BUG (before fix): cursor = 2999 (end of raw page)
    //   → "load more" starts at 2999 → Reply:3000 is SKIPPED forever
    //
    // EXPECTED (after fix): cursor = 3999 (last included item timestamp - 1)
    //   → "load more" starts at 3999 → Reply:3000 is reachable on the next page
    vi.spyOn(LocalNotificationService, 'getOlderThan').mockResolvedValue([]);
    vi.spyOn(NexusUserService, 'notifications').mockResolvedValueOnce([
      createNexusReply(5000),
      createNexusReply(4000),
      createNexusReply(3000),
    ]);
    mockNormalizerWithReply();
    mockFetchMissingEntities();
    vi.spyOn(LocalNotificationService, 'bulkSave').mockResolvedValue(undefined);

    const result = await NotificationApplication.getOrFetchNotifications({
      userId,
      olderThan: Infinity,
      limit: 2,
      allowedTypes: replyOnly,
    });

    expect(result.flatNotifications).toHaveLength(2);
    // Cursor must point after the last INCLUDED item (4000), not the last raw item (3000)
    // so that Reply:3000 is reachable on the next "load more" call.
    expect(result.olderThan).toBe(3999);
  });

  it('should stop after MAX_FETCH_ROUNDS even if no results pass the filter', async () => {
    const getOlderThanSpy = vi.spyOn(LocalNotificationService, 'getOlderThan').mockResolvedValue([]); // cache miss: nothing in local DB for this page
    vi.spyOn(NexusUserService, 'notifications').mockResolvedValue([createNexus(1000)]);
    mockNormalizer();
    mockFetchMissingEntities();
    vi.spyOn(LocalNotificationService, 'bulkSave').mockResolvedValue(undefined);

    const result = await NotificationApplication.getOrFetchNotifications({
      userId,
      olderThan: Infinity,
      limit,
      allowedTypes: replyOnly,
    });

    expect(getOlderThanSpy).toHaveBeenCalledTimes(10); // MAX_FETCH_ROUNDS = 10
    expect(result.flatNotifications).toHaveLength(0);
    expect(result.olderThan).toBe(999);
  });

  it('should return empty when first page returns no notifications', async () => {
    const getOlderThanSpy = vi.spyOn(LocalNotificationService, 'getOlderThan').mockResolvedValue([]); // No local items for this page.
    vi.spyOn(NexusUserService, 'notifications').mockResolvedValue([]); // Nexus also has no items to return.
    mockNormalizer();
    mockFetchMissingEntities();

    const result = await NotificationApplication.getOrFetchNotifications({
      userId,
      olderThan: Infinity,
      limit,
      allowedTypes: allTypes,
    });

    expect(getOlderThanSpy).toHaveBeenCalledTimes(1);
    expect(result.flatNotifications).toHaveLength(0);
    expect(result.olderThan).toBeUndefined();
  });

  it('should return empty when allowedTypes is empty', async () => {
    const disabledAll: NotificationType[] = [];
    const getOlderThanSpy = vi.spyOn(LocalNotificationService, 'getOlderThan');
    const nexusSpy = vi.spyOn(NexusUserService, 'notifications');

    const result = await NotificationApplication.getOrFetchNotifications({
      userId,
      olderThan: Infinity,
      limit,
      allowedTypes: disabledAll,
    });

    expect(getOlderThanSpy).not.toHaveBeenCalled();
    expect(nexusSpy).not.toHaveBeenCalled();
    expect(result.flatNotifications).toHaveLength(0);
    expect(result.olderThan).toBeUndefined();
  });
});

describe('NotificationApplication.markAllAsRead', () => {
  const mockTimestamp = 1234567890;
  const mockLastReadUrl = 'pubky://test-user/pub/pubky.app/last-read';

  beforeEach(() => vi.clearAllMocks());

  it('should send lastRead to homeserver', async () => {
    const mockLastReadResult = asOpaque<LastReadResult>({
      last_read: {
        timestamp: BigInt(mockTimestamp),
        toJson: vi.fn().mockReturnValue({ timestamp: mockTimestamp }),
      },
      meta: { url: mockLastReadUrl },
      free: vi.fn(),
    });

    const homeserverSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    await NotificationApplication.markAllAsRead(mockLastReadResult);

    expect(homeserverSpy).toHaveBeenCalledWith({
      method: HttpMethod.PUT,
      url: mockLastReadUrl,
      bodyJson: mockLastReadResult.last_read.toJson(),
    });
  });

  it('should propagate homeserver failures to the caller', async () => {
    const mockLastReadResult = asOpaque<LastReadResult>({
      last_read: {
        timestamp: BigInt(mockTimestamp),
        toJson: vi.fn().mockReturnValue({ timestamp: mockTimestamp }),
      },
      meta: { url: mockLastReadUrl },
      free: vi.fn(),
    });

    vi.spyOn(HomeserverService, 'request').mockRejectedValue(new Error('homeserver-fail'));

    await expect(NotificationApplication.markAllAsRead(mockLastReadResult)).rejects.toThrow('homeserver-fail');
  });
});

describe('NotificationApplication.fetchMissingEntities', () => {
  const viewerId = 'viewer-user' as Pubky;
  const relatedUserId = 'related-user' as Pubky;
  const relatedPostId = 'related-post';

  beforeEach(() => vi.clearAllMocks());

  it('should pass viewerId when fetching missing users to ensure correct relationship data', async () => {
    // This test verifies the fix for the bug where users in the Following list
    // showed "Follow" button instead of "Following" after logout/login cycles.
    //
    // Bug scenario:
    // 1. Profile 1 follows Profile 2
    // 2. Profile 1 signs out
    // 3. Profile 2 logs in and follows Profile 1
    // 4. Profile 2 signs out
    // 5. Profile 1 logs in, notifications are fetched
    // 6. Profile 2 is fetched WITHOUT viewerId -> relationship.following = false (wrong!)
    // 7. Profile 1 views Following list -> Profile 2 shows "Follow" instead of "Following"
    //
    // The fix: Pass viewerId to fetchMissingUsersFromNexus so Nexus returns
    // the correct relationship from the viewer's perspective.
    const notifications = [createNexus(1000)];

    vi.spyOn(NotificationNormalizer, 'toFlatNotification').mockImplementation((n) => createFlat(n.timestamp));
    vi.spyOn(LocalNotificationService, 'parseNotifications').mockReturnValue({
      relatedPostIds: [],
      relatedUserIds: [relatedUserId],
    });
    vi.spyOn(LocalStreamPostsService, 'getNotPersistedPostsInCache').mockResolvedValue([]);
    vi.spyOn(LocalStreamUsersService, 'getNotPersistedUsersInCache').mockResolvedValue([relatedUserId]);
    vi.spyOn(PostStreamApplication, 'fetchMissingPostsFromNexus').mockResolvedValue(undefined);
    const fetchUsersSpy = vi.spyOn(UserStreamApplication, 'fetchMissingUsersFromNexus').mockResolvedValue(undefined);

    await NotificationApplication.fetchMissingEntities({ notifications, viewerId });

    // CRITICAL: viewerId must be passed to get correct relationship data
    expect(fetchUsersSpy).toHaveBeenCalledWith({
      cacheMissUserIds: [relatedUserId],
      viewerId, // This was missing before the fix!
    });
  });

  it('should pass viewerId when fetching missing posts', async () => {
    const notifications = [createNexus(1000)];

    vi.spyOn(NotificationNormalizer, 'toFlatNotification').mockImplementation((n) => createFlat(n.timestamp));
    vi.spyOn(LocalNotificationService, 'parseNotifications').mockReturnValue({
      relatedPostIds: [relatedPostId],
      relatedUserIds: [],
    });
    vi.spyOn(LocalStreamPostsService, 'getNotPersistedPostsInCache').mockResolvedValue([relatedPostId]);
    vi.spyOn(LocalStreamUsersService, 'getNotPersistedUsersInCache').mockResolvedValue([]);
    const fetchPostsSpy = vi.spyOn(PostStreamApplication, 'fetchMissingPostsFromNexus').mockResolvedValue(undefined);
    vi.spyOn(UserStreamApplication, 'fetchMissingUsersFromNexus').mockResolvedValue(undefined);

    await NotificationApplication.fetchMissingEntities({ notifications, viewerId });

    expect(fetchPostsSpy).toHaveBeenCalledWith({
      cacheMissPostIds: [relatedPostId],
      viewerId,
    });
  });

  it('should not fetch when all entities are already cached', async () => {
    const notifications = [createNexus(1000)];

    vi.spyOn(NotificationNormalizer, 'toFlatNotification').mockImplementation((n) => createFlat(n.timestamp));
    vi.spyOn(LocalNotificationService, 'parseNotifications').mockReturnValue({
      relatedPostIds: [relatedPostId],
      relatedUserIds: [relatedUserId],
    });
    // All entities are already cached
    vi.spyOn(LocalStreamPostsService, 'getNotPersistedPostsInCache').mockResolvedValue([]);
    vi.spyOn(LocalStreamUsersService, 'getNotPersistedUsersInCache').mockResolvedValue([]);
    const fetchPostsSpy = vi.spyOn(PostStreamApplication, 'fetchMissingPostsFromNexus').mockResolvedValue(undefined);
    const fetchUsersSpy = vi.spyOn(UserStreamApplication, 'fetchMissingUsersFromNexus').mockResolvedValue(undefined);

    await NotificationApplication.fetchMissingEntities({ notifications, viewerId });

    expect(fetchPostsSpy).not.toHaveBeenCalled();
    expect(fetchUsersSpy).not.toHaveBeenCalled();
  });

  it('refetches edited posts even on a cache hit, so rows never show pre-edit content', async () => {
    // The cached copy predates the edit by definition — the notification is the proof —
    // and the local-first read path never revalidates a cache hit on its own.
    const notifications = [createNexus(1000)];
    const editedFlat = {
      id: 'post_edited:1000:author',
      type: NotificationType.PostEdited,
      timestamp: 1000,
      edited_by: 'author',
      edited_uri: 'pubky://author/pub/pubky.app/posts/edited-post',
      linked_uri: 'pubky://viewer/pub/pubky.app/posts/linked-post',
    } as FlatNotification;

    vi.spyOn(NotificationNormalizer, 'toFlatNotification').mockReturnValue(editedFlat);
    vi.spyOn(LocalNotificationService, 'parseNotifications').mockReturnValue({
      relatedPostIds: ['author:edited-post'],
      relatedUserIds: [],
    });
    // The edited post is already cached — nothing is "missing".
    vi.spyOn(LocalStreamPostsService, 'getNotPersistedPostsInCache').mockResolvedValue([]);
    vi.spyOn(LocalStreamUsersService, 'getNotPersistedUsersInCache').mockResolvedValue([]);
    const fetchPostsSpy = vi.spyOn(PostStreamApplication, 'fetchMissingPostsFromNexus').mockResolvedValue(undefined);
    vi.spyOn(UserStreamApplication, 'fetchMissingUsersFromNexus').mockResolvedValue(undefined);

    await NotificationApplication.fetchMissingEntities({ notifications, viewerId });

    expect(fetchPostsSpy).toHaveBeenCalledWith({
      cacheMissPostIds: ['author:edited-post'],
      viewerId,
    });
  });
});

describe('NotificationApplication.getAllFromCache', () => {
  const createFlat = (timestamp: number): FlatNotification =>
    ({ type: NotificationType.Follow, timestamp, followed_by: `user-${timestamp}` }) as FlatNotification;

  beforeEach(() => vi.clearAllMocks());

  it('should delegate to LocalNotificationService.getAll', async () => {
    const expected = [createFlat(3000), createFlat(2000), createFlat(1000)];
    const serviceSpy = vi.spyOn(LocalNotificationService, 'getAll').mockResolvedValue(expected);

    const result = await NotificationApplication.getAllFromCache();

    expect(serviceSpy).toHaveBeenCalled();
    expect(result).toEqual(expected);
  });

  it('should return empty array when no notifications exist', async () => {
    vi.spyOn(LocalNotificationService, 'getAll').mockResolvedValue([]);

    const result = await NotificationApplication.getAllFromCache();

    expect(result).toEqual([]);
  });

  it('should bubble service errors', async () => {
    vi.spyOn(LocalNotificationService, 'getAll').mockRejectedValue(new Error('service-fail'));

    await expect(NotificationApplication.getAllFromCache()).rejects.toThrow('service-fail');
  });
});
