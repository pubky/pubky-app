'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PostController } from '@/controllers/post/post';
import { Logger } from '@/libs/logger/logger';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import { useToast } from '@/molecules/Toaster/use-toast';
import { useTimelineFeedContext } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeedContext';
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
  const { toast } = useToast();
  const tPost = useTranslations('toast.post');
  const timelineFeed = useTimelineFeedContext();

  const deletePost = async (postId: string) => {
    if (isDeleting) {
      Logger.warn('[useDeletePost] Delete already in progress, ignoring request', { postId });
      return;
    }

    if (!postId || !postId.trim()) {
      Logger.error('[useDeletePost] Invalid post ID provided', { postId });
      toast({
        variant: 'error',
        description: tPost('invalidPostId'),
      });
      return;
    }

    setIsDeleting(true);

    // Optimistically remove post from timeline feed
    timelineFeed?.removePosts(postId);

    try {
      await PostController.commitDelete({ compositePostId: postId });
      Logger.info('[useDeletePost] Post deleted successfully', { postId });
      toast({
        title: tPost('postDeleted'),
        dismissButton: true,
      });
    } catch (error) {
      Logger.error('[useDeletePost] Failed to delete post', {
        postId,
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      // Check if post still exists before restoring (prevents ghost posts)
      // If local DB deletion succeeded but homeserver sync failed, post won't exist.
      // If we cannot verify, prefer restoring to avoid silently dropping content from the UI.
      let postStillExists: PostDetailsModelSchema | null | 'unknown' = 'unknown';
      try {
        postStillExists = await PostController.getDetails({ compositeId: postId });
        Logger.debug('[useDeletePost] Post existence check completed', {
          postId,
          exists: postStillExists !== null,
        });
      } catch (detailsError) {
        Logger.warn('[useDeletePost] Failed to verify post existence after delete failure', {
          postId,
          detailsError,
          errorMessage: detailsError instanceof Error ? detailsError.message : String(detailsError),
        });
        // Keep postStillExists as 'unknown' to restore optimistically
      }

      if (postStillExists === 'unknown' || postStillExists) {
        // Restore post to timeline since deletion failed or we couldn't verify
        timelineFeed?.prependPosts(postId);
        Logger.info('[useDeletePost] Post restored to timeline after failed deletion', {
          postId,
          reason: postStillExists === 'unknown' ? 'could_not_verify' : 'post_still_exists',
        });
      } else {
        // Post was already deleted from DB (local-first write succeeded)
        // Don't restore to avoid ghost posts - homeserver will sync eventually
        Logger.warn('[useDeletePost] Post already deleted from DB, not restoring to timeline', {
          postId,
          note: 'Local deletion succeeded, homeserver sync may be pending',
        });
      }

      toast({
        variant: 'error',
        description: tPost('deleteFailed'),
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
