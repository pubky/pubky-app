/**
 * Feed-related UI constants shared across hooks, components, and templates.
 */
export const TIMELINE_FEED_VARIANT = {
  HOME: 'home',
  CUSTOM: 'custom',
  BOOKMARKS: 'bookmarks',
  PROFILE: 'profile',
  HOT: 'hot',
  SEARCH: 'search',
} as const;

export type TimelineFeedVariant = (typeof TIMELINE_FEED_VARIANT)[keyof typeof TIMELINE_FEED_VARIANT];
