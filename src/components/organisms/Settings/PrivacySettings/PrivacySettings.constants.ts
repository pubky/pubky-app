import type { PrivacyType } from './PrivacySettings.types';

type BooleanSettingsAction =
  | 'setShowConfirm'
  | 'setBlurCensored'
  | 'setSignOutInactive'
  | 'setRequirePin'
  | 'setHideWhoToFollow'
  | 'setHideActiveFriends'
  | 'setHideSearch'
  | 'setNeverShowPosts';

interface PrivacySettingConfig {
  label: string;
  action: BooleanSettingsAction;
  disabled?: boolean;
}

/**
 * Configuration for privacy settings switches.
 * Maps each privacy preference key to its label copy, action, and disabled state.
 */
export const PRIVACY_SETTINGS: Record<PrivacyType, PrivacySettingConfig> = {
  showConfirm: { label: 'Show confirmation before redirecting', action: 'setShowConfirm' },
  blurCensored: { label: 'Blur censored posts or profile pictures', action: 'setBlurCensored' },
  signOutInactive: { label: 'Sign me out when inactive for 5 minutes', action: 'setSignOutInactive', disabled: true },
  requirePin: { label: 'Require PIN when inactive for 5 minutes', action: 'setRequirePin', disabled: true },
  hideWhoToFollow: { label: "Hide your profile in 'Who to Follow'", action: 'setHideWhoToFollow', disabled: true },
  hideActiveFriends: { label: "Hide your profile in 'Active Friends'", action: 'setHideActiveFriends', disabled: true },
  hideSearch: { label: 'Hide your profile in search results', action: 'setHideSearch', disabled: true },
  neverShowPosts: {
    label: "Never show posts from people you don't follow",
    action: 'setNeverShowPosts',
    disabled: true,
  },
};
