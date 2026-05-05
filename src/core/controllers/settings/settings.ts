import { NotificationApplication } from '@/application/notification/notification';
import { SettingsApplication } from '@/application/settings/settings';
import { setLocaleCookie } from '@/i18n/utils';
import { NotificationNormalizer } from '@/pipes/notification/notification.normalizer';
import { SettingsNormalizer } from '@/pipes/settings/settings.normalizer';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useNotificationStore } from '@/stores/notification/notification.store';
import { useSettingsStore } from '@/stores/settings/settings.store';
import type { NotificationPreferences } from '@/stores/settings/settings.types';

/**
 * Settings controller.
 *
 * Entry point for settings-related operations that require homeserver sync.
 * Components should call these methods when user changes settings to ensure
 * changes are persisted to the homeserver.
 *
 * Pattern: Component → Controller → Application → HomeserverService
 */
export class SettingsController {
  private constructor() {} // Prevent instantiation

  private static pendingCommit: Promise<void> = Promise.resolve();

  /**
   * Commits settings to homeserver.
   */
  private static async commitUpdate(): Promise<void> {
    // Uses promise chaining to prevent race conditions: if multiple settings change rapidly,
    // each commit waits for the previous one to finish, then reads the latest state.
    // The chaining MUST happen synchronously (before any await) so that concurrent calls
    // immediately queue behind the current pendingCommit rather than racing to overwrite it.
    this.pendingCommit = this.pendingCommit
      .catch(() => {})
      .then(async () => {
        const pubky = useAuthStore.getState().selectCurrentUserPubky();
        const settings = SettingsNormalizer.extractState(useSettingsStore.getState());
        await SettingsApplication.commitUpdate(settings, pubky);
      });
    await this.pendingCommit;
  }

  /**
   * Updates a notification preference, recalculates the unread badge count,
   * and syncs to homeserver.
   */
  static async setNotificationPreference(type: keyof NotificationPreferences, enabled: boolean): Promise<void> {
    useSettingsStore.getState().setNotificationPreference(type, enabled);
    try {
      await this.recalculateUnreadBadge();
    } finally {
      await this.commitUpdate();
    }
  }

  /**
   * Updates all notification preferences, recalculates the unread badge count,
   * and syncs to homeserver.
   */
  static async setAllNotifications(preferences: NotificationPreferences): Promise<void> {
    useSettingsStore.getState().setAllNotifications(preferences);
    try {
      await this.recalculateUnreadBadge();
    } finally {
      await this.commitUpdate();
    }
  }

  /**
   * Recalculates the unread badge count based on current notification preferences.
   */
  private static async recalculateUnreadBadge(): Promise<void> {
    const preferences = useSettingsStore.getState().notifications;
    const allowedTypes = NotificationNormalizer.toEnabledTypes(preferences);
    const lastRead = useNotificationStore.getState().selectLastRead();
    const unread = await NotificationApplication.countFilteredUnreadSince(lastRead, allowedTypes);
    useNotificationStore.getState().setUnread(unread);
  }

  /**
   * Updates privacy settings and syncs to homeserver.
   */
  static async setShowConfirm(showConfirm: boolean): Promise<void> {
    useSettingsStore.getState().setShowConfirm(showConfirm);
    await this.commitUpdate();
  }

  static async setBlurCensored(blurCensored: boolean): Promise<void> {
    useSettingsStore.getState().setBlurCensored(blurCensored);
    await this.commitUpdate();
  }

  static async setSignOutInactive(signOutInactive: boolean): Promise<void> {
    useSettingsStore.getState().setSignOutInactive(signOutInactive);
    await this.commitUpdate();
  }

  static async setRequirePin(requirePin: boolean): Promise<void> {
    useSettingsStore.getState().setRequirePin(requirePin);
    await this.commitUpdate();
  }

  static async setHideWhoToFollow(hideWhoToFollow: boolean): Promise<void> {
    useSettingsStore.getState().setHideWhoToFollow(hideWhoToFollow);
    await this.commitUpdate();
  }

  static async setHideActiveFriends(hideActiveFriends: boolean): Promise<void> {
    useSettingsStore.getState().setHideActiveFriends(hideActiveFriends);
    await this.commitUpdate();
  }

  static async setHideSearch(hideSearch: boolean): Promise<void> {
    useSettingsStore.getState().setHideSearch(hideSearch);
    await this.commitUpdate();
  }

  static async setNeverShowPosts(neverShowPosts: boolean): Promise<void> {
    useSettingsStore.getState().setNeverShowPosts(neverShowPosts);
    await this.commitUpdate();
  }

  /**
   * Muted users management (local-only, not synced to homeserver).
   * These methods update the local store directly without triggering
   * a homeserver sync since muted users are device-specific.
   */
  static addMutedUser(userId: string): void {
    useSettingsStore.getState().addMutedUser(userId);
  }

  static removeMutedUser(userId: string): void {
    useSettingsStore.getState().removeMutedUser(userId);
  }

  static setMutedUsers(userIds: string[]): void {
    useSettingsStore.getState().setMutedUsers(userIds);
  }

  static clearMutedUsers(): void {
    useSettingsStore.getState().clearMutedUsers();
  }

  /**
   * Updates language preference and syncs to homeserver.
   */
  static async setLanguage(language: string): Promise<void> {
    useSettingsStore.getState().setLanguage(language);
    setLocaleCookie(language);
    await this.commitUpdate();
  }
}
