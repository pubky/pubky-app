'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import { Logger } from '@/libs/logger/logger';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';

export interface UseBookmarkResult {
  isBookmarked: boolean;
  isLoading: boolean;
  isToggling: boolean;
  toggle: () => Promise<void>;
}

export interface UseBookmarkOptions {
  /**
   * Override the success-path toast copy. Useful when the bookmark represents
   * something other than a generic post (e.g. a collection "Follow"/"Unfollow").
   * Failure-path toasts intentionally stay with the generic copy.
   */
  toastMessages?: {
    added: string;
    removed: string;
  };
  /**
   * Seed the initial `isBookmarked` state when the caller already knows the
   * answer (e.g. cards rendered inside the Followed-Collections section are
   * by definition bookmarked). Prevents a brief `false`→`true` UI flash
   * while the async `BookmarkController.exists` check resolves. The async
   * verification still runs to catch out-of-band state changes.
   */
  initialIsBookmarked?: boolean;
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
export function useBookmark(postId: string, options?: UseBookmarkOptions): UseBookmarkResult {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);

  // Resolve toast copy once per render so the `useCallback` dep array can track
  // string identity rather than the (possibly inline-allocated) options object.
  const addedTitle = options?.toastMessages?.added ?? 'Post saved to bookmarks';
  const removedTitle = options?.toastMessages?.removed ?? 'Post removed from bookmarks';

  const [isBookmarked, setIsBookmarked] = useState(options?.initialIsBookmarked ?? false);
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
        variant: 'error',
        description: 'Sign in to bookmark posts',
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
          title: removedTitle,
        });
      } else {
        await BookmarkController.commitCreate({ postId, userId: currentUserPubky });
        setIsBookmarked(true);
        toast({
          title: addedTitle,
        });
      }
    } catch (error) {
      Logger.error('[useBookmark] Failed to toggle bookmark', { error, postId, currentUserPubky });
      // BookmarkApplication writes local-first, so the local write may have
      // committed even though the homeserver sync threw — and the bookmarks
      // feed already reflects local state. Re-read it and mirror it here,
      // otherwise the button and the feed disagree.
      let localIsBookmarked = isBookmarked;
      try {
        localIsBookmarked = await BookmarkController.exists(postId);
      } catch {
        // Unverifiable — keep the pre-toggle state the button already shows.
      }
      setIsBookmarked(localIsBookmarked);

      if (localIsBookmarked !== isBookmarked) {
        // The local write landed and only the sync failed; the button now
        // shows the new state, so the toast must not claim the action failed.
        toast({
          variant: 'warning',
          description: isBookmarked
            ? 'Removed from bookmarks on this device, but syncing failed.'
            : 'Saved to bookmarks on this device, but syncing failed.',
        });
      } else {
        toast({
          variant: 'error',
          description: isBookmarked ? 'Could not remove bookmark' : 'Could not add bookmark',
        });
      }
    } finally {
      setIsToggling(false);
    }
  }, [postId, currentUserPubky, isBookmarked, isToggling, addedTitle, removedTitle]);

  return {
    isBookmarked,
    isLoading,
    isToggling,
    toggle,
  };
}
