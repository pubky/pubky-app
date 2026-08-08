'use client';

import { useState } from 'react';
import { SettingsController } from '@/controllers/settings/settings';
import { isAppError } from '@/libs/error/error.utils';
import type { NotificationPreferences } from '@/stores/settings/settings.types';
import type { UseSettingsActionsResult } from './useSettingsActions.types';

/**
 * useSettingsActions
 *
 * Hook for updating settings with homeserver sync.
 * Wraps SettingsController methods with error state management.
 *
 * No useCallback — React Compiler auto-memoizes (see next.config.ts reactCompiler: true).
 *
 * @example
 * ```tsx
 * const { setNotificationPreference, setShowConfirm, error } = useSettingsActions();
 *
 * const handleToggle = (type: NotificationType) => {
 *   setNotificationPreference(type, !notifications[type]);
 * };
 * ```
 */
export function useSettingsActions(): UseSettingsActionsResult {
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setError(null);

    try {
      await action();
    } catch (err) {
      // No rethrow — callers fire-and-forget, so rethrowing would cause unhandled rejections.
      // No toast — local-first: settings are persisted locally (Zustand + localStorage) before
      // homeserver sync, so the UI already reflects the change. Failed syncs retry on next bootstrap.
      // Already logged upstream: SettingsController -> HomeserverService -> Err.* -> Logger.error
      setError(isAppError(err) ? err.message : 'Failed to update settings');
    }
  };

  const setNotificationPreference = (type: keyof NotificationPreferences, enabled: boolean) =>
    run(() => SettingsController.setNotificationPreference(type, enabled));

  const setShowConfirm = (showConfirm: boolean) => run(() => SettingsController.setShowConfirm(showConfirm));

  const setBlurCensored = (blurCensored: boolean) => run(() => SettingsController.setBlurCensored(blurCensored));

  const setSignOutInactive = (signOutInactive: boolean) =>
    run(() => SettingsController.setSignOutInactive(signOutInactive));

  const setRequirePin = (requirePin: boolean) => run(() => SettingsController.setRequirePin(requirePin));

  const setHideWhoToFollow = (hideWhoToFollow: boolean) =>
    run(() => SettingsController.setHideWhoToFollow(hideWhoToFollow));

  const setHideActiveFriends = (hideActiveFriends: boolean) =>
    run(() => SettingsController.setHideActiveFriends(hideActiveFriends));

  const setHideSearch = (hideSearch: boolean) => run(() => SettingsController.setHideSearch(hideSearch));

  const setNeverShowPosts = (neverShowPosts: boolean) =>
    run(() => SettingsController.setNeverShowPosts(neverShowPosts));

  return {
    setNotificationPreference,
    setShowConfirm,
    setBlurCensored,
    setSignOutInactive,
    setRequirePin,
    setHideWhoToFollow,
    setHideActiveFriends,
    setHideSearch,
    setNeverShowPosts,
    error,
  };
}
