import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Core from '@/core';
import { HttpMethod, Logger } from '@/libs';
import { LastReadResult } from 'pubky-app-specs';
import { NotificationApplication } from './notification';

const userId = 'pubky_user' as Core.Pubky;

const createFlat = (timestamp: number): Core.FlatNotification => {
  const type = Core.NotificationType.Follow;
  const followed_by = `user-${timestamp}`;
  return {
    id: `${type}:${timestamp}:${followed_by}`, // Business key
    type,
    timestamp,
    followed_by,
  } as Core.FlatNotification;
};

const createNexus = (timestamp: number): Core.NexusNotification => ({
  timestamp,
  body: { type: Core.NotificationType.Follow, followed_by: `user-${timestamp}` },
});

const mockNormalizer = () =>
  vi.spyOn(Core.NotificationNormalizer, 'toFlatNotification').mockImplementation((n) => createFlat(n.timestamp));

const mockFetchMissingEntities = () => {
  vi.spyOn(Core.LocalNotificationService, 'parseNotifications').mockReturnValue({
    relatedPostIds: [],
    relatedUserIds: [],
  });
  vi.spyOn(Core.LocalStreamPostsService, 'getNotPersistedPostsInCache').mockResolvedValue([]);
  vi.spyOn(Core.LocalStreamUsersService, 'getNotPersistedUsersInCache').mockResolvedValue([]);
  vi.spyOn(Core.PostStreamApplication, 'fetchMissingPostsFromNexus').mockResolvedValue(undefined);
  vi.spyOn(Core.UserStreamApplication, 'fetchMissingUsersFromNexus').mockResolvedValue(undefined);
};

describe('NotificationApplication.persistAndSummarize', () => {
  const lastRead = 1234;

  beforeEach(() => vi.clearAllMocks());

  it('should bulkSave, count unread, and return nextPollCursor', async () => {
    const notifications = [createNexus(2000), createNexus(1000)];
    const flatNotifications = [createFlat(2000), createFlat(1000)];
    const bulkSaveSpy = vi.spyOn(Core.LocalNotificationService, 'bulkSave').mockResolvedValue(undefined);
    const countSpy = vi.spyOn(Core.LocalNotificationService, 'countUnreadSince').mockResolvedValue(1);

    const result = await NotificationApplication.persistAndSummarize({ notifications, flatNotifications, lastRead });

    expect(bulkSaveSpy).toHaveBeenCalledWith({ flatNotifications });
    expect(countSpy).toHaveBeenCalledWith(lastRead);
    expect(result).toEqual({ unread: 1, nextPollCursor: 2001 });
  });

  it('should return nextPollCursor undefined when notifications are empty', async () => {
    vi.spyOn(Core.LocalNotificationService, 'bulkSave').mockResolvedValue(undefined);
    vi.spyOn(Core.LocalNotificationService, 'countUnreadSince').mockResolvedValue(0);

    const result = await NotificationApplication.persistAndSummarize({
      notifications: [],
      flatNotifications: [],
      lastRead,
    });

    expect(result).toEqual({ unread: 0, nextPollCursor: undefined });
  });

  it('should bubble bulkSave errors', async () => {
    vi.spyOn(Core.LocalNotificationService, 'bulkSave').mockRejectedValue(new Error('save-fail'));

    await expect(
      NotificationApplication.persistAndSummarize({
        notifications: [createNexus(1000)],
        flatNotifications: [createFlat(1000)],
        lastRead,
      }),
    ).rejects.toThrow('save-fail');
  });

  it('should bubble countUnreadSince errors', async () => {
    vi.spyOn(Core.LocalNotificationService, 'bulkSave').mockResolvedValue(undefined);
    vi.spyOn(Core.LocalNotificationService, 'countUnreadSince').mockRejectedValue(new Error('count-fail'));

    await expect(
      NotificationApplication.persistAndSummarize({
        notifications: [createNexus(1000)],
        flatNotifications: [createFlat(1000)],
        lastRead,
      }),
    ).rejects.toThrow('count-fail');
  });
});

