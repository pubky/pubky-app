import type { PrivacyType } from './PrivacySettings.types';
import type { UseSettingsActionsResult } from '@/hooks/useSettingsActions';

interface PrivacySettingConfig {
  labelKey: string;
  action: keyof UseSettingsActionsResult;
  disabled?: boolean;
}

/**
 * Configuration for privacy settings switches.
 * Maps each privacy preference key to its translation key, action, and disabled state.
 */
export const PRIVACY_SETTINGS: Record<PrivacyType, PrivacySettingConfig> = {
  showConfirm: { labelKey: 'showConfirmation', action: 'setShowConfirm' },
  blurCensored: { labelKey: 'blurCensored', action: 'setBlurCensored' },
  signOutInactive: { labelKey: 'signOutInactive', action: 'setSignOutInactive', disabled: true },
  requirePin: { labelKey: 'requirePin', action: 'setRequirePin', disabled: true },
  hideWhoToFollow: { labelKey: 'hideWhoToFollow', action: 'setHideWhoToFollow', disabled: true },
  hideActiveFriends: { labelKey: 'hideActiveFriends', action: 'setHideActiveFriends', disabled: true },
  hideSearch: { labelKey: 'hideSearch', action: 'setHideSearch', disabled: true },
  neverShowPosts: { labelKey: 'neverShowPosts', action: 'setNeverShowPosts', disabled: true },
};
