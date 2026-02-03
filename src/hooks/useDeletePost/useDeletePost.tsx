'use client';

import { useState } from 'react';
import * as Core from '@/core';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Libs from '@/libs';
import type { UseDeletePostResult } from './useDeletePost.types';

/**
 * Hook to handle post deletion with optimistic UI updates and error recovery.
 *
 * Features:
 * - Optimistic UI updates (removes post immediately)
 * - Error recovery (restores post if deletion fails and post still exists)
 * - Local-first write handling (handles cases where local DB deletion succeeds but sync fails)
 * - User feedback via toast notifications
 *
 * @returns Object with isDeleting state and deletePost function
 *
 * @example
 * ```tsx
 * const { deletePost, isDeleting } = useDeletePost();
 *
 * <button onClick={() => deletePost(postId)} disabled={isDeleting}>
 *   {isDeleting ? 'Deleting...' : 'Delete Post'}
 * </button>
 * ```
 */
export function useDeletePost(): UseDeletePostResult {
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = Molecules.useToast();
  const timelineFeed = Organisms.useTimelineFeedContext();

  const deletePost = async (postId: string) => {
    if (isDeleting) {
      Libs.Logger.warn('[useDeletePost] Delete already in progress, ignoring request', { postId });
      return;
    }

    if (!postId || !postId.trim()) {
      Libs.Logger.error('[useDeletePost] Invalid post ID provided', { postId });
      toast({
        title: 'Error',
        description: 'Invalid post ID. Please try again.',
        className: 'destructive border-destructive bg-destructive text-destructive-foreground',
      });
      return;
    }

    setIsDeleting(true);

    // Optimistically remove post from timeline feed
    timelineFeed?.removePosts(postId);

    try {
      await Core.PostController.commitDelete({ compositePostId: postId });
      Libs.Logger.info('[useDeletePost] Post deleted successfully', { postId });
      toast({
        title: 'Post deleted',
        description: 'Your post has been deleted',
      });
    } catch (error) {
      Libs.Logger.error('[useDeletePost] Failed to delete post', {
        postId,
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      // Check if post still exists before restoring (prevents ghost posts)
      // If local DB deletion succeeded but homeserver sync failed, post won't exist.
      // If we cannot verify, prefer restoring to avoid silently dropping content from the UI.
      let postStillExists: Core.PostDetailsModelSchema | null | 'unknown' = 'unknown';
      try {
        postStillExists = await Core.PostController.getDetails({ compositeId: postId });
        Libs.Logger.debug('[useDeletePost] Post existence check completed', {
          postId,
          exists: postStillExists !== null,
        });
      } catch (detailsError) {
        Libs.Logger.warn('[useDeletePost] Failed to verify post existence after delete failure', {
          postId,
          detailsError,
          errorMessage: detailsError instanceof Error ? detailsError.message : String(detailsError),
        });
        // Keep postStillExists as 'unknown' to restore optimistically
      }

      if (postStillExists === 'unknown' || postStillExists) {
        // Restore post to timeline since deletion failed or we couldn't verify
        timelineFeed?.prependPosts(postId);
        Libs.Logger.info('[useDeletePost] Post restored to timeline after failed deletion', {
          postId,
          reason: postStillExists === 'unknown' ? 'could_not_verify' : 'post_still_exists',
        });
      } else {
        // Post was already deleted from DB (local-first write succeeded)
        // Don't restore to avoid ghost posts - homeserver will sync eventually
        Libs.Logger.warn('[useDeletePost] Post already deleted from DB, not restoring to timeline', {
          postId,
          note: 'Local deletion succeeded, homeserver sync may be pending',
        });
      }

      toast({
        title: 'Error',
        description: 'Failed to delete post. Please try again.',
        className: 'destructive border-destructive bg-destructive text-destructive-foreground',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    isDeleting,
    deletePost,
  };
}
