import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SettingsController } from './settings';
import * as i18nUtils from '@/i18n/utils';
import * as Core from '@/core';
import { defaultNotificationPreferences, defaultPrivacyPreferences } from '@/core/stores/settings/settings.types';
import { asOpaque, mockAuthStore, mockSettingsStore } from '@/test-utils';

const TEST_PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Core.Pubky;

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
  setLanguage: vi.fn(),
  addMutedUser: vi.fn(),
  removeMutedUser: vi.fn(),
  setMutedUsers: vi.fn(),
  clearMutedUsers: vi.fn(),
  notifications: defaultNotificationPreferences,
  privacy: defaultPrivacyPreferences,
  muted: [] as string[],
  language: 'en',
  updatedAt: 1000,
  version: 1,
};

const mockSettingsState: Core.SettingsState = {
  notifications: defaultNotificationPreferences,
  privacy: defaultPrivacyPreferences,
  muted: [],
  language: 'en',
  updatedAt: 1000,
  version: 1,
};

describe('SettingsController', () => {
  let commitUpdateSpy: ReturnType<typeof vi.spyOn>;
  let extractStateSpy: ReturnType<typeof vi.spyOn>;
  let setLocaleCookieSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset pendingCommit between tests to avoid chaining across tests
    // pendingCommit is private; an opaque cast is needed to reset static state between tests
    asOpaque<{ pendingCommit: Promise<void> }>(SettingsController).pendingCommit = Promise.resolve();

    vi.spyOn(Core.useSettingsStore, 'getState').mockReturnValue(mockSettingsStore(mockStoreActions));

    vi.spyOn(Core.useAuthStore, 'getState').mockReturnValue(
      mockAuthStore({ selectCurrentUserPubky: () => TEST_PUBKY }),
    );

    extractStateSpy = vi.spyOn(Core.SettingsNormalizer, 'extractState').mockReturnValue(mockSettingsState);
    commitUpdateSpy = vi.spyOn(Core.SettingsApplication, 'commitUpdate').mockResolvedValue(undefined);
    setLocaleCookieSpy = vi.spyOn(i18nUtils, 'setLocaleCookie').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('setNotificationPreference', () => {
    it('should update zustand store and sync to homeserver', async () => {
      await SettingsController.setNotificationPreference('follow', false);

      expect(mockStoreActions.setNotificationPreference).toHaveBeenCalledWith('follow', false);
      expect(extractStateSpy).toHaveBeenCalled();
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

  describe('setLanguage', () => {
    it('should update zustand store, set locale cookie, and sync to homeserver', async () => {
      await SettingsController.setLanguage('es');

      expect(mockStoreActions.setLanguage).toHaveBeenCalledWith('es');
      expect(setLocaleCookieSpy).toHaveBeenCalledWith('es');
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

  describe('concurrent updates', () => {
    it('should serialize concurrent commits via promise chaining', async () => {
      const callOrder: string[] = [];

      commitUpdateSpy.mockImplementation(async () => {
        callOrder.push('commit-start');
        await new Promise((r) => setTimeout(r, 10));
        callOrder.push('commit-end');
      });

      const p1 = SettingsController.setShowConfirm(true);
      const p2 = SettingsController.setBlurCensored(false);

      await Promise.all([p1, p2]);

      expect(callOrder).toEqual(['commit-start', 'commit-end', 'commit-start', 'commit-end']);
      expect(commitUpdateSpy).toHaveBeenCalledTimes(2);
    });
  });
});
