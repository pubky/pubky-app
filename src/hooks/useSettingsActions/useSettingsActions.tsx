'use client';

import { useState, useCallback } from 'react';
import { SettingsController, NotificationPreferences } from '@/core';
import { isAppError } from '@/libs';
import type { UseSettingsActionsResult } from './useSettingsActions.types';

/**
 * useSettingsActions
 *
 * Hook for updating settings with homeserver sync.
 * Wraps SettingsController methods with error state management.
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

  const run = useCallback(async (action: () => Promise<void>) => {
    setError(null);

    try {
      await action();
    } catch (err) {
      // No Logger.error in catch — already logged via: SettingsController -> HomeserverService -> Err.* -> Logger.error (libs/error/error.factories.ts)
      setError(isAppError(err) ? err.message : 'Failed to update settings');
      throw err;
    }
  }, []);

  const setNotificationPreference = useCallback(
    (type: keyof NotificationPreferences, enabled: boolean) =>
      run(() => SettingsController.setNotificationPreference(type, enabled)),
    [run],
  );

  const setShowConfirm = useCallback(
    (showConfirm: boolean) => run(() => SettingsController.setShowConfirm(showConfirm)),
    [run],
  );

  const setBlurCensored = useCallback(
    (blurCensored: boolean) => run(() => SettingsController.setBlurCensored(blurCensored)),
    [run],
  );

  const setSignOutInactive = useCallback(
    (signOutInactive: boolean) => run(() => SettingsController.setSignOutInactive(signOutInactive)),
    [run],
  );

  const setRequirePin = useCallback(
    (requirePin: boolean) => run(() => SettingsController.setRequirePin(requirePin)),
    [run],
  );

  const setHideWhoToFollow = useCallback(
    (hideWhoToFollow: boolean) => run(() => SettingsController.setHideWhoToFollow(hideWhoToFollow)),
    [run],
  );

  const setHideActiveFriends = useCallback(
    (hideActiveFriends: boolean) => run(() => SettingsController.setHideActiveFriends(hideActiveFriends)),
    [run],
  );

  const setHideSearch = useCallback(
    (hideSearch: boolean) => run(() => SettingsController.setHideSearch(hideSearch)),
    [run],
  );

  const setNeverShowPosts = useCallback(
    (neverShowPosts: boolean) => run(() => SettingsController.setNeverShowPosts(neverShowPosts)),
    [run],
  );

  const setLanguage = useCallback((language: string) => run(() => SettingsController.setLanguage(language)), [run]);

  const reset = useCallback(() => run(() => SettingsController.reset()), [run]);

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
    setLanguage,
    reset,
    error,
  };
}
