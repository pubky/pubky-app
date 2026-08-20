import { APP_ROUTES } from '@/app/routes';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import type { ContentLayoutProps } from '@/organisms/ContentLayout/ContentLayout.types';
import { CustomFeedFilters } from '@/organisms/CustomFeedFilters/CustomFeedFilters';
import { HomeFeedRightDrawer, HomeFeedRightSidebar } from '@/organisms/FeedRightSidebar/FeedRightSidebar';
import { HomeFeedDrawer, HomeFeedDrawerMobile, HomeFeedSidebar } from '@/organisms/HomeFeedSidebar/HomeFeedSidebar';

/**
 * Props for `ContentLayout` that are derived per feed route. Children are not
 * part of the shell config — they are the route's `page.tsx` output, rendered
 * inside the layout by `(feeds)/layout.tsx`.
 */
export type FeedsShellConfig = Omit<ContentLayoutProps, 'children'>;

export type FeedsRouteKey = 'home' | 'customFeed' | 'search';

/**
 * Maps a pathname to its feeds route key, or `null` when the pathname does
 * not correspond to a feeds route.
 *
 * Returns `null` (rather than throwing) because `(feeds)/layout.tsx` may
 * legitimately be mounted under a non-feeds pathname — e.g. while the
 * intercepted `(.)post` slot is active, `usePathname()` reports
 * `/post/<user>/<post>` even though the layout is still alive. The layout
 * handles the `null` case without throwing: it falls back to the cached
 * previous feeds config while the modal is active, and otherwise renders
 * empty chrome (see `(feeds)/layout.tsx` for the full fallback chain).
 */
export function matchFeedsRouteKey(pathname: string): FeedsRouteKey | null {
  if (pathname === APP_ROUTES.HOME) return 'home';
  if (pathname === APP_ROUTES.SEARCH) return 'search';
  if (pathname.startsWith(`${APP_ROUTES.FEED}/`)) return 'customFeed';
  return null;
}

const configs: Record<FeedsRouteKey, FeedsShellConfig> = {
  home: {
    feedVariant: TIMELINE_FEED_VARIANT.HOME,
    // Compact opaque mobile header (Hot pattern) so the feed tab bar rendered
    // by the Home template can stick right below it. Feed selection moved from
    // the mobile right drawer into that tab bar, so the right drawer falls
    // back to `rightDrawerContent` on mobile too.
    hasGradientBackground: false,
    classNameMobileHeader: 'pb-0',
    leftSidebarContent: <HomeFeedSidebar allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.HOME} />,
    rightSidebarContent: <HomeFeedRightSidebar />,
    leftDrawerContent: <HomeFeedDrawer allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.HOME} />,
    rightDrawerContent: <HomeFeedRightDrawer />,
    leftDrawerContentMobile: <HomeFeedDrawerMobile allowVisualLayout feedVariant={TIMELINE_FEED_VARIANT.HOME} />,
  },
  customFeed: {
    feedVariant: TIMELINE_FEED_VARIANT.CUSTOM,
    hasGradientBackground: false,
    classNameMobileHeader: 'pb-0',
    leftSidebarContent: <CustomFeedFilters variant="sidebar" />,
    rightSidebarContent: <HomeFeedRightSidebar />,
    leftDrawerContent: <CustomFeedFilters variant="drawer" />,
    rightDrawerContent: <HomeFeedRightDrawer />,
    leftDrawerContentMobile: <CustomFeedFilters variant="drawer" />,
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
 * intra-cluster transitions (e.g. `/home → /feed/[id] → /search`).
 * The layout handles the `null` return without throwing — see the header
 * comment in `(feeds)/layout.tsx` for the full fallback chain (cached config
 * during the intercepted post modal; empty chrome otherwise). When adding a
 * new route under `(feeds)/`, add a matching entry to `configs` above so the
 * route renders with its intended sidebars/drawers.
 */
export function tryResolveFeedsShellConfig(pathname: string): FeedsShellConfig | null {
  const key = matchFeedsRouteKey(pathname);
  return key ? configs[key] : null;
}
