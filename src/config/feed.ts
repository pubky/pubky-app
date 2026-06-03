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
 * Session-storage flag set by feed-cluster nav entry points (Pubky logo,
 * desktop header, mobile footer, feed navigation) when the user explicitly
 * navigates to a feed route they are not already on. The persistent
 * `(feeds)/layout.tsx` does not reset `window.scrollY` on intra-cluster
 * navigation, so the layout consumes this one-shot flag to scroll the feed to
 * the top on arrival. Browser back never sets it, preserving native history
 * scroll restoration. Centralized here so all call sites cannot drift.
 */
export const FORCE_FEED_SCROLL_TOP_KEY = 'pubky:force-feed-scroll-top';
