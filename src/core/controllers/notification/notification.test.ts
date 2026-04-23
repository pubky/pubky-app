import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotificationController } from './notification';
import * as Core from '@/core';
import * as Config from '@/config';
import { mockAuthStore, mockNotificationStore, asOpaque } from '@/test-utils';

const mockUserId = 'pubky-user-123' as Core.Pubky;

const setupAuthStore = (userId: Core.Pubky = mockUserId) => {
  vi.spyOn(Core.useAuthStore, 'getState').mockReturnValue(mockAuthStore({ selectCurrentUserPubky: () => userId }));
};

describe('NotificationController', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  describe('fetchNotifications', () => {
    const setupNotificationStore = ({
      lastRead,
      lastPolledTimestamp,
    }: {
      lastRead: number;
      lastPolledTimestamp: number;
    }) => {
      const selectLastRead = vi.fn(() => lastRead);
      const selectLastPolledTimestamp = vi.fn(() => lastPolledTimestamp);
      const setUnread = vi.fn();
      const setLastPolledTimestamp = vi.fn();
      vi.spyOn(Core.useNotificationStore, 'getState').mockReturnValue(
        mockNotificationStore({
          selectLastRead,
          selectLastPolledTimestamp,
          setUnread,
          setLastPolledTimestamp,
        }),
      );
      return { selectLastRead, selectLastPolledTimestamp, setUnread, setLastPolledTimestamp };
    };

    it('should poll notifications, update unread count, and advance lastPolledTimestamp', async () => {
      const store = setupNotificationStore({ lastRead: 1234, lastPolledTimestamp: 500 });
      const appSpy = vi.spyOn(Core.NotificationApplication, 'fetchNotifications').mockResolvedValue({
        unread: 5,
        nextPollCursor: 3000,
      });

      await NotificationController.fetchNotifications({ userId: mockUserId });

      expect(appSpy).toHaveBeenCalledWith({ userId: mockUserId, lastPolledTimestamp: 500, lastRead: 1234 });
      expect(store.setUnread).toHaveBeenCalledWith(5);
      expect(store.setLastPolledTimestamp).toHaveBeenCalledWith(3000);
    });

    it('should pass lastPolledTimestamp (not lastRead) to application', async () => {
      setupNotificationStore({ lastRead: 9000, lastPolledTimestamp: 2000 });
      const appSpy = vi.spyOn(Core.NotificationApplication, 'fetchNotifications').mockResolvedValue({
        unread: 0,
        nextPollCursor: undefined,
      });

      await NotificationController.fetchNotifications({ userId: mockUserId });

      expect(appSpy).toHaveBeenCalledWith(expect.objectContaining({ lastPolledTimestamp: 2000, lastRead: 9000 }));
    });

    it('should not call setLastPolledTimestamp when nextPollCursor is undefined', async () => {
      const store = setupNotificationStore({ lastRead: 1234, lastPolledTimestamp: 500 });
      vi.spyOn(Core.NotificationApplication, 'fetchNotifications').mockResolvedValue({
        unread: 0,
        nextPollCursor: undefined,
      });

      await NotificationController.fetchNotifications({ userId: mockUserId });

      expect(store.setUnread).toHaveBeenCalledWith(0);
      expect(store.setLastPolledTimestamp).not.toHaveBeenCalled();
    });

    it('should handle two sequential polls with accumulating unread from IndexedDB', async () => {
      const selectLastRead = vi.fn(() => 1000);
      let currentLastPolledTimestamp: number | undefined = undefined;
      const selectLastPolledTimestamp = vi.fn(() => currentLastPolledTimestamp);
      const setUnread = vi.fn();
      const setLastPolledTimestamp = vi.fn((ts: number | undefined) => {
        currentLastPolledTimestamp = ts;
      });
      vi.spyOn(Core.useNotificationStore, 'getState').mockReturnValue(
        mockNotificationStore({
          selectLastRead,
          selectLastPolledTimestamp,
          setUnread,
          setLastPolledTimestamp,
        }),
      );

      const appSpy = vi.spyOn(Core.NotificationApplication, 'fetchNotifications');

      // Poll 1: 2 new unread notifications
      appSpy.mockResolvedValueOnce({ unread: 2, nextPollCursor: 3000 });
      await NotificationController.fetchNotifications({ userId: mockUserId });

      expect(appSpy).toHaveBeenCalledWith({ userId: mockUserId, lastPolledTimestamp: undefined, lastRead: 1000 });
      expect(setUnread).toHaveBeenCalledWith(2);
      expect(setLastPolledTimestamp).toHaveBeenCalledWith(3000);

      // Poll 2: IndexedDB now has 4 total unread (2 old + 2 new)
      appSpy.mockResolvedValueOnce({ unread: 4, nextPollCursor: 5000 });
      await NotificationController.fetchNotifications({ userId: mockUserId });

      expect(appSpy).toHaveBeenCalledWith({ userId: mockUserId, lastPolledTimestamp: 3000, lastRead: 1000 });
      expect(setUnread).toHaveBeenCalledWith(4);
      expect(setLastPolledTimestamp).toHaveBeenCalledWith(5000);
    });

    it('should not regress lastPolledTimestamp when an older poll resolves after a newer one', async () => {
      let currentLastPolledTimestamp: number | undefined = undefined;
      const selectLastPolledTimestamp = vi.fn(() => currentLastPolledTimestamp);
      const setUnread = vi.fn();
      const setLastPolledTimestamp = vi.fn((ts: number | undefined) => {
        currentLastPolledTimestamp = ts;
      });
      vi.spyOn(Core.useNotificationStore, 'getState').mockReturnValue(
        mockNotificationStore({
          selectLastRead: vi.fn(() => 1000),
          selectLastPolledTimestamp,
          setUnread,
          setLastPolledTimestamp,
        }),
      );

      const appSpy = vi.spyOn(Core.NotificationApplication, 'fetchNotifications');

      // Simulate two overlapping polls: poll A (slow) and poll B (fast).
      // Poll B resolves first with a newer timestamp, then poll A resolves with an older one.
      appSpy.mockResolvedValueOnce({ unread: 3, nextPollCursor: 5000 }); // poll A (older result)
      appSpy.mockResolvedValueOnce({ unread: 5, nextPollCursor: 8000 }); // poll B (newer result)

      // Poll B resolves first
      const pollA = NotificationController.fetchNotifications({ userId: mockUserId });
      // Simulate poll B finishing and advancing the cursor before poll A
      currentLastPolledTimestamp = 8000;

      await pollA;

      // Poll A should NOT have regressed the cursor from 8000 back to 5000
      expect(setLastPolledTimestamp).not.toHaveBeenCalled();
    });

    it('should bubble errors and not update store', async () => {
      const store = setupNotificationStore({ lastRead: 1234, lastPolledTimestamp: 500 });
      vi.spyOn(Core.NotificationApplication, 'fetchNotifications').mockRejectedValue(new Error('poll-fail'));

      await expect(NotificationController.fetchNotifications({ userId: mockUserId })).rejects.toThrow('poll-fail');
      expect(store.setUnread).not.toHaveBeenCalled();
      expect(store.setLastPolledTimestamp).not.toHaveBeenCalled();
    });
  });

  describe('getOrFetchNotifications', () => {
    const mockResponse: Core.TGetOrFetchNotificationsResponse = {
      flatNotifications: [
        { id: 'follow:3000:user-1', type: Core.NotificationType.Follow, timestamp: 3000, followed_by: 'user-1' },
      ] as Core.FlatNotification[],
      olderThan: 3000,
    };

    beforeEach(() => setupAuthStore());

    it.each([
      { params: {}, expectedOlderThan: Infinity, expectedLimit: Config.NEXUS_NOTIFICATIONS_LIMIT },
      { params: { olderThan: 5000 }, expectedOlderThan: 5000, expectedLimit: Config.NEXUS_NOTIFICATIONS_LIMIT },
      { params: { limit: 50 }, expectedOlderThan: Infinity, expectedLimit: 50 },
      { params: { olderThan: 8000, limit: 20 }, expectedOlderThan: 8000, expectedLimit: 20 },
    ])('should call application with params: $params', async ({ params, expectedOlderThan, expectedLimit }) => {
      const spy = vi.spyOn(Core.NotificationApplication, 'getOrFetchNotifications').mockResolvedValue(mockResponse);

      await NotificationController.getOrFetchNotifications(params);

      expect(spy).toHaveBeenCalledWith({
        userId: mockUserId,
        olderThan: expectedOlderThan,
        limit: expectedLimit,
      });
    });

    it('should return response from application', async () => {
      vi.spyOn(Core.NotificationApplication, 'getOrFetchNotifications').mockResolvedValue(mockResponse);

      const result = await NotificationController.getOrFetchNotifications({});

      expect(result).toEqual(mockResponse);
    });

    it('should return empty response when no notifications', async () => {
      vi.spyOn(Core.NotificationApplication, 'getOrFetchNotifications').mockResolvedValue({
        flatNotifications: [],
        olderThan: undefined,
      });

      const result = await NotificationController.getOrFetchNotifications({});

      expect(result.flatNotifications).toHaveLength(0);
      expect(result.olderThan).toBeUndefined();
    });

    it('should bubble errors from application', async () => {
      vi.spyOn(Core.NotificationApplication, 'getOrFetchNotifications').mockRejectedValue(new Error('fetch-fail'));

      await expect(NotificationController.getOrFetchNotifications({})).rejects.toThrow('fetch-fail');
    });
  });

  describe('markAllAsRead', () => {
    const mockTimestamp = 1234567890;
    const mockLastReadUrl = 'pubky://test-user/pub/pubky.app/last-read';

    const setupStores = (pubky: Core.Pubky | null) => {
      const setLastRead = vi.fn();
      const setUnread = vi.fn();

      vi.spyOn(Core.useAuthStore, 'getState').mockReturnValue(
        mockAuthStore({
          currentUserPubky: pubky,
          selectCurrentUserPubky: () => {
            if (!pubky) throw new Error('No pubky');
            return pubky;
          },
        }),
      );

      vi.spyOn(Core.useNotificationStore, 'getState').mockReturnValue(
        mockNotificationStore({
          setLastRead,
          setUnread,
        }),
      );

      return { setLastRead, setUnread };
    };

    it('should call application and update local store', () => {
      const { setLastRead, setUnread } = setupStores(mockUserId);

      const mockLastReadResult = {
        last_read: {
          timestamp: BigInt(mockTimestamp),
          toJson: vi.fn().mockReturnValue({ timestamp: mockTimestamp }),
        },
        meta: { url: mockLastReadUrl },
      };

      vi.spyOn(Core.LastReadNormalizer, 'to').mockReturnValue(
        asOpaque<ReturnType<typeof Core.LastReadNormalizer.to>>(mockLastReadResult),
      );
      const applicationSpy = vi.spyOn(Core.NotificationApplication, 'markAllAsRead').mockImplementation(() => {});

      NotificationController.markAllAsRead();

      expect(Core.LastReadNormalizer.to).toHaveBeenCalledWith(mockUserId);
      expect(applicationSpy).toHaveBeenCalledWith(mockLastReadResult);
      expect(setLastRead).toHaveBeenCalledWith(mockTimestamp);
      expect(setUnread).toHaveBeenCalledWith(0);
    });

    it('should skip processing when no user is authenticated', () => {
      const { setLastRead, setUnread } = setupStores(null);

      const normalizerSpy = vi.spyOn(Core.LastReadNormalizer, 'to');
      const applicationSpy = vi.spyOn(Core.NotificationApplication, 'markAllAsRead');

      NotificationController.markAllAsRead();

      // When pubky is null, function returns early without calling application
      expect(normalizerSpy).not.toHaveBeenCalled();
      expect(applicationSpy).not.toHaveBeenCalled();
      expect(setLastRead).not.toHaveBeenCalled();
      expect(setUnread).not.toHaveBeenCalled();
    });
  });

  describe('getAllFromCache', () => {
    it('should delegate to NotificationApplication.getAllFromCache', async () => {
      const expected = [
        { type: Core.NotificationType.Follow, timestamp: 3000, followed_by: 'user-1' },
        { type: Core.NotificationType.Follow, timestamp: 2000, followed_by: 'user-2' },
      ] as Core.FlatNotification[];
      const applicationSpy = vi.spyOn(Core.NotificationApplication, 'getAllFromCache').mockResolvedValue(expected);

      const result = await NotificationController.getAllFromCache();

      expect(applicationSpy).toHaveBeenCalled();
      expect(result).toEqual(expected);
    });

    it('should return empty array when no notifications exist', async () => {
      vi.spyOn(Core.NotificationApplication, 'getAllFromCache').mockResolvedValue([]);

      const result = await NotificationController.getAllFromCache();

      expect(result).toEqual([]);
    });

    it('should bubble application errors', async () => {
      vi.spyOn(Core.NotificationApplication, 'getAllFromCache').mockRejectedValue(new Error('app-fail'));

      await expect(NotificationController.getAllFromCache()).rejects.toThrow('app-fail');
    });
  });
});
