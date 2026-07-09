/**
 * Feed-related UI constants shared across hooks, components, and templates.
 */
export const TIMELINE_FEED_VARIANT = {
  HOME: 'home',
  CUSTOM: 'custom',
  BOOKMARKS: 'bookmarks',
  PROFILE: 'profile',
  PROFILE_COLLECTIONS: 'profile_collections',
  HOT: 'hot',
  SEARCH: 'search',
  COLLECTION: 'collection',
} as const;

export type TimelineFeedVariant = (typeof TIMELINE_FEED_VARIANT)[keyof typeof TIMELINE_FEED_VARIANT];

/**
 * Feed variants that render their posts in a fixed card grid rather than the
 * default vertical timeline (decision D5).
 *
 * Grid is intrinsic to the variant — not a user-selectable layout — so membership
 * lives here in feed-domain config rather than in the home store's `LAYOUT` enum.
 * `useFeedLayoutResolution` derives `isGridActive` from this set.
 */
export const GRID_LAYOUT_VARIANTS = new Set<TimelineFeedVariant>([
  TIMELINE_FEED_VARIANT.BOOKMARKS,
  TIMELINE_FEED_VARIANT.COLLECTION,
]);

/**
 * Feed variants where a repost may be optimistically prepended via the active
 * `TimelineFeedContext`. Reposts belong on the user's timeline, not on
 * membership feeds (collection, bookmarks) or someone else's profile.
 */
export const REPOST_OPTIMISTIC_PREPEND_VARIANTS = new Set<TimelineFeedVariant>([
  TIMELINE_FEED_VARIANT.HOME,
  TIMELINE_FEED_VARIANT.CUSTOM,
  TIMELINE_FEED_VARIANT.HOT,
]);

/**
 * Responsive column classes for the shared card grid (`TimelineGridPosts`).
 * One column on phones, two at `md`, three at `xl` — mirrors the 3-up Figma grid.
 * Breakpoints may be retuned in the Phase C spike once the real cell width is measured.
 */
export const GRID_FEED_COLUMNS_CLASS = 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';

/**
 * Gap between cards in the shared card grid (`TimelineGridPosts`). Matches the
 * Figma grid spacing; shared by the renderer and its skeleton to avoid drift.
 */
export const GRID_FEED_GAP_CLASS = 'gap-3 lg:gap-6';

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
