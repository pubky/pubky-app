import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pubky } from '@/models/models.types';
import { useSettingsStore } from './settings.store';
import { defaultNotificationPreferences, defaultPrivacyPreferences, settingsInitialState } from './settings.types';

// Mock localStorage for testing
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('SettingsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset localStorage mock
    localStorageMock.getItem.mockReturnValue(null);
    localStorageMock.setItem.mockImplementation(() => {});
    localStorageMock.removeItem.mockImplementation(() => {});

    // Reset store state to initial state
    useSettingsStore.setState({
      notifications: defaultNotificationPreferences,
      privacy: defaultPrivacyPreferences,
      muted: [],
      updatedAt: Date.now(),
      version: 1,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      // Reset to ensure clean state
      const initialTimestamp = Date.now();
      useSettingsStore.setState({
        notifications: defaultNotificationPreferences,
        privacy: defaultPrivacyPreferences,
        muted: [],
        updatedAt: initialTimestamp,
        version: 1,
      });

      const state = useSettingsStore.getState();

      expect(state.notifications).toEqual(defaultNotificationPreferences);
      expect(state.privacy).toEqual(defaultPrivacyPreferences);
      expect(state.muted).toEqual([]);
      expect(state.version).toBe(1);
      expect(state.updatedAt).toBeGreaterThanOrEqual(initialTimestamp);
    });
  });

  describe('Notification Preferences', () => {
    it('should set individual notification preference', () => {
      const store = useSettingsStore.getState();
      const initialTimestamp = useSettingsStore.getState().updatedAt;

      // Disable follow notification
      store.setNotificationPreference('follow', false);
      expect(useSettingsStore.getState().notifications.follow).toBe(false);
      expect(useSettingsStore.getState().notifications.reply).toBe(true); // Others unchanged
      expect(useSettingsStore.getState().updatedAt).toBeGreaterThanOrEqual(initialTimestamp);

      // Enable follow notification
      const beforeEnable = useSettingsStore.getState().updatedAt;
      // Small delay to ensure timestamp difference
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          store.setNotificationPreference('follow', true);
          expect(useSettingsStore.getState().notifications.follow).toBe(true);
          expect(useSettingsStore.getState().updatedAt).toBeGreaterThan(beforeEnable);
          resolve();
        }, 10);
      });
    });

    it('should set all notification preferences at once', () => {
      const store = useSettingsStore.getState();
      const newPreferences = {
        ...defaultNotificationPreferences,
        follow: false,
        reply: false,
      };

      store.setAllNotifications(newPreferences);
      expect(useSettingsStore.getState().notifications).toEqual(newPreferences);
    });

    it('should update multiple notification preferences independently', () => {
      const store = useSettingsStore.getState();

      store.setNotificationPreference('follow', false);
      store.setNotificationPreference('mention', false);
      store.setNotificationPreference('reply', true);

      const state = useSettingsStore.getState();
      expect(state.notifications.follow).toBe(false);
      expect(state.notifications.mention).toBe(false);
      expect(state.notifications.reply).toBe(true);
      expect(state.notifications.repost).toBe(true); // Unchanged
    });
  });

  describe('Privacy Preferences', () => {
    it('should set moderation bot state without changing other privacy preferences', () => {
      const moderationBot = 'euwmq57zefw5ynnkhh37b3gcmhs7g3cptdbw1doaxj1pbmzp3wro' as Pubky;
      const initialPrivacy = useSettingsStore.getState().privacy;
      const initialTimestamp = useSettingsStore.getState().updatedAt;

      useSettingsStore.getState().setModerationBot(moderationBot);

      expect(useSettingsStore.getState().privacy).toEqual({ ...initialPrivacy, moderationBot });
      expect(useSettingsStore.getState().updatedAt).toBeGreaterThanOrEqual(initialTimestamp);
    });

    it('should retain moderation bot state loaded from the homeserver', () => {
      const moderationBot = 'euwmq57zefw5ynnkhh37b3gcmhs7g3cptdbw1doaxj1pbmzp3wro' as Pubky;

      useSettingsStore.getState().loadFromHomeserver({
        notifications: defaultNotificationPreferences,
        privacy: { ...defaultPrivacyPreferences, moderationBot },
        muted: [],
        updatedAt: 123,
        version: 1,
      });

      expect(useSettingsStore.getState().privacy.moderationBot).toBe(moderationBot);
      expect(useSettingsStore.getState().version).toBe(1);
    });

    it('should set showConfirm preference', () => {
      const store = useSettingsStore.getState();

      store.setShowConfirm(false);
      expect(useSettingsStore.getState().privacy.showConfirm).toBe(false);

      store.setShowConfirm(true);
      expect(useSettingsStore.getState().privacy.showConfirm).toBe(true);
    });

    it('should set blurCensored preference', () => {
      const store = useSettingsStore.getState();

      store.setBlurCensored(false);
      expect(useSettingsStore.getState().privacy.blurCensored).toBe(false);

      store.setBlurCensored(true);
      expect(useSettingsStore.getState().privacy.blurCensored).toBe(true);
    });

    it('should set all privacy preferences', () => {
      const store = useSettingsStore.getState();

      store.setSignOutInactive(true);
      store.setRequirePin(true);
      store.setHideWhoToFollow(true);
      store.setHideActiveFriends(true);
      store.setHideSearch(true);
      store.setNeverShowPosts(true);

      const state = useSettingsStore.getState();
      expect(state.privacy.signOutInactive).toBe(true);
      expect(state.privacy.requirePin).toBe(true);
      expect(state.privacy.hideWhoToFollow).toBe(true);
      expect(state.privacy.hideActiveFriends).toBe(true);
      expect(state.privacy.hideSearch).toBe(true);
      expect(state.privacy.neverShowPosts).toBe(true);
    });

    it('should update privacy preferences independently', () => {
      const store = useSettingsStore.getState();

      store.setShowConfirm(false);
      store.setBlurCensored(false);
      store.setHideSearch(true);

      const state = useSettingsStore.getState();
      expect(state.privacy.showConfirm).toBe(false);
      expect(state.privacy.blurCensored).toBe(false);
      expect(state.privacy.hideSearch).toBe(true);
      expect(state.privacy.hideWhoToFollow).toBe(false); // Unchanged
    });
  });

  describe('Muted Users', () => {
    it('should add muted user', () => {
      const store = useSettingsStore.getState();
      const userId = 'user-123';

      store.addMutedUser(userId);
      expect(useSettingsStore.getState().muted).toContain(userId);
      expect(useSettingsStore.getState().muted.length).toBe(1);
    });

    it('should not add duplicate muted users', () => {
      const store = useSettingsStore.getState();
      const userId = 'user-123';

      store.addMutedUser(userId);
      store.addMutedUser(userId); // Try to add again

      expect(useSettingsStore.getState().muted).toEqual([userId]);
      expect(useSettingsStore.getState().muted.length).toBe(1);
    });

    it('should remove muted user', () => {
      const store = useSettingsStore.getState();
      const userId1 = 'user-123';
      const userId2 = 'user-456';

      store.addMutedUser(userId1);
      store.addMutedUser(userId2);
      expect(useSettingsStore.getState().muted.length).toBe(2);

      store.removeMutedUser(userId1);
      expect(useSettingsStore.getState().muted).not.toContain(userId1);
      expect(useSettingsStore.getState().muted).toContain(userId2);
      expect(useSettingsStore.getState().muted.length).toBe(1);
    });

    it('should set muted users array', () => {
      const store = useSettingsStore.getState();
      const userIds = ['user-1', 'user-2', 'user-3'];

      store.setMutedUsers(userIds);
      expect(useSettingsStore.getState().muted).toEqual(userIds);
    });

    it('should clear all muted users', () => {
      const store = useSettingsStore.getState();

      store.addMutedUser('user-1');
      store.addMutedUser('user-2');
      expect(useSettingsStore.getState().muted.length).toBe(2);

      store.clearMutedUsers();
      expect(useSettingsStore.getState().muted).toEqual([]);
    });

    it('should handle removing non-existent user gracefully', () => {
      const store = useSettingsStore.getState();

      store.removeMutedUser('non-existent-user');
      expect(useSettingsStore.getState().muted).toEqual([]);
    });
  });

  describe('Store Reset', () => {
    it('should reset store to default state', () => {
      const store = useSettingsStore.getState();

      // Set some state
      store.setNotificationPreference('follow', false);
      store.setShowConfirm(false);
      store.setModerationBot('euwmq57zefw5ynnkhh37b3gcmhs7g3cptdbw1doaxj1pbmzp3wro' as Pubky);
      store.addMutedUser('user-123');

      // Verify state is set
      expect(useSettingsStore.getState().notifications.follow).toBe(false);
      expect(useSettingsStore.getState().privacy.showConfirm).toBe(false);
      expect(useSettingsStore.getState().privacy.moderationBot).toBeDefined();
      expect(useSettingsStore.getState().muted).toContain('user-123');

      // Reset store
      store.reset();

      const afterReset = useSettingsStore.getState();

      // Verify state is reset to initial
      expect(afterReset.notifications).toEqual(defaultNotificationPreferences);
      expect(afterReset.privacy).toEqual(defaultPrivacyPreferences);
      expect(afterReset.privacy.moderationBot).toBeUndefined();
      expect(afterReset.muted).toEqual([]);
      expect(afterReset.version).toBe(1); // Reset to initial
      expect(afterReset.updatedAt).toBe(settingsInitialState.updatedAt); // Reset to 0 so remote wins on next login
    });
  });

  describe('Timestamp and Version', () => {
    it('should update timestamp on any state change', async () => {
      const store = useSettingsStore.getState();
      const initialTimestamp = useSettingsStore.getState().updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      store.setNotificationPreference('follow', false);
      expect(useSettingsStore.getState().updatedAt).toBeGreaterThan(initialTimestamp);

      const beforePrivacy = useSettingsStore.getState().updatedAt;
      await new Promise((resolve) => setTimeout(resolve, 10));

      store.setShowConfirm(false);
      expect(useSettingsStore.getState().updatedAt).toBeGreaterThan(beforePrivacy);
    });
  });

  describe('Integration', () => {
    it('should handle multiple settings changes together', () => {
      const store = useSettingsStore.getState();

      // Change multiple settings
      store.setNotificationPreference('follow', false);
      store.setShowConfirm(false);
      store.addMutedUser('user-1');
      store.addMutedUser('user-2');

      const state = useSettingsStore.getState();
      expect(state.notifications.follow).toBe(false);
      expect(state.privacy.showConfirm).toBe(false);
      expect(state.muted).toEqual(['user-1', 'user-2']);
    });

    it('should maintain state consistency across multiple operations', () => {
      const store = useSettingsStore.getState();

      // Add and remove users
      store.addMutedUser('user-1');
      store.addMutedUser('user-2');
      store.removeMutedUser('user-1');
      store.addMutedUser('user-3');

      const state = useSettingsStore.getState();
      expect(state.muted.length).toBe(2);
      expect(state.muted).not.toContain('user-1');
      expect(state.muted).toContain('user-2');
      expect(state.muted).toContain('user-3');
    });
  });
});
