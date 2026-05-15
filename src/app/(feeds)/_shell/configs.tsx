import { APP_ROUTES } from '@/app/routes';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import type { ContentLayoutProps } from '@/organisms/ContentLayout/ContentLayout.types';
import { CustomFeedFilters } from '@/organisms/CustomFeedFilters/CustomFeedFilters';
import { FeedNavigation } from '@/organisms/FeedNavigation/FeedNavigation';
import { HomeFeedRightDrawer, HomeFeedRightSidebar } from '@/organisms/FeedRightSidebar/FeedRightSidebar';
import { HomeFeedDrawer, HomeFeedDrawerMobile, HomeFeedSidebar } from '@/organisms/HomeFeedSidebar/HomeFeedSidebar';

/**
 * Props for `ContentLayout` that are derived per feed route. Children are not
 * part of the shell config — they are the route's `page.tsx` output, rendered
 * inside the layout by `(feeds)/layout.tsx`.
 */
export type FeedsShellConfig = Omit<ContentLayoutProps, 'children'>;

export type FeedsRouteKey = 'home' | 'customFeed' | 'bookmarks' | 'search';

/**
 * Maps a pathname to its feeds route key, or `null` when the pathname does
 * not correspond to a feeds route.
 *
 * Returns `null` (rather than throwing) because `(feeds)/layout.tsx` may
 * legitimately be mounted under a non-feeds pathname — e.g. while the
 * intercepted `(.)post` slot is active, `usePathname()` reports
 * `/post/<user>/<post>` even though the layout is still alive. The layout
 * decides how to handle the `null` case (cache fallback when the modal is
 * active, throw otherwise).
 */
export function matchFeedsRouteKey(pathname: string): FeedsRouteKey | null {
  if (pathname === APP_ROUTES.HOME) return 'home';
  if (pathname === APP_ROUTES.BOOKMARKS) return 'bookmarks';
  if (pathname === APP_ROUTES.SEARCH) return 'search';
  if (pathname.startsWith(`${APP_ROUTES.FEED}/`)) return 'customFeed';
  return null;
}

const configs: Record<FeedsRouteKey, FeedsShellConfig> = {
  home: {
    feedVariant: TIMELINE_FEED_VARIANT.HOME,
    leftSidebarContent: <HomeFeedSidebar allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.HOME} />,
    rightSidebarContent: <HomeFeedRightSidebar />,
    leftDrawerContent: <HomeFeedDrawer allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.HOME} />,
    rightDrawerContent: <HomeFeedRightDrawer />,
    leftDrawerContentMobile: <HomeFeedDrawerMobile allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.HOME} />,
    rightDrawerContentMobile: <FeedNavigation className="lg:hidden" />,
  },
  customFeed: {
    feedVariant: TIMELINE_FEED_VARIANT.CUSTOM,
    leftSidebarContent: <CustomFeedFilters variant="sidebar" />,
    rightSidebarContent: <HomeFeedRightSidebar />,
    leftDrawerContent: <CustomFeedFilters variant="drawer" />,
    rightDrawerContent: <HomeFeedRightDrawer />,
    leftDrawerContentMobile: <CustomFeedFilters variant="drawer" />,
    rightDrawerContentMobile: <FeedNavigation className="lg:hidden" />,
  },
  bookmarks: {
    feedVariant: TIMELINE_FEED_VARIANT.BOOKMARKS,
    showRightMobileButton: false,
    leftSidebarContent: (
      <HomeFeedSidebar hideReachFilter allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.BOOKMARKS} />
    ),
    rightSidebarContent: <HomeFeedRightSidebar />,
    leftDrawerContent: (
      <HomeFeedDrawer hideReachFilter allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.BOOKMARKS} />
    ),
    rightDrawerContent: <HomeFeedRightDrawer />,
    leftDrawerContentMobile: (
      <HomeFeedDrawerMobile hideReachFilter allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.BOOKMARKS} />
    ),
  },
  search: {
    feedVariant: TIMELINE_FEED_VARIANT.SEARCH,
    showRightMobileButton: false,
    leftSidebarContent: (
      <HomeFeedSidebar hideReachFilter allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.SEARCH} />
    ),
    rightSidebarContent: <HomeFeedRightSidebar />,
    leftDrawerContent: <HomeFeedDrawer hideReachFilter allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.SEARCH} />,
    rightDrawerContent: <HomeFeedRightDrawer />,
    leftDrawerContentMobile: (
      <HomeFeedDrawerMobile hideReachFilter allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.SEARCH} />
    ),
  },
};

/**
 * Resolves the `ContentLayout` props for a feeds pathname, or `null` if the
 * pathname is not a feeds route.
 *
 * Used by `(feeds)/layout.tsx` to hoist the shell so it stays mounted across
 * intra-cluster transitions (e.g. `/home → /feed/[id] → /bookmarks → /search`).
 * The layout treats the `null` return as follows:
 *   - while the intercepted `(.)post` slot is active (pathname is
 *     `/post/<user>/<post>`), it reuses the most recently cached feeds config
 *     so the previous route's chrome stays mounted under the modal;
 *   - otherwise (unknown pathname, modal not active), the layout throws —
 *     this is the safety net for an unconfigured route mounted under
 *     `(feeds)/`, e.g. someone adds `(feeds)/notifications/page.tsx` without
 *     updating `configs` above.
 */
export function tryResolveFeedsShellConfig(pathname: string): FeedsShellConfig | null {
  const key = matchFeedsRouteKey(pathname);
  return key ? configs[key] : null;
}
