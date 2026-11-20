import type { Pubky } from '@/models/models.types';

export interface NotificationPreferences {
  follow: boolean;
  newFriend: boolean;
  tagPost: boolean;
  tagProfile: boolean;
  mention: boolean;
  reply: boolean;
  repost: boolean;
  postDeleted: boolean;
  postEdited: boolean;
}

export interface PrivacyPreferences {
  showConfirm: boolean;
  blurCensored: boolean;
  signOutInactive: boolean;
  requirePin: boolean;
  hideWhoToFollow: boolean;
  hideActiveFriends: boolean;
  hideSearch: boolean;
  neverShowPosts: boolean;
  /**
   * Pubky of the moderation bot whose default follow has been processed for this account.
   * Missing means never processed. Once set, the follow is never touched again, so a later
   * manual unfollow sticks. A configured bot that differs from the stored value is processed anew.
   *
   * Lives under `privacy` on purpose: `SettingsNormalizer.from` spreads nested objects, so
   * clients that predate this field round-trip it untouched, whereas unknown top-level keys
   * are dropped. Preserve this field when settings move to priv/app.pubky/v1/settings.json
   * in the pubky-social-specs M3 migration.
   */
  moderationBot?: Pubky;
}

/**
 * Links & Media settings, synced as the top-level `media` object of settings.json. Older clients
 * drop unknown top-level keys on write, so `media` resets to its defaults there.
 */
export interface MediaPreferences {
  /**
   * Player ids (`PlayerProvider`) in the viewer's order; empty is Auto (the link's own service first).
   * `card` (`CARD_PLAYER`) ranks too: above a song's first service, the song shows its card.
   */
  playerOrder: string[];
  /** Player ids the viewer removed: no player or embed loads from them. Default none. */
  hiddenPlayers: string[];
  /** A link's platform embed shows up front instead of our card. Default on. */
  embedsUpFront: boolean;
}

export interface SettingsState {
  notifications: NotificationPreferences;
  privacy: PrivacyPreferences;
  media: MediaPreferences;
  muted: string[];
  updatedAt: number;
  version: number;
}

export interface SettingsActions {
  // Notification actions
  setNotificationPreference: (type: keyof NotificationPreferences, enabled: boolean) => void;
  setAllNotifications: (preferences: NotificationPreferences) => void;
  // Privacy actions
  setShowConfirm: (showConfirm: boolean) => void;
  setBlurCensored: (blurCensored: boolean) => void;
  setSignOutInactive: (signOutInactive: boolean) => void;
  setRequirePin: (requirePin: boolean) => void;
  setHideWhoToFollow: (hideWhoToFollow: boolean) => void;
  setHideActiveFriends: (hideActiveFriends: boolean) => void;
  setHideSearch: (hideSearch: boolean) => void;
  setNeverShowPosts: (neverShowPosts: boolean) => void;
  setModerationBot: (moderationBot: Pubky) => void;
  // Links and media actions
  setPlayers: (playerOrder: string[], hiddenPlayers: string[]) => void;
  setEmbedsUpFront: (embedsUpFront: boolean) => void;
  // Muted users actions
  addMutedUser: (userId: string) => void;
  removeMutedUser: (userId: string) => void;
  setMutedUsers: (userIds: string[]) => void;
  clearMutedUsers: () => void;
  // General actions
  reset: () => void;
  // Homeserver sync action, used by bootstrap to load remote settings
  loadFromHomeserver: (settings: SettingsState) => void;
}

export type SettingsStore = SettingsState & SettingsActions;

export const defaultNotificationPreferences: NotificationPreferences = {
  follow: true,
  newFriend: true,
  tagPost: true,
  tagProfile: true,
  mention: true,
  reply: true,
  repost: true,
  postDeleted: true,
  postEdited: true,
};

export const defaultPrivacyPreferences: PrivacyPreferences = {
  showConfirm: true,
  blurCensored: true,
  signOutInactive: false,
  requirePin: false,
  hideWhoToFollow: false,
  hideActiveFriends: false,
  hideSearch: false,
  neverShowPosts: false,
};

export const defaultMediaPreferences: MediaPreferences = {
  playerOrder: [],
  hiddenPlayers: [],
  embedsUpFront: true,
};

function getStrings(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined;
}

/**
 * A stored `media` object (settings.json, the persisted store) with missing or malformed keys as
 * their defaults. Keys a later version adds are kept.
 */
export function normalizeMediaPreferences(media: unknown): MediaPreferences {
  const stored =
    typeof media === 'object' && media !== null && !Array.isArray(media) ? (media as Record<string, unknown>) : {};
  return {
    ...defaultMediaPreferences,
    ...stored,
    playerOrder: getStrings(stored.playerOrder) ?? [],
    hiddenPlayers: getStrings(stored.hiddenPlayers) ?? [],
    embedsUpFront:
      typeof stored.embedsUpFront === 'boolean' ? stored.embedsUpFront : defaultMediaPreferences.embedsUpFront,
  };
}

export const settingsInitialState: SettingsState = {
  notifications: defaultNotificationPreferences,
  privacy: defaultPrivacyPreferences,
  media: defaultMediaPreferences,
  muted: [],
  updatedAt: 0,
  version: 1,
};

export enum SettingsActionTypes {
  SET_NOTIFICATION_PREFERENCE = 'SET_NOTIFICATION_PREFERENCE',
  SET_ALL_NOTIFICATIONS = 'SET_ALL_NOTIFICATIONS',
  SET_SHOW_CONFIRM = 'SET_SHOW_CONFIRM',
  SET_BLUR_CENSORED = 'SET_BLUR_CENSORED',
  SET_SIGN_OUT_INACTIVE = 'SET_SIGN_OUT_INACTIVE',
  SET_REQUIRE_PIN = 'SET_REQUIRE_PIN',
  SET_HIDE_WHO_TO_FOLLOW = 'SET_HIDE_WHO_TO_FOLLOW',
  SET_HIDE_ACTIVE_FRIENDS = 'SET_HIDE_ACTIVE_FRIENDS',
  SET_HIDE_SEARCH = 'SET_HIDE_SEARCH',
  SET_NEVER_SHOW_POSTS = 'SET_NEVER_SHOW_POSTS',
  SET_MODERATION_BOT = 'SET_MODERATION_BOT',
  SET_PLAYERS = 'SET_PLAYERS',
  SET_EMBEDS_UP_FRONT = 'SET_EMBEDS_UP_FRONT',
  ADD_MUTED_USER = 'ADD_MUTED_USER',
  REMOVE_MUTED_USER = 'REMOVE_MUTED_USER',
  SET_MUTED_USERS = 'SET_MUTED_USERS',
  CLEAR_MUTED_USERS = 'CLEAR_MUTED_USERS',
  RESET = 'RESET',
  LOAD_FROM_HOMESERVER = 'LOAD_FROM_HOMESERVER',
}
