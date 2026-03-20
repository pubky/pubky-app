import * as Core from '@/core';
import { setLocaleCookie } from '@/i18n/utils';

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
        const pubky = Core.useAuthStore.getState().selectCurrentUserPubky();
        const settings = Core.SettingsNormalizer.extractState(Core.useSettingsStore.getState());
        await Core.SettingsApplication.commitUpdate(settings, pubky);
      });
    await this.pendingCommit;
  }

  /**
   * Updates a notification preference and syncs to homeserver.
   */
  static async setNotificationPreference(type: keyof Core.NotificationPreferences, enabled: boolean): Promise<void> {
    Core.useSettingsStore.getState().setNotificationPreference(type, enabled);
    await this.commitUpdate();
  }

  /**
   * Updates all notification preferences and syncs to homeserver.
   */
  static async setAllNotifications(preferences: Core.NotificationPreferences): Promise<void> {
    Core.useSettingsStore.getState().setAllNotifications(preferences);
    await this.commitUpdate();
  }

  /**
   * Updates privacy settings and syncs to homeserver.
   */
  static async setShowConfirm(showConfirm: boolean): Promise<void> {
    Core.useSettingsStore.getState().setShowConfirm(showConfirm);
    await this.commitUpdate();
  }

  static async setBlurCensored(blurCensored: boolean): Promise<void> {
    Core.useSettingsStore.getState().setBlurCensored(blurCensored);
    await this.commitUpdate();
  }

  static async setSignOutInactive(signOutInactive: boolean): Promise<void> {
    Core.useSettingsStore.getState().setSignOutInactive(signOutInactive);
    await this.commitUpdate();
  }

  static async setRequirePin(requirePin: boolean): Promise<void> {
    Core.useSettingsStore.getState().setRequirePin(requirePin);
    await this.commitUpdate();
  }

  static async setHideWhoToFollow(hideWhoToFollow: boolean): Promise<void> {
    Core.useSettingsStore.getState().setHideWhoToFollow(hideWhoToFollow);
    await this.commitUpdate();
  }

  static async setHideActiveFriends(hideActiveFriends: boolean): Promise<void> {
    Core.useSettingsStore.getState().setHideActiveFriends(hideActiveFriends);
    await this.commitUpdate();
  }

  static async setHideSearch(hideSearch: boolean): Promise<void> {
    Core.useSettingsStore.getState().setHideSearch(hideSearch);
    await this.commitUpdate();
  }

  static async setNeverShowPosts(neverShowPosts: boolean): Promise<void> {
    Core.useSettingsStore.getState().setNeverShowPosts(neverShowPosts);
    await this.commitUpdate();
  }

  /**
   * Muted users management (local-only, not synced to homeserver).
   * These methods update the local store directly without triggering
   * a homeserver sync since muted users are device-specific.
   */
  static addMutedUser(userId: string): void {
    Core.useSettingsStore.getState().addMutedUser(userId);
  }

  static removeMutedUser(userId: string): void {
    Core.useSettingsStore.getState().removeMutedUser(userId);
  }

  static setMutedUsers(userIds: string[]): void {
    Core.useSettingsStore.getState().setMutedUsers(userIds);
  }

  static clearMutedUsers(): void {
    Core.useSettingsStore.getState().clearMutedUsers();
  }

  /**
   * Updates language preference and syncs to homeserver.
   */
  static async setLanguage(language: string): Promise<void> {
    Core.useSettingsStore.getState().setLanguage(language);
    setLocaleCookie(language);
    await this.commitUpdate();
  }
}