describe('NotificationApplication.fetchNotifications', () => {
  const lastPolledTimestamp = 500;
  const lastRead = 1234;

  beforeEach(() => vi.clearAllMocks());

  it('should fetch, persist via bulkSave, count unread from IndexedDB, and return result', async () => {
    const notifications = [createNexus(2000), createNexus(1000)];
    const flatNotifications = [createFlat(2000), createFlat(1000)];
    const nexusSpy = vi.spyOn(Core.NexusUserService, 'notifications').mockResolvedValue(notifications);
    const bulkSaveSpy = vi.spyOn(Core.LocalNotificationService, 'bulkSave').mockResolvedValue(undefined);
    const countSpy = vi.spyOn(Core.LocalNotificationService, 'countUnreadSince').mockResolvedValue(1);
    mockNormalizer();
    mockFetchMissingEntities();

    const result = await NotificationApplication.fetchNotifications({ userId, lastPolledTimestamp, lastRead });

    expect(nexusSpy).toHaveBeenCalledWith({ user_id: userId, end: lastPolledTimestamp });
    expect(bulkSaveSpy).toHaveBeenCalledWith({ flatNotifications });
    expect(countSpy).toHaveBeenCalledWith(lastRead);
    expect(result).toEqual({ unread: 1, nextPollCursor: 2001 });
  });

  it('should use lastPolledTimestamp as Nexus end param, not lastRead', async () => {
    const nexusSpy = vi.spyOn(Core.NexusUserService, 'notifications').mockResolvedValue([]);
    vi.spyOn(Core.LocalNotificationService, 'bulkSave').mockResolvedValue(undefined);
    vi.spyOn(Core.LocalNotificationService, 'countUnreadSince').mockResolvedValue(0);
    mockNormalizer();
    mockFetchMissingEntities();

    await NotificationApplication.fetchNotifications({ userId, lastPolledTimestamp, lastRead });

    expect(nexusSpy).toHaveBeenCalledWith({ user_id: userId, end: lastPolledTimestamp });
  });

  it('should omit end param when lastPolledTimestamp is undefined (first poll after bootstrap with no notifications)', async () => {
    const nexusSpy = vi.spyOn(Core.NexusUserService, 'notifications').mockResolvedValue([]);
    vi.spyOn(Core.LocalNotificationService, 'bulkSave').mockResolvedValue(undefined);
    vi.spyOn(Core.LocalNotificationService, 'countUnreadSince').mockResolvedValue(0);
    mockNormalizer();
    mockFetchMissingEntities();

    await NotificationApplication.fetchNotifications({ userId, lastPolledTimestamp: undefined, lastRead });

    expect(nexusSpy).toHaveBeenCalledWith({ user_id: userId, end: undefined });
  });

  it('should return nextPollCursor undefined when Nexus returns empty array', async () => {
    vi.spyOn(Core.NexusUserService, 'notifications').mockResolvedValue([]);
    vi.spyOn(Core.LocalNotificationService, 'bulkSave').mockResolvedValue(undefined);
    vi.spyOn(Core.LocalNotificationService, 'countUnreadSince').mockResolvedValue(0);
    mockNormalizer();
    mockFetchMissingEntities();

    const result = await NotificationApplication.fetchNotifications({ userId, lastPolledTimestamp, lastRead });

    expect(result).toEqual({ unread: 0, nextPollCursor: undefined });
  });

  it('should bubble Nexus errors without persisting', async () => {
    vi.spyOn(Core.NexusUserService, 'notifications').mockRejectedValue(new Error('nexus-fail'));
    const bulkSaveSpy = vi.spyOn(Core.LocalNotificationService, 'bulkSave');

    await expect(NotificationApplication.fetchNotifications({ userId, lastPolledTimestamp, lastRead })).rejects.toThrow(
      'nexus-fail',
    );
    expect(bulkSaveSpy).not.toHaveBeenCalled();
  });

  it('should bubble bulkSave errors', async () => {
    vi.spyOn(Core.NexusUserService, 'notifications').mockResolvedValue([createNexus(2000)]);
    vi.spyOn(Core.LocalNotificationService, 'bulkSave').mockRejectedValue(new Error('save-fail'));
    mockNormalizer();
    mockFetchMissingEntities();

    await expect(NotificationApplication.fetchNotifications({ userId, lastPolledTimestamp, lastRead })).rejects.toThrow(
      'save-fail',
    );
  });

  it('should bubble countUnreadSince errors', async () => {
    vi.spyOn(Core.NexusUserService, 'notifications').mockResolvedValue([]);
    vi.spyOn(Core.LocalNotificationService, 'bulkSave').mockResolvedValue(undefined);
    vi.spyOn(Core.LocalNotificationService, 'countUnreadSince').mockRejectedValue(new Error('count-fail'));
    mockNormalizer();
    mockFetchMissingEntities();

    await expect(NotificationApplication.fetchNotifications({ userId, lastPolledTimestamp, lastRead })).rejects.toThrow(
      'count-fail',
    );
  });
});

