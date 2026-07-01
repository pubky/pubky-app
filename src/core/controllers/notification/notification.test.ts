import type { Session } from '@synonymdev/pubky';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationApplication } from '@/application/notification/notification';
import type { TGetOrFetchNotificationsResponse } from '@/application/notification/notification.types';
import { NEXUS_NOTIFICATIONS_LIMIT } from '@/config/nexus';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { type FlatNotification, NotificationType } from '@/models/notification/notification.types';
import { LastReadNormalizer } from '@/pipes/lastRead/lastRead.normalizer';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useNotificationStore } from '@/stores/notification/notification.store';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { defaultNotificationPreferences, type NotificationPreferences } from '@/stores/settings/settings.types';
import { mockAuthStore, mockNotificationStore } from '@/test-utils/stores';
import { asOpaque } from '@/test-utils/type-assertions';
import { NotificationController } from './notification';

const mockUserId = 'pubky-user-123' as Pubky;

const setupAuthStore = (userId: Pubky = mockUserId) => {
  vi.spyOn(useAuthStore, 'getState').mockReturnValue(mockAuthStore({ selectCurrentUserPubky: () => userId }));
};

/**
 * Mocks the settings store with notification preferences.
 * The controller reads preferences to filter out disabled notification types.
 * Defaults to all enabled; pass overrides to disable specific types (e.g., { follow: false }).
 */
