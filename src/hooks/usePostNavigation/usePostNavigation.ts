'use client';

import type React from 'react';
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { POST_ROUTES } from '@/app/routes';
import type { UsePostNavigationResult } from './usePostNavigation.types';
import { parseCompositeId } from '@/models/models.utils';
/**
 * usePostNavigation
 *
 * Shared hook for post navigation logic.
 * Handles routing to post detail pages, including new-tab opens
 * via Cmd/Ctrl/Shift+Click and middle-click.
 */
export function usePostNavigation(): UsePostNavigationResult {
  const router = useRouter();

  const getPostHref = useCallback((postId: string) => {
    const { pubky: userId, id: pId } = parseCompositeId(postId);
    return `${POST_ROUTES.POST}/${userId}/${pId}`;
  }, []);

  const navigateToPost = useCallback(
    (postId: string) => {
      router.push(getPostHref(postId));
    },
    [router, getPostHref],
  );

  const handlePostClick = useCallback(
    (postId: string, event: React.MouseEvent) => {
      // Don't navigate if the user is selecting text inside the card.
      const selection = typeof window !== 'undefined' ? window.getSelection() : null;
      if (selection && selection.toString().length > 0) return;

      const href = getPostHref(postId);
      if (event.metaKey || event.ctrlKey || event.shiftKey) {
        window.open(href, '_blank', 'noopener,noreferrer');
        return;
      }
      router.push(href);
    },
    [router, getPostHref],
  );

  const handlePostAuxClick = useCallback(
    (postId: string, event: React.MouseEvent) => {
      if (event.button !== 1) return;
      event.preventDefault();
      window.open(getPostHref(postId), '_blank', 'noopener,noreferrer');
    },
    [getPostHref],
  );

  return { getPostHref, navigateToPost, handlePostClick, handlePostAuxClick };
}
