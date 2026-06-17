import { isPubkyIdentifier } from '@/libs/utils/utils';

export const ROOT_ROUTES = '/';

export enum ONBOARDING_ROUTES {
  BACKUP = '/onboarding/backup',
  INSTALL = '/onboarding/install',
  PROFILE = '/onboarding/profile',
  PUBKY = '/onboarding/pubky',
  SCAN = '/onboarding/scan',
  HUMAN = '/onboarding/human',
}

export enum AUTH_ROUTES {
  SIGN_IN = '/sign-in',
  LOGOUT = '/logout',
}

export enum APP_ROUTES {
  HOME = '/home',
  FEED = '/feed',
  SEARCH = '/search',
  HOT = '/hot',
  BOOKMARKS = '/bookmarks',
  SETTINGS = '/settings',
  PROFILE = '/profile',
  WHO_TO_FOLLOW = '/who-to-follow',
  SHARE = '/share',
}

export enum PROFILE_ROUTES {
  PROFILE = '/profile',
  NOTIFICATIONS = '/profile/notifications',
  POSTS = '/profile/posts',
  REPLIES = '/profile/replies',
  FOLLOWERS = '/profile/followers',
  FOLLOWING = '/profile/following',
  FRIENDS = '/profile/friends',
  UNIQUE_TAGS = '/profile/tagged',
  PROFILE_PAGE = '/profile/profile',
}

export enum SETTINGS_ROUTES {
  ACCOUNT = '/settings/account',
  EDIT = '/settings/edit',
  NOTIFICATIONS = '/settings/notifications',
  PRIVACY_SAFETY = '/settings/privacy-safety',
  MUTED_USERS = '/settings/muted-users',
  LANGUAGE = '/settings/language',
  HELP = '/settings/help',
}

export enum POST_ROUTES {
  POST = '/post',
}

export enum COPYRIGHT_ROUTES {
  COPYRIGHT = '/copyright',
}

export const EXPLORE_ROUTES: string[] = [APP_ROUTES.HOME, APP_ROUTES.HOT, APP_ROUTES.SEARCH];

// Public routes are accessible regardless of authentication status.
// This includes routes that need to be accessible during auth transitions (like logout).
// Note: Dynamic public routes like /profile/[pubky] and /post/[userId]/[postId]
// are handled by isDynamicPublicRoute() in RouteGuardProvider.
// Core explore routes are intentionally not listed here so auth hydration can
// still finish before app shell routes render for logged-in users.
export const PUBLIC_ROUTES: string[] = [
  AUTH_ROUTES.LOGOUT,
  // Profile is public to prevent RouteGuard redirect during logout.
  // The profile page components handle unauthenticated state gracefully.
  APP_ROUTES.PROFILE,
  // Copyright page should be accessible without authentication
  COPYRIGHT_ROUTES.COPYRIGHT,
  // Language settings page is public to allow language changes without auth issues
  SETTINGS_ROUTES.LANGUAGE,
];

export const ALLOWED_ROUTES = [
  ONBOARDING_ROUTES.PROFILE,
  APP_ROUTES.HOME,
  APP_ROUTES.FEED,
  APP_ROUTES.SEARCH,
  APP_ROUTES.HOT,
  APP_ROUTES.BOOKMARKS,
  APP_ROUTES.SETTINGS,
  APP_ROUTES.PROFILE,
  APP_ROUTES.WHO_TO_FOLLOW,
  APP_ROUTES.SHARE,
  POST_ROUTES.POST,
  AUTH_ROUTES.LOGOUT,
];

