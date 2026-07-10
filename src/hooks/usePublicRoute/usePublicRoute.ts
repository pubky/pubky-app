'use client';

import { usePathname } from 'next/navigation';
import {
  isCoreExploreRoute as matchCoreExploreRoute,
  isDynamicPublicRoute as matchDynamicPublicRoute,
} from '@/app/routes';
import type { UsePublicRouteResult } from './usePublicRoute.types';

export type { UsePublicRouteResult } from './usePublicRoute.types';

/**
 * Pathname-based route classification for explore mode and public chrome.
 *
 * Unauthenticated users may browse **core explore routes** (`/home`, `/hot`, `/search`, `/collections`)
 * and **dynamic public routes** (single post, another user's profile, single collection, invite links).
 * `RouteGuardProvider` allows those paths via `EXPLORE_ROUTES` and `isDynamicPublicRoute()`
 * in `@/app/routes`; this hook mirrors that split for UI (header, footer, CTAs).
 *
 * Return flags (see `UsePublicRouteResult`):
 * - `isCoreExploreRoute` — app-shell feeds/search without signing in
 * - `isDynamicPublicRoute` — post/profile/invite pages with minimal chrome
 * - `isPublicExploreRoute` — either of the above (broad “guest can view” check)
 * - `isPublicRoute` — **legacy alias** for `isDynamicPublicRoute` only (not `/home` et al.)
 *
 * Does **not** read auth state. Pair with `useRequireAuth` when an action needs a session.
 *
 * @example
 * ```tsx
 * const { isCoreExploreRoute, isPublicExploreRoute } = usePublicRoute();
 * if (!isAuthenticated && !isCoreExploreRoute) return null;
 * ```
 */
export function usePublicRoute(): UsePublicRouteResult {
  const pathname = usePathname();
  const isCoreExploreRoute = matchCoreExploreRoute(pathname);
  const isDynamicPublicRoute = matchDynamicPublicRoute(pathname);

  return {
    // Backwards-compatible name used by existing post/profile minimal chrome.
    isPublicRoute: isDynamicPublicRoute,
    isCoreExploreRoute,
    isDynamicPublicRoute,
    isPublicExploreRoute: isCoreExploreRoute || isDynamicPublicRoute,
  };
}
