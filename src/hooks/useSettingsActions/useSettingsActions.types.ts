import type { NotificationPreferences } from '@/stores/settings/settings.types';

export interface UseSettingsActionsResult {
  /** Updates a single notification preference and syncs to homeserver */
  setNotificationPreference: (type: keyof NotificationPreferences, enabled: boolean) => Promise<void>;
  /** Updates show confirmation preference and syncs to homeserver */
  setShowConfirm: (showConfirm: boolean) => Promise<void>;
  /** Updates blur censored preference and syncs to homeserver */
  setBlurCensored: (blurCensored: boolean) => Promise<void>;
  /** Updates sign out inactive preference and syncs to homeserver */
  setSignOutInactive: (signOutInactive: boolean) => Promise<void>;
  /** Updates require pin preference and syncs to homeserver */
  setRequirePin: (requirePin: boolean) => Promise<void>;
  /** Updates hide who to follow preference and syncs to homeserver */
  setHideWhoToFollow: (hideWhoToFollow: boolean) => Promise<void>;
  /** Updates hide active friends preference and syncs to homeserver */
  setHideActiveFriends: (hideActiveFriends: boolean) => Promise<void>;
  /** Updates hide search preference and syncs to homeserver */
  setHideSearch: (hideSearch: boolean) => Promise<void>;
  /** Updates never show posts preference and syncs to homeserver */
  setNeverShowPosts: (neverShowPosts: boolean) => Promise<void>;
  /** Error message if the action failed */
  error: string | null;
}
