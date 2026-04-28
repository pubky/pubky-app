'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { PROFILE_ROUTES } from '@/app';
import { PROFILE_PAGE_TYPES, ProfilePageType, FilterBarPageType } from '@/app/profile/types';
import * as Providers from '@/providers';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';

/**
 * Profile routes configuration - single source of truth
 * Maps page types to their primary route and optional aliases
 */
const PROFILE_ROUTES_CONFIG: Record<
  ProfilePageType,
  {
    /** Primary route for this page type */
    route: string;
    /** Sub-path for dynamic routes (e.g., '/posts', '/followers') */
    subPath: string;
    /** Alternative routes that also map to this page type */
    aliases?: string[];
    /** Whether this page is only available for own profile */
    ownProfileOnly?: boolean;
  }
> = {
  [PROFILE_PAGE_TYPES.NOTIFICATIONS]: {
    route: PROFILE_ROUTES.PROFILE,
    subPath: '',
    aliases: [PROFILE_ROUTES.NOTIFICATIONS],
    ownProfileOnly: true, // Notifications only for logged-in user
  },
  [PROFILE_PAGE_TYPES.POSTS]: {
    route: PROFILE_ROUTES.POSTS,
    subPath: '/posts',
  },
  [PROFILE_PAGE_TYPES.REPLIES]: {
    route: PROFILE_ROUTES.REPLIES,
    subPath: '/replies',
  },
  [PROFILE_PAGE_TYPES.FOLLOWERS]: {
    route: PROFILE_ROUTES.FOLLOWERS,
    subPath: '/followers',
  },
  [PROFILE_PAGE_TYPES.FOLLOWING]: {
    route: PROFILE_ROUTES.FOLLOWING,
    subPath: '/following',
  },
  [PROFILE_PAGE_TYPES.FRIENDS]: {
    route: PROFILE_ROUTES.FRIENDS,
    subPath: '/friends',
  },
  [PROFILE_PAGE_TYPES.UNIQUE_TAGS]: {
    route: PROFILE_ROUTES.UNIQUE_TAGS,
    subPath: '/tagged',
  },
  [PROFILE_PAGE_TYPES.PROFILE]: {
    route: PROFILE_ROUTES.PROFILE_PAGE,
    subPath: '/profile',
  },
};

/**
 * Derives the page-to-path mapping from the configuration
 * Maps routes (and their aliases) to page types
 */
const derivePagePathMap = (): Record<string, ProfilePageType> => {
  const map: Record<string, ProfilePageType> = {};

  for (const [pageType, config] of Object.entries(PROFILE_ROUTES_CONFIG)) {
    // Map primary route
    map[config.route] = pageType as ProfilePageType;

    // Map aliases if they exist
    if (config.aliases) {
      for (const alias of config.aliases) {
        map[alias] = pageType as ProfilePageType;
      }
    }
  }

  return map;
};

/**
 * Derives the route mapping from the configuration
 * Maps page types to their primary routes
 */
const deriveRouteMap = (): Record<ProfilePageType, string> => {
  const map: Record<ProfilePageType, string> = {} as Record<ProfilePageType, string>;

  for (const [pageType, config] of Object.entries(PROFILE_ROUTES_CONFIG)) {
    map[pageType as ProfilePageType] = config.route;
  }

  return map;
};

/**
 * Page-to-path mapping for profile navigation (derived from config)
 */
const PAGE_PATH_MAP = derivePagePathMap();

/**
 * Route mapping for profile pages (derived from config)
 */
const ROUTE_MAP = deriveRouteMap();

/**
 * Extracts the page type from a dynamic route pathname
 * Handles paths like /profile/{pubky}/posts, /profile/{pubky}/followers, etc.
 *
 * Own-profile dynamic routes preserve the Notifications default.
 * Other users default to PROFILE on mobile and POSTS on desktop.
 */
