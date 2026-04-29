'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { POST_ROUTES } from '@/app/routes';
import * as Types from './usePostNavigation.types';
import { parseCompositeId } from '@/models/models.utils';
/**
 * usePostNavigation
 *
 * Shared hook for post navigation logic.
 * Handles routing to post detail pages.
 */
export function usePostNavigation(): Types.UsePostNavigationResult {
  const router = useRouter();

  const navigateToPost = useCallback(
    (postId: string) => {
      const { pubky: userId, id: pId } = parseCompositeId(postId);
      router.push(`${POST_ROUTES.POST}/${userId}/${pId}`);
    },
    [router],
  );

  return { navigateToPost };
}