describe('NotificationApplication.getOrFetchNotifications', () => {
  const limit = 10;

  beforeEach(() => vi.clearAllMocks());

  describe('full cache hit', () => {
    it('should return cached notifications without calling Nexus', async () => {
      const cached = Array.from({ length: limit }, (_, i) => createFlat(1000 - i * 10));
      vi.spyOn(Core.LocalNotificationService, 'getOlderThan').mockResolvedValue(cached);
      const nexusSpy = vi.spyOn(Core.NexusUserService, 'notifications');

      const result = await NotificationApplication.getOrFetchNotifications({ userId, olderThan: Infinity, limit });

      expect(result.flatNotifications).toEqual(cached);
      expect(result.olderThan).toBe(cached[cached.length - 1].timestamp);
      expect(nexusSpy).not.toHaveBeenCalled();
    });
  });

  describe('cache miss', () => {
    beforeEach(() => {
      vi.spyOn(Core.LocalNotificationService, 'getOlderThan').mockResolvedValue([]);
    });

    it('should fetch from Nexus and persist', async () => {
      const nexusData = [createNexus(500), createNexus(400)];
      vi.spyOn(Core.NexusUserService, 'notifications').mockResolvedValue(nexusData);
      mockNormalizer();
      mockFetchMissingEntities();
      const bulkSaveSpy = vi.spyOn(Core.LocalNotificationService, 'bulkSave').mockResolvedValue(undefined);

      const result = await NotificationApplication.getOrFetchNotifications({ userId, olderThan: Infinity, limit });

      expect(result.flatNotifications).toHaveLength(2);
      expect(bulkSaveSpy).toHaveBeenCalledOnce();
    });

    it('should call Nexus with user_id and limit', async () => {
      const nexusSpy = vi.spyOn(Core.NexusUserService, 'notifications').mockResolvedValue([]);
      mockNormalizer();
      mockFetchMissingEntities();

      await NotificationApplication.getOrFetchNotifications({ userId, olderThan: Infinity, limit });

      expect(nexusSpy).toHaveBeenCalledWith({ user_id: userId, limit });
    });

    it.each([
      { nexusResponse: [], desc: 'empty array' },
      { nexusResponse: null as unknown as Core.NexusNotification[], desc: 'null' },
    ])('should return empty response when Nexus returns $desc', async ({ nexusResponse }) => {
      vi.spyOn(Core.NexusUserService, 'notifications').mockResolvedValue(nexusResponse);
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

      vi.spyOn(Core.LocalNotificationService, 'getOlderThan').mockResolvedValue(cached);
      vi.spyOn(Core.NexusUserService, 'notifications').mockResolvedValue(nexusData);
      mockNormalizer();
      mockFetchMissingEntities();
      vi.spyOn(Core.LocalNotificationService, 'bulkSave').mockResolvedValue(undefined);

      const result = await NotificationApplication.getOrFetchNotifications({ userId, olderThan: Infinity, limit: 10 });

      expect(result.flatNotifications.map((n) => n.timestamp)).toEqual([1000, 900, 800, 700]);
    });

    it('should fetch remaining with correct limit using last cached timestamp', async () => {
      const cached = [createFlat(1000), createFlat(900)];
      vi.spyOn(Core.LocalNotificationService, 'getOlderThan').mockResolvedValue(cached);
      const nexusSpy = vi.spyOn(Core.NexusUserService, 'notifications').mockResolvedValue([]);
      mockNormalizer();
      mockFetchMissingEntities();

      await NotificationApplication.getOrFetchNotifications({ userId, olderThan: Infinity, limit: 10 });

      expect(nexusSpy).toHaveBeenCalledWith({ user_id: userId, limit: 8, start: 900 });
    });

    it('should deduplicate by id', async () => {
      const cached = [createFlat(1000), createFlat(900)];
      const nexusData = [createNexus(900), createNexus(800)]; // 900 is duplicate

      vi.spyOn(Core.LocalNotificationService, 'getOlderThan').mockResolvedValue(cached);
      vi.spyOn(Core.NexusUserService, 'notifications').mockResolvedValue(nexusData);
      mockNormalizer();
      mockFetchMissingEntities();
      vi.spyOn(Core.LocalNotificationService, 'bulkSave').mockResolvedValue(undefined);

      const result = await NotificationApplication.getOrFetchNotifications({ userId, olderThan: Infinity, limit: 10 });

      expect(result.flatNotifications.map((n) => n.timestamp)).toEqual([1000, 900, 800]);
    });
  });

  describe('error handling', () => {
    it('should log warning and return empty on Nexus failure', async () => {
      vi.spyOn(Core.LocalNotificationService, 'getOlderThan').mockResolvedValue([]);
      vi.spyOn(Core.NexusUserService, 'notifications').mockRejectedValue(new Error('network-error'));
      const loggerSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => {});

      const result = await NotificationApplication.getOrFetchNotifications({ userId, olderThan: Infinity, limit });

      expect(result).toEqual({ flatNotifications: [], olderThan: undefined });
      expect(loggerSpy).toHaveBeenCalledWith('Failed to fetch notifications from Nexus', expect.any(Object));
    });

    it('should gracefully handle bulkSave failure and still return notifications', async () => {
      vi.spyOn(Core.LocalNotificationService, 'getOlderThan').mockResolvedValue([]);
      vi.spyOn(Core.NexusUserService, 'notifications').mockResolvedValue([createNexus(1000)]);
      mockNormalizer();
      mockFetchMissingEntities();
      vi.spyOn(Core.LocalNotificationService, 'bulkSave').mockRejectedValue(new Error('db-error'));

      const result = await NotificationApplication.getOrFetchNotifications({ userId, olderThan: Infinity, limit });

      expect(result.flatNotifications).toHaveLength(1);
    });
  });
});