const mockSettingsStore = (overrides: Partial<NotificationPreferences> = {}) => {
  vi.spyOn(useSettingsStore, 'getState').mockReturnValue({
    notifications: { ...defaultNotificationPreferences, ...overrides },
  } as ReturnType<typeof useSettingsStore.getState>);
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
      vi.spyOn(useNotificationStore, 'getState').mockReturnValue(
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
      const appSpy = vi.spyOn(NotificationApplication, 'fetchNotifications').mockResolvedValue({
        unread: 5,
        nextPollCursor: 3000,
      });

      await NotificationController.fetchNotifications({ userId: mockUserId });

      expect(appSpy).toHaveBeenCalledWith({
        userId: mockUserId,
        lastPolledTimestamp: 500,
        lastRead: 1234,
        allowedTypes: expect.arrayContaining(Object.values(NotificationType)),
      });
      expect(store.setUnread).toHaveBeenCalledWith(5);
      expect(store.setLastPolledTimestamp).toHaveBeenCalledWith(3000);
    });

    it('should pass lastRead and preferences to application for filtered counting', async () => {
      mockSettingsStore({ follow: false });
      setupNotificationStore({ lastRead: 1234, lastPolledTimestamp: 500 });
      const appSpy = vi.spyOn(NotificationApplication, 'fetchNotifications').mockResolvedValue({
        unread: 3,
        nextPollCursor: 3000,
      });

      await NotificationController.fetchNotifications({ userId: mockUserId });

      expect(appSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          lastRead: 1234,
          allowedTypes: expect.not.arrayContaining([NotificationType.Follow]),
        }),
      );
    });

    it('should pass lastPolledTimestamp (not lastRead) to application', async () => {
      setupNotificationStore({ lastRead: 9000, lastPolledTimestamp: 2000 });
      const appSpy = vi.spyOn(NotificationApplication, 'fetchNotifications').mockResolvedValue({
        unread: 0,
        nextPollCursor: undefined,
      });

      await NotificationController.fetchNotifications({ userId: mockUserId });

      expect(appSpy).toHaveBeenCalledWith(expect.objectContaining({ lastPolledTimestamp: 2000, lastRead: 9000 }));
    });

    it('should not call setLastPolledTimestamp when nextPollCursor is undefined', async () => {
      const store = setupNotificationStore({ lastRead: 1234, lastPolledTimestamp: 500 });
      vi.spyOn(NotificationApplication, 'fetchNotifications').mockResolvedValue({
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
      vi.spyOn(useNotificationStore, 'getState').mockReturnValue(
        mockNotificationStore({
          selectLastRead,
          selectLastPolledTimestamp,
          setUnread,
          setLastPolledTimestamp,
        }),
      );

      const appSpy = vi.spyOn(NotificationApplication, 'fetchNotifications');

      // Poll 1: 2 new unread notifications
      appSpy.mockResolvedValueOnce({ unread: 2, nextPollCursor: 3000 });
      await NotificationController.fetchNotifications({ userId: mockUserId });

      expect(appSpy).toHaveBeenCalledWith({
        userId: mockUserId,
        lastPolledTimestamp: undefined,
        lastRead: 1000,
        allowedTypes: expect.arrayContaining(Object.values(NotificationType)),
      });
      expect(setUnread).toHaveBeenCalledWith(2);
      expect(setLastPolledTimestamp).toHaveBeenCalledWith(3000);

      // Poll 2: IndexedDB now has 4 total unread (2 old + 2 new)
      appSpy.mockResolvedValueOnce({ unread: 4, nextPollCursor: 5000 });
      await NotificationController.fetchNotifications({ userId: mockUserId });

      expect(appSpy).toHaveBeenCalledWith({
        userId: mockUserId,
        lastPolledTimestamp: 3000,
        lastRead: 1000,
        allowedTypes: expect.arrayContaining(Object.values(NotificationType)),
      });
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
      vi.spyOn(useNotificationStore, 'getState').mockReturnValue(
        mockNotificationStore({
          selectLastRead: vi.fn(() => 1000),
          selectLastPolledTimestamp,
          setUnread,
          setLastPolledTimestamp,
        }),
      );

      const appSpy = vi.spyOn(NotificationApplication, 'fetchNotifications');

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
      vi.spyOn(NotificationApplication, 'fetchNotifications').mockRejectedValue(new Error('poll-fail'));

      await expect(NotificationController.fetchNotifications({ userId: mockUserId })).rejects.toThrow('poll-fail');
      expect(store.setUnread).not.toHaveBeenCalled();
      expect(store.setLastPolledTimestamp).not.toHaveBeenCalled();
    });
  });

  describe('getOrFetchNotifications', () => {
    const mockResponse: TGetOrFetchNotificationsResponse = {
      flatNotifications: [
        { id: 'follow:3000:user-1', type: NotificationType.Follow, timestamp: 3000, followed_by: 'user-1' },
      ] as FlatNotification[],
      olderThan: 3000,
    };

    beforeEach(() => {
      setupAuthStore();
      mockSettingsStore();
    });

    it.each([
      { params: {}, expectedOlderThan: Infinity, expectedLimit: NEXUS_NOTIFICATIONS_LIMIT },
      { params: { olderThan: 5000 }, expectedOlderThan: 5000, expectedLimit: NEXUS_NOTIFICATIONS_LIMIT },
      { params: { limit: 50 }, expectedOlderThan: Infinity, expectedLimit: 50 },
      { params: { olderThan: 8000, limit: 20 }, expectedOlderThan: 8000, expectedLimit: 20 },
    ])(
      'should delegate to NotificationApplication.getOrFetchNotifications with params: $params',
      async ({ params, expectedOlderThan, expectedLimit }) => {
        const spy = vi.spyOn(NotificationApplication, 'getOrFetchNotifications').mockResolvedValue(mockResponse);

        await NotificationController.getOrFetchNotifications(params);

        expect(spy).toHaveBeenCalledWith({
          userId: mockUserId,
          olderThan: expectedOlderThan,
          limit: expectedLimit,
          allowedTypes: undefined,
        });
      },
    );

    it('should pass allowedTypes derived from preferences', async () => {
      mockSettingsStore({ follow: false });
      const spy = vi.spyOn(NotificationApplication, 'getOrFetchNotifications').mockResolvedValue(mockResponse);

      await NotificationController.getOrFetchNotifications({});

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          allowedTypes: expect.not.arrayContaining([NotificationType.Follow]),
        }),
      );
    });

    it('should return the response from application', async () => {
      vi.spyOn(NotificationApplication, 'getOrFetchNotifications').mockResolvedValue(mockResponse);

      const result = await NotificationController.getOrFetchNotifications({});

      expect(result.flatNotifications).toHaveLength(1);
      expect(result.olderThan).toBe(3000);
    });

    it('should return empty response when no notifications', async () => {
      vi.spyOn(NotificationApplication, 'getOrFetchNotifications').mockResolvedValue({
        flatNotifications: [],
        olderThan: undefined,
      });

      const result = await NotificationController.getOrFetchNotifications({});

      expect(result.flatNotifications).toHaveLength(0);
      expect(result.olderThan).toBeUndefined();
    });

    it('should bubble errors from application', async () => {
      vi.spyOn(NotificationApplication, 'getOrFetchNotifications').mockRejectedValue(new Error('fetch-fail'));

      await expect(NotificationController.getOrFetchNotifications({})).rejects.toThrow('fetch-fail');
    });
  });

  describe('markAllAsRead', () => {
    const mockTimestamp = 1234567890;
    const mockLastReadUrl = 'pubky://test-user/pub/pubky.app/last-read';

    const setupStores = (pubky: Pubky | null, unreadCount = 5, session: Session | null = {} as Session) => {
      const setLastRead = vi.fn();
      const setUnread = vi.fn();

      vi.spyOn(useAuthStore, 'getState').mockReturnValue(
        mockAuthStore({
          currentUserPubky: pubky,
          selectCurrentUserPubky: () => {
            if (!pubky) throw new Error('No pubky');
            return pubky;
          },
          selectSession: () => session,
        }),
      );

      vi.spyOn(useNotificationStore, 'getState').mockReturnValue(
        mockNotificationStore({
          setLastRead,
          setUnread,
          selectUnread: () => unreadCount,
        }),
      );

      return { setLastRead, setUnread };
    };

    const buildLastReadResult = () =>
      asOpaque<ReturnType<typeof LastReadNormalizer.to>>({
        last_read: {
          timestamp: BigInt(mockTimestamp),
          toJson: vi.fn().mockReturnValue({ timestamp: mockTimestamp }),
        },
        meta: { url: mockLastReadUrl },
      });

    it('should call application and update local store once the write succeeds', async () => {
      const { setLastRead, setUnread } = setupStores(mockUserId);
      const mockLastReadResult = buildLastReadResult();

      vi.spyOn(LastReadNormalizer, 'to').mockReturnValue(mockLastReadResult);
      const applicationSpy = vi.spyOn(NotificationApplication, 'markAllAsRead').mockResolvedValue(undefined);

      await NotificationController.markAllAsRead();

      expect(LastReadNormalizer.to).toHaveBeenCalledWith(mockUserId);
      expect(applicationSpy).toHaveBeenCalledWith(mockLastReadResult);
      expect(setLastRead).toHaveBeenCalledWith(mockTimestamp);
      expect(setUnread).toHaveBeenCalledWith(0);
    });

    it('should skip processing when no user is authenticated', async () => {
      const { setLastRead, setUnread } = setupStores(null);

      const normalizerSpy = vi.spyOn(LastReadNormalizer, 'to');
      const applicationSpy = vi.spyOn(NotificationApplication, 'markAllAsRead');

      await NotificationController.markAllAsRead();

      // When pubky is null, function returns early without calling application
      expect(normalizerSpy).not.toHaveBeenCalled();
      expect(applicationSpy).not.toHaveBeenCalled();
      expect(setLastRead).not.toHaveBeenCalled();
      expect(setUnread).not.toHaveBeenCalled();
    });

    it('should skip processing when the session is not yet restored', async () => {
      // The write must wait for the session, which is restored after currentUserPubky.
      const { setLastRead, setUnread } = setupStores(mockUserId, 5, null);

      const normalizerSpy = vi.spyOn(LastReadNormalizer, 'to');
      const applicationSpy = vi.spyOn(NotificationApplication, 'markAllAsRead');

      await NotificationController.markAllAsRead();

      expect(normalizerSpy).not.toHaveBeenCalled();
      expect(applicationSpy).not.toHaveBeenCalled();
      expect(setLastRead).not.toHaveBeenCalled();
      expect(setUnread).not.toHaveBeenCalled();
    });

    it('should skip processing when there are no unread notifications', async () => {
      const { setLastRead, setUnread } = setupStores(mockUserId, 0);

      const normalizerSpy = vi.spyOn(LastReadNormalizer, 'to');
      const applicationSpy = vi.spyOn(NotificationApplication, 'markAllAsRead');

      await NotificationController.markAllAsRead();

      expect(normalizerSpy).not.toHaveBeenCalled();
      expect(applicationSpy).not.toHaveBeenCalled();
      expect(setLastRead).not.toHaveBeenCalled();
      expect(setUnread).not.toHaveBeenCalled();
    });

    it('should not update local store when the homeserver write fails', async () => {
      const { setLastRead, setUnread } = setupStores(mockUserId);
      const mockLastReadResult = buildLastReadResult();

      vi.spyOn(LastReadNormalizer, 'to').mockReturnValue(mockLastReadResult);
      const applicationSpy = vi
        .spyOn(NotificationApplication, 'markAllAsRead')
        .mockRejectedValue(new Error('homeserver-fail'));
      const loggerWarnSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => {});

      await NotificationController.markAllAsRead();

      expect(applicationSpy).toHaveBeenCalledWith(mockLastReadResult);
      expect(setLastRead).not.toHaveBeenCalled();
      expect(setUnread).not.toHaveBeenCalled();
      expect(loggerWarnSpy).toHaveBeenCalled();
    });

    it('should not update local store when lastRead creation fails', async () => {
      const { setLastRead, setUnread } = setupStores(mockUserId);

      vi.spyOn(LastReadNormalizer, 'to').mockImplementation(() => {
        throw new Error('invalid-pubky');
      });
      const applicationSpy = vi.spyOn(NotificationApplication, 'markAllAsRead');
      const loggerWarnSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => {});

      await expect(NotificationController.markAllAsRead()).resolves.toBeUndefined();

      expect(applicationSpy).not.toHaveBeenCalled();
      expect(setLastRead).not.toHaveBeenCalled();
      expect(setUnread).not.toHaveBeenCalled();
      expect(loggerWarnSpy).toHaveBeenCalledWith('Failed to mark notifications as read on homeserver', {
        error: expect.any(Error),
      });
    });
  });

  describe('getAllFromCache', () => {
    it('should delegate to NotificationApplication.getAllFromCache', async () => {
      const expected = [
        { type: NotificationType.Follow, timestamp: 3000, followed_by: 'user-1' },
        { type: NotificationType.Follow, timestamp: 2000, followed_by: 'user-2' },
      ] as FlatNotification[];
      const applicationSpy = vi.spyOn(NotificationApplication, 'getAllFromCache').mockResolvedValue(expected);

      const result = await NotificationController.getAllFromCache();

      expect(applicationSpy).toHaveBeenCalled();
      expect(result).toEqual(expected);
    });

    it('should return empty array when no notifications exist', async () => {
      vi.spyOn(NotificationApplication, 'getAllFromCache').mockResolvedValue([]);

      const result = await NotificationController.getAllFromCache();

      expect(result).toEqual([]);
    });

    it('should bubble application errors', async () => {
      vi.spyOn(NotificationApplication, 'getAllFromCache').mockRejectedValue(new Error('app-fail'));

      await expect(NotificationController.getAllFromCache()).rejects.toThrow('app-fail');
    });
  });
});
