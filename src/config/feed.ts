/**
 * Feed-related UI constants shared across hooks, components, and templates.
 */
export const DEFAULT_CUSTOM_FEED_ICON = 'activity';

/**
 * A dynamic Lucide icon name: lowercase kebab-case. Shared by the UI resolver
 * and the persistence validator so a name that survives one cannot be rejected
 * by the other and silently render as the fallback glyph.
 */
export const LUCIDE_ICON_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * UI-only reach value: "Tagged as" is not a stored reach but a WoT reach plus
 * profile tags. Lives here so hooks and core-adjacent code can reference it
 * without importing from a filter component.
 */
export const TAGGED_AS_FILTER_KEY = 'tagged_as' as const;

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
 * Grid is intrinsic to these variants rather than user-selectable. Collection
 * feeds are intentionally excluded because their creator default/viewer
 * override chooses between Grid and List.
 */
export const GRID_LAYOUT_VARIANTS = new Set<TimelineFeedVariant>([TIMELINE_FEED_VARIANT.BOOKMARKS]);

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
 * Reach values supported by the profile/domain tag stream contract. WoT V1
 * authoring exposes only standalone Tagged as, serialized as wot/depth 2.
 * Depth 0/1 support remains intentional for foreign and legacy custom feeds
 * and for future authoring work. Both network and wot are retained because
 * Home and pubky-app-specs use different names for the same depth-2 reach.
 */
const PROFILE_TAG_SUPPORTED_REACHES = ['network', 'wot', 'following', 'friends', 'me'] as const;

export type ProfileTagSupportedReach = (typeof PROFILE_TAG_SUPPORTED_REACHES)[number];

export function isProfileTagReachSupported(reach: string): reach is ProfileTagSupportedReach {
  return PROFILE_TAG_SUPPORTED_REACHES.some((supportedReach) => supportedReach === reach);
}

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