const getPageTypeFromDynamicPath = (
  pathname: string,
  isMobile: boolean,
  isOwnProfile: boolean,
): ProfilePageType | null => {
  const dynamicRouteMatch = pathname.match(/^\/profile\/[^/]+(\/.+)?$/);

  if (!dynamicRouteMatch) {
    return null;
  }

  const subPath = dynamicRouteMatch[1] || '';

  for (const [pageType, config] of Object.entries(PROFILE_ROUTES_CONFIG)) {
    if (config.subPath === subPath) {
      if (config.ownProfileOnly && !isOwnProfile) {
        continue;
      }

      return pageType as ProfilePageType;
    }
  }

  if (isOwnProfile) {
    return PROFILE_PAGE_TYPES.NOTIFICATIONS;
  }

  return isMobile ? PROFILE_PAGE_TYPES.PROFILE : PROFILE_PAGE_TYPES.POSTS;
};

/**
 * Return type for the useProfileNavigation hook
 */
export interface UseProfileNavigationReturn {
  /**
   * The currently active profile page based on the current pathname
   */
  activePage: ProfilePageType;
  /**
   * The active page for the filter bar (excludes PROFILE page type)
   */
  filterBarActivePage: FilterBarPageType;
  /**
   * Navigate to a specific profile page
   */
  navigateToPage: (page: ProfilePageType) => void;
}

/**
 * Custom hook for managing profile page navigation
 *
 * This hook encapsulates all navigation logic for profile pages including:
 * - Determining the active page based on current pathname
 * - Mapping between page types and routes
 * - Providing navigation functionality
 * - Handling dynamic routes for other users' profiles
 *
 * @returns {UseProfileNavigationReturn} Navigation state and handlers
 *
 * @example
 * ```typescript
 * const { activePage, filterBarActivePage, navigateToPage } = useProfileNavigation();
 *
 * // Navigate to posts page
 * navigateToPage(PROFILE_PAGE_TYPES.POSTS);
 *
 * // Use active page for conditional rendering
 * if (activePage === PROFILE_PAGE_TYPES.POSTS) {
 *   // Render posts
 * }
 * ```
 */
export function useProfileNavigation(): UseProfileNavigationReturn {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();

  const { pubky, isOwnProfile } = Providers.useProfileContext();

  /**
   * Determine the active page from the current pathname
   * Handles both static routes (/profile/posts) and dynamic routes (/profile/{pubky}/posts)
   */
  const activePage = useMemo(() => {
    if (PAGE_PATH_MAP[pathname]) {
      return PAGE_PATH_MAP[pathname];
    }

    const dynamicPageType = getPageTypeFromDynamicPath(pathname, isMobile, isOwnProfile);
    if (dynamicPageType) {
      return dynamicPageType;
    }

    if (isOwnProfile) {
      return PROFILE_PAGE_TYPES.NOTIFICATIONS;
    }

    return isMobile ? PROFILE_PAGE_TYPES.PROFILE : PROFILE_PAGE_TYPES.POSTS;
  }, [pathname, isOwnProfile, isMobile]);

  /**
   * Calculate the filter bar active page
   * The filter bar doesn't show the PROFILE page type, so we map it to NOTIFICATIONS or POSTS
   */
  const filterBarActivePage = useMemo(() => {
    if (activePage === PROFILE_PAGE_TYPES.PROFILE) {
      return isOwnProfile ? PROFILE_PAGE_TYPES.NOTIFICATIONS : PROFILE_PAGE_TYPES.POSTS;
    }
    // For other users without notifications, default to POSTS
    if (!isOwnProfile && activePage === PROFILE_PAGE_TYPES.NOTIFICATIONS) {
      return PROFILE_PAGE_TYPES.POSTS;
    }
    return activePage as FilterBarPageType;
  }, [activePage, isOwnProfile]);

  /**
   * Navigate to a specific profile page
   * Generates dynamic routes for other users' profiles
   */
  const navigateToPage = useCallback(
    (page: ProfilePageType) => {
      const config = PROFILE_ROUTES_CONFIG[page];

      // For own profile, use static routes
      if (isOwnProfile) {
        const route = ROUTE_MAP[page];
        router.push(route);
        return;
      }

      // For other users, generate dynamic route
      // Skip notifications for other users
      if (config.ownProfileOnly) {
        // Redirect to posts instead
        const postsRoute = `/profile/${pubky}/posts`;
        router.push(postsRoute);
        return;
      }

      const dynamicRoute = `/profile/${pubky}${config.subPath}`;
      router.push(dynamicRoute);
    },
    [router, isOwnProfile, pubky],
  );

  return {
    activePage,
    filterBarActivePage,
    navigateToPage,
  };
}