describe('NotificationApplication.markAllAsRead', () => {
  const mockTimestamp = 1234567890;
  const mockLastReadUrl = 'pubky://test-user/pub/pubky.app/last-read';

  beforeEach(() => vi.clearAllMocks());

  it('should send lastRead to homeserver', () => {
    const mockLastReadResult = {
      last_read: {
        timestamp: BigInt(mockTimestamp),
        toJson: vi.fn().mockReturnValue({ timestamp: mockTimestamp }),
      },
      meta: { url: mockLastReadUrl },
      free: vi.fn(),
    } as unknown as LastReadResult;

    const homeserverSpy = vi.spyOn(Core.HomeserverService, 'request').mockResolvedValue(undefined);

    NotificationApplication.markAllAsRead(mockLastReadResult);

    expect(homeserverSpy).toHaveBeenCalledWith({
      method: HttpMethod.PUT,
      url: mockLastReadUrl,
      bodyJson: mockLastReadResult.last_read.toJson(),
    });
  });

  it('should log warning if homeserver fails (fire and forget)', async () => {
    const mockLastReadResult = {
      last_read: {
        timestamp: BigInt(mockTimestamp),
        toJson: vi.fn().mockReturnValue({ timestamp: mockTimestamp }),
      },
      meta: { url: mockLastReadUrl },
      free: vi.fn(),
    } as unknown as LastReadResult;

    vi.spyOn(Core.HomeserverService, 'request').mockRejectedValue(new Error('homeserver-fail'));
    const loggerWarnSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => {});

    NotificationApplication.markAllAsRead(mockLastReadResult);

    // Wait for the catch to execute
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(loggerWarnSpy).toHaveBeenCalledWith('Failed to update lastRead on homeserver', { error: expect.any(Error) });
  });
});

