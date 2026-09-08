import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationApplication } from '@/application/notification/notification';
import { SettingsApplication } from '@/application/settings/settings';
import type { Pubky } from '@/models/models.types';
import { NotificationType } from '@/models/notification/notification.types';
import { NotificationNormalizer } from '@/pipes/notification/notification.normalizer';
import { SettingsNormalizer } from '@/pipes/settings/settings.normalizer';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useNotificationStore } from '@/stores/notification/notification.store';
import type { NotificationStore } from '@/stores/notification/notification.types';
import { useSettingsStore } from '@/stores/settings/settings.store';
import {
  defaultNotificationPreferences,
  defaultPrivacyPreferences,
  type SettingsState,
} from '@/stores/settings/settings.types';
import { mockAuthStore, mockSettingsStore } from '@/test-utils/stores';
import { asOpaque } from '@/test-utils/type-assertions';
import { SettingsController } from './settings';

const TEST_PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky;
const MOCK_LAST_READ = 5000;
const MOCK_ALLOWED_TYPES = [NotificationType.Follow, NotificationType.Reply];

const mockNotificationStoreActions = {
  selectLastRead: () => MOCK_LAST_READ,
  setUnread: vi.fn(),
};

const mockStoreActions = {
  setNotificationPreference: vi.fn(),
  setAllNotifications: vi.fn(),
  setShowConfirm: vi.fn(),
  setBlurCensored: vi.fn(),
  setSignOutInactive: vi.fn(),
  setRequirePin: vi.fn(),
  setHideWhoToFollow: vi.fn(),
  setHideActiveFriends: vi.fn(),
  setHideSearch: vi.fn(),
  setNeverShowPosts: vi.fn(),
  addMutedUser: vi.fn(),
  removeMutedUser: vi.fn(),
  setMutedUsers: vi.fn(),
  clearMutedUsers: vi.fn(),
  notifications: defaultNotificationPreferences,
  privacy: defaultPrivacyPreferences,
  muted: [] as string[],
  updatedAt: 1000,
  version: 1,
};

const mockSettingsState: SettingsState = {
  notifications: defaultNotificationPreferences,
  privacy: defaultPrivacyPreferences,
  muted: [],
  updatedAt: 1000,
  version: 1,
};

