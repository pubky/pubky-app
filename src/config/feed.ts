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

/**
 * Session-storage flag set by home nav entry points (Pubky logo, mobile footer
 * Home) to force the feed back to the top on the next real `/home` mount.
 * Read once and cleared in `Home.tsx`. Centralized here so the call sites
 * (Logo, MobileFooter, Home, and `(feeds)/layout.tsx`) cannot drift.
 */
export const FORCE_HOME_SCROLL_TOP_KEY = 'pubky:force-home-scroll-top';