describe('NotificationApplication.fetchMissingEntities', () => {
  const viewerId = 'viewer-user' as Core.Pubky;
  const relatedUserId = 'related-user' as Core.Pubky;
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

    vi.spyOn(Core.NotificationNormalizer, 'toFlatNotification').mockImplementation((n) => createFlat(n.timestamp));
    vi.spyOn(Core.LocalNotificationService, 'parseNotifications').mockReturnValue({
      relatedPostIds: [],
      relatedUserIds: [relatedUserId],
    });
    vi.spyOn(Core.LocalStreamPostsService, 'getNotPersistedPostsInCache').mockResolvedValue([]);
    vi.spyOn(Core.LocalStreamUsersService, 'getNotPersistedUsersInCache').mockResolvedValue([relatedUserId]);
    vi.spyOn(Core.PostStreamApplication, 'fetchMissingPostsFromNexus').mockResolvedValue(undefined);
    const fetchUsersSpy = vi
      .spyOn(Core.UserStreamApplication, 'fetchMissingUsersFromNexus')
      .mockResolvedValue(undefined);

    await NotificationApplication.fetchMissingEntities({ notifications, viewerId });

    // CRITICAL: viewerId must be passed to get correct relationship data
    expect(fetchUsersSpy).toHaveBeenCalledWith({
      cacheMissUserIds: [relatedUserId],
      viewerId, // This was missing before the fix!
    });
  });

  it('should pass viewerId when fetching missing posts', async () => {
    const notifications = [createNexus(1000)];

    vi.spyOn(Core.NotificationNormalizer, 'toFlatNotification').mockImplementation((n) => createFlat(n.timestamp));
    vi.spyOn(Core.LocalNotificationService, 'parseNotifications').mockReturnValue({
      relatedPostIds: [relatedPostId],
      relatedUserIds: [],
    });
    vi.spyOn(Core.LocalStreamPostsService, 'getNotPersistedPostsInCache').mockResolvedValue([relatedPostId]);
    vi.spyOn(Core.LocalStreamUsersService, 'getNotPersistedUsersInCache').mockResolvedValue([]);
    const fetchPostsSpy = vi
      .spyOn(Core.PostStreamApplication, 'fetchMissingPostsFromNexus')
      .mockResolvedValue(undefined);
    vi.spyOn(Core.UserStreamApplication, 'fetchMissingUsersFromNexus').mockResolvedValue(undefined);

    await NotificationApplication.fetchMissingEntities({ notifications, viewerId });

    expect(fetchPostsSpy).toHaveBeenCalledWith({
      cacheMissPostIds: [relatedPostId],
      viewerId,
    });
  });

  it('should not fetch when all entities are already cached', async () => {
    const notifications = [createNexus(1000)];

    vi.spyOn(Core.NotificationNormalizer, 'toFlatNotification').mockImplementation((n) => createFlat(n.timestamp));
    vi.spyOn(Core.LocalNotificationService, 'parseNotifications').mockReturnValue({
      relatedPostIds: [relatedPostId],
      relatedUserIds: [relatedUserId],
    });
    // All entities are already cached
    vi.spyOn(Core.LocalStreamPostsService, 'getNotPersistedPostsInCache').mockResolvedValue([]);
    vi.spyOn(Core.LocalStreamUsersService, 'getNotPersistedUsersInCache').mockResolvedValue([]);
    const fetchPostsSpy = vi
      .spyOn(Core.PostStreamApplication, 'fetchMissingPostsFromNexus')
      .mockResolvedValue(undefined);
    const fetchUsersSpy = vi
      .spyOn(Core.UserStreamApplication, 'fetchMissingUsersFromNexus')
      .mockResolvedValue(undefined);

    await NotificationApplication.fetchMissingEntities({ notifications, viewerId });

    expect(fetchPostsSpy).not.toHaveBeenCalled();
    expect(fetchUsersSpy).not.toHaveBeenCalled();
  });
});

describe('NotificationApplication.getAllFromCache', () => {
  const createFlat = (timestamp: number): Core.FlatNotification =>
    ({ type: Core.NotificationType.Follow, timestamp, followed_by: `user-${timestamp}` }) as Core.FlatNotification;

  beforeEach(() => vi.clearAllMocks());

  it('should delegate to LocalNotificationService.getAll', async () => {
    const expected = [createFlat(3000), createFlat(2000), createFlat(1000)];
    const serviceSpy = vi.spyOn(Core.LocalNotificationService, 'getAll').mockResolvedValue(expected);

    const result = await NotificationApplication.getAllFromCache();

    expect(serviceSpy).toHaveBeenCalled();
    expect(result).toEqual(expected);
  });

  it('should return empty array when no notifications exist', async () => {
    vi.spyOn(Core.LocalNotificationService, 'getAll').mockResolvedValue([]);

    const result = await NotificationApplication.getAllFromCache();

    expect(result).toEqual([]);
  });

  it('should bubble service errors', async () => {
    vi.spyOn(Core.LocalNotificationService, 'getAll').mockRejectedValue(new Error('service-fail'));

    await expect(NotificationApplication.getAllFromCache()).rejects.toThrow('service-fail');
  });
});