describe('SettingsController', () => {
  let commitUpdateSpy: ReturnType<typeof vi.spyOn>;
  let countFilteredSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(useSettingsStore, 'getState').mockReturnValue(mockSettingsStore(mockStoreActions));

    vi.spyOn(useAuthStore, 'getState').mockReturnValue(mockAuthStore({ selectCurrentUserPubky: () => TEST_PUBKY }));

    vi.spyOn(useNotificationStore, 'getState').mockReturnValue(
      asOpaque<NotificationStore>(mockNotificationStoreActions),
    );

    vi.spyOn(SettingsNormalizer, 'extractState').mockReturnValue(mockSettingsState);
    vi.spyOn(NotificationNormalizer, 'toEnabledTypes').mockReturnValue(MOCK_ALLOWED_TYPES);
    commitUpdateSpy = vi.spyOn(SettingsApplication, 'commitUpdate').mockResolvedValue(undefined);
    countFilteredSpy = vi.spyOn(NotificationApplication, 'countFilteredUnreadSince').mockResolvedValue(3);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('setNotificationPreference', () => {
    it('should update zustand store', async () => {
      await SettingsController.setNotificationPreference('follow', false);

      expect(mockStoreActions.setNotificationPreference).toHaveBeenCalledWith('follow', false);
    });

    it('should recalculate unread badge count when types are enabled', async () => {
      countFilteredSpy.mockResolvedValue(3);
      await SettingsController.setNotificationPreference('follow', true);

      expect(countFilteredSpy).toHaveBeenCalledWith(MOCK_LAST_READ, MOCK_ALLOWED_TYPES);
      expect(mockNotificationStoreActions.setUnread).toHaveBeenCalledWith(3);
    });

    it('should recalculate unread badge count to 0 when no types match', async () => {
      countFilteredSpy.mockResolvedValue(0);
      await SettingsController.setNotificationPreference('follow', false);

      expect(countFilteredSpy).toHaveBeenCalledWith(MOCK_LAST_READ, MOCK_ALLOWED_TYPES);
      expect(mockNotificationStoreActions.setUnread).toHaveBeenCalledWith(0);
    });

    it('should sync to homeserver', async () => {
      await SettingsController.setNotificationPreference('follow', false);

      expect(commitUpdateSpy).toHaveBeenCalledWith(mockSettingsState, TEST_PUBKY);
    });

    it('should still sync to homeserver when badge recalculation fails', async () => {
      countFilteredSpy.mockRejectedValue(new Error('db-fail'));

      await expect(SettingsController.setNotificationPreference('follow', false)).rejects.toThrow('db-fail');
      expect(commitUpdateSpy).toHaveBeenCalledWith(mockSettingsState, TEST_PUBKY);
    });
  });

  describe('setAllNotifications', () => {
    it('should update zustand store', async () => {
      const preferences = { ...defaultNotificationPreferences, follow: false };
      await SettingsController.setAllNotifications(preferences);

      expect(mockStoreActions.setAllNotifications).toHaveBeenCalledWith(preferences);
    });

    it('should recalculate unread badge count when types are enabled', async () => {
      countFilteredSpy.mockResolvedValue(3);
      const preferences = { ...defaultNotificationPreferences, follow: false };
      await SettingsController.setAllNotifications(preferences);

      expect(countFilteredSpy).toHaveBeenCalledWith(MOCK_LAST_READ, MOCK_ALLOWED_TYPES);
      expect(mockNotificationStoreActions.setUnread).toHaveBeenCalledWith(3);
    });

    it('should recalculate unread badge count to 0 when no types match', async () => {
      countFilteredSpy.mockResolvedValue(0);
      const preferences = { ...defaultNotificationPreferences, follow: false };
      await SettingsController.setAllNotifications(preferences);

      expect(countFilteredSpy).toHaveBeenCalledWith(MOCK_LAST_READ, MOCK_ALLOWED_TYPES);
      expect(mockNotificationStoreActions.setUnread).toHaveBeenCalledWith(0);
    });

    it('should sync to homeserver', async () => {
      const preferences = { ...defaultNotificationPreferences, follow: false };
      await SettingsController.setAllNotifications(preferences);

      expect(commitUpdateSpy).toHaveBeenCalledWith(mockSettingsState, TEST_PUBKY);
    });

    it('should still sync to homeserver when badge recalculation fails', async () => {
      countFilteredSpy.mockRejectedValue(new Error('db-fail'));

      await expect(SettingsController.setAllNotifications(defaultNotificationPreferences)).rejects.toThrow('db-fail');
      expect(commitUpdateSpy).toHaveBeenCalledWith(mockSettingsState, TEST_PUBKY);
    });
  });

  describe('setShowConfirm', () => {
    it('should update zustand store and sync to homeserver', async () => {
      await SettingsController.setShowConfirm(false);

      expect(mockStoreActions.setShowConfirm).toHaveBeenCalledWith(false);
      expect(commitUpdateSpy).toHaveBeenCalledWith(mockSettingsState, TEST_PUBKY);
    });
  });

  describe('setBlurCensored', () => {
    it('should update zustand store and sync to homeserver', async () => {
      await SettingsController.setBlurCensored(true);

      expect(mockStoreActions.setBlurCensored).toHaveBeenCalledWith(true);
      expect(commitUpdateSpy).toHaveBeenCalledWith(mockSettingsState, TEST_PUBKY);
    });
  });

  describe('local-only operations (muted users)', () => {
    it('addMutedUser should update store without homeserver sync', () => {
      SettingsController.addMutedUser('user-1');

      expect(mockStoreActions.addMutedUser).toHaveBeenCalledWith('user-1');
      expect(commitUpdateSpy).not.toHaveBeenCalled();
    });

    it('removeMutedUser should update store without homeserver sync', () => {
      SettingsController.removeMutedUser('user-1');

      expect(mockStoreActions.removeMutedUser).toHaveBeenCalledWith('user-1');
      expect(commitUpdateSpy).not.toHaveBeenCalled();
    });

    it('clearMutedUsers should update store without homeserver sync', () => {
      SettingsController.clearMutedUsers();

      expect(mockStoreActions.clearMutedUsers).toHaveBeenCalled();
      expect(commitUpdateSpy).not.toHaveBeenCalled();
    });
  });

  describe('commitUpdate error handling', () => {
    it('should bubble errors from SettingsApplication.commitUpdate', async () => {
      commitUpdateSpy.mockRejectedValue(new Error('homeserver-fail'));

      await expect(SettingsController.setShowConfirm(true)).rejects.toThrow('homeserver-fail');
      expect(mockStoreActions.setShowConfirm).toHaveBeenCalledWith(true);
    });
  });
});
