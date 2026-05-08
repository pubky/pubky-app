'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { isDynamicPublicRoute } from '@/app/routes';
import type { UsePublicRouteResult } from './usePublicRoute.types';

export type { UsePublicRouteResult } from './usePublicRoute.types';

/**
 * Hook for checking if the current route is a dynamic public route.
 *
 * Dynamic public routes are routes that should be accessible without authentication:
 * - /post/[userId]/[postId] - viewing a single post
 * - /profile/[pubky] - viewing another user's profile
 *
 * This hook only handles route awareness. It does NOT check authentication status.
 * Use this in combination with `useRequireAuth` when you need both.
 */
export function usePublicRoute(): UsePublicRouteResult {
  const pathname = usePathname();

  const isPublicRoute = useMemo(() => isDynamicPublicRoute(pathname), [pathname]);

  return { isPublicRoute };
}