// Route guard configurations for different authentication states
export const UNAUTHENTICATED_ROUTES = {
  allowedRoutes: [
    ROOT_ROUTES,
    AUTH_ROUTES.SIGN_IN,
    ONBOARDING_ROUTES.INSTALL,
    ONBOARDING_ROUTES.SCAN,
    ONBOARDING_ROUTES.PUBKY,
    ONBOARDING_ROUTES.BACKUP,
    ONBOARDING_ROUTES.HUMAN,
    ...EXPLORE_ROUTES,
    AUTH_ROUTES.LOGOUT,
    COPYRIGHT_ROUTES.COPYRIGHT,
  ],
  redirectTo: ROOT_ROUTES,
};

export const NEEDS_PROFILE_CREATION_ROUTES = {
  allowedRoutes: [ONBOARDING_ROUTES.PROFILE, ONBOARDING_ROUTES.BACKUP],
  redirectTo: ONBOARDING_ROUTES.PROFILE,
};

export const AUTHENTICATED_ROUTES = {
  allowedRoutes: ALLOWED_ROUTES,
  redirectTo: APP_ROUTES.HOME,
};

// Backwards compatibility
export const HOME_ROUTES = {
  HOME: APP_ROUTES.HOME,
};

// ============================================================================
// Dynamic Public Route Detection
// ============================================================================

/**
 * Checks if a pathname is a dynamic public route accessible without authentication.
 *
 * Dynamic public routes:
 * - /post/[userId]/[postId] - viewing a single post
 * - /profile/[pubky] - viewing another user's profile
 */
export function isDynamicPublicRoute(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);

  switch (true) {
    case segments[0] === 'invite' && segments.length === 2:
    case segments[0] === 'post' && segments.length === 3:
    case segments[0] === 'profile' && segments.length === 2 && isPubkyIdentifier(segments[1]):
      return true;
    default:
      return false;
  }
}

/** `/post/[userId]/[postId]` — browsable without auth; uses explore header chrome for guests. */
export function isPostRoute(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);
  return segments[0] === 'post' && segments.length === 3;
}

export function isCoreExploreRoute(pathname: string): boolean {
  return EXPLORE_ROUTES.includes(pathname);
}

export function isPublicExploreRoute(pathname: string): boolean {
  return isCoreExploreRoute(pathname) || isDynamicPublicRoute(pathname);
}

/** Routes where the header logo links back to the landing page (`/`). */
export const LOGO_LANDING_ROUTES: readonly string[] = [
  ROOT_ROUTES,
  ...Object.values(AUTH_ROUTES),
  COPYRIGHT_ROUTES.COPYRIGHT,
  ...Object.values(ONBOARDING_ROUTES),
];

export function isLogoLandingRoute(pathname: string | null): boolean {
  return pathname != null && LOGO_LANDING_ROUTES.includes(pathname);
}

// ============================================================================
// Profile Route Helpers
// ============================================================================

/**
 * Generates a profile route for a specific user.
 * If no pubky is provided, returns the route for the logged-in user.
 *
 * @param route - The base profile route (e.g., PROFILE_ROUTES.FOLLOWERS)
 * @param pubky - Optional pubky for viewing another user's profile
 * @returns The full route path
 *
 * @example
 * ```ts
 * // For logged-in user
 * getProfileRoute(PROFILE_ROUTES.FOLLOWERS) // => '/profile/followers'
 *
 * // For specific user
 * getProfileRoute(PROFILE_ROUTES.FOLLOWERS, 'n1zpc53jzy') // => '/profile/n1zpc53jzy/followers'
 * ```
 */
export function getProfileRoute(route: PROFILE_ROUTES, pubky?: string): string {
  if (!pubky) {
    return route;
  }

  // Extract the sub-path after /profile
  const subPath = route.replace('/profile', '');

  // For other users, the base profile route is the canonical posts view.
  // Notifications only apply to the logged-in user, so they fall back to base profile.
  if (route === PROFILE_ROUTES.PROFILE || route === PROFILE_ROUTES.NOTIFICATIONS || route === PROFILE_ROUTES.POSTS) {
    return `/profile/${pubky}`;
  }

  return `/profile/${pubky}${subPath}`;
}
