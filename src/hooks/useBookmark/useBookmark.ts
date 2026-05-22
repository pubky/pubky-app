'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import { Logger } from '@/libs/logger/logger';
import { useToast } from '@/molecules/Toaster/use-toast';
import { useAuthStore } from '@/stores/auth/auth.store';

export interface UseBookmarkResult {
  isBookmarked: boolean;
  isLoading: boolean;
  isToggling: boolean;
  toggle: () => Promise<void>;
}

/**
 * Custom hook to manage bookmark state for a post
 *
 * @param postId - The composite post ID (authorId:postId)
 * @returns Object with isBookmarked state and toggle function
 *
 * @example
 * ```tsx
 * function PostActions({ postId }) {
 *   const { isBookmarked, toggle } = useBookmark(postId);
 *
 *   return (
 *     <button onClick={toggle}>
 *       {isBookmarked ? 'Remove Bookmark' : 'Add Bookmark'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useBookmark(postId: string): UseBookmarkResult {
  const { toast } = useToast();
  const tToast = useTranslations('toast');
  const tBookmark = useTranslations('toast.bookmark');
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);

  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);

  // Check if post is bookmarked on mount and when postId changes
  useEffect(() => {
    if (!postId) {
      setIsBookmarked(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    BookmarkController.exists(postId)
      .then((exists) => {
        setIsBookmarked(exists);
        setIsLoading(false);
      })
      .catch((error) => {
        Logger.error('[useBookmark] Failed to check bookmark status', { error, postId });
        setIsBookmarked(false);
        setIsLoading(false);
      });
  }, [postId]);

  const toggle = useCallback(async (): Promise<void> => {
    if (!currentUserPubky) {
      toast({
        title: tToast('error'),
        description: tBookmark('loginRequired'),
      });
      return;
    }

    if (isToggling) return; // Prevent double-clicks

    setIsToggling(true);
    try {
      if (isBookmarked) {
        await BookmarkController.commitDelete({ postId, userId: currentUserPubky });
        setIsBookmarked(false);
        toast({
          title: tBookmark('removed'),
          description: tBookmark('removedDesc'),
        });
      } else {
        await BookmarkController.commitCreate({ postId, userId: currentUserPubky });
        setIsBookmarked(true);
        toast({
          title: tBookmark('added'),
          description: tBookmark('addedDesc'),
        });
      }
    } catch (error) {
      Logger.error('[useBookmark] Failed to toggle bookmark', { error, postId, currentUserPubky });
      toast({
        title: tToast('error'),
        description: isBookmarked ? tBookmark('removeFailed') : tBookmark('addFailed'),
      });
    } finally {
      setIsToggling(false);
    }
  }, [postId, currentUserPubky, isBookmarked, isToggling, toast, tToast, tBookmark]);

  return {
    isBookmarked,
    isLoading,
    isToggling,
    toggle,
  };
}
