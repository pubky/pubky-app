'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import {
  isCoreExploreRoute as matchCoreExploreRoute,
  isDynamicPublicRoute as matchDynamicPublicRoute,
} from '@/app/routes';
import type { UsePublicRouteResult } from './usePublicRoute.types';

export type { UsePublicRouteResult } from './usePublicRoute.types';

/**
 * Hook for checking if the current route is a dynamic public route.
 *
 * Dynamic public routes are routes that should be accessible without authentication:
 * - /post/[userId]/[postId] - viewing a single post
 * - /profile/[pubky] - viewing another user's profile
 *
 * Core explore routes are app-shell routes that unauthenticated users can browse:
 * - /home
 * - /hot
 * - /search
 *
 * This hook only handles route awareness. It does NOT check authentication status.
 * Use this in combination with `useRequireAuth` when you need both.
 */
export function usePublicRoute(): UsePublicRouteResult {
  const pathname = usePathname();

  const result = useMemo(() => {
    const isCoreExploreRoute = matchCoreExploreRoute(pathname);
    const isDynamicPublicRoute = matchDynamicPublicRoute(pathname);

    return {
      // Backwards-compatible name used by existing post/profile minimal chrome.
      isPublicRoute: isDynamicPublicRoute,
      isCoreExploreRoute,
      isDynamicPublicRoute,
      isPublicExploreRoute: isCoreExploreRoute || isDynamicPublicRoute,
    };
  }, [pathname]);

  return result;
}
