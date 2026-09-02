'use client';

import { useState } from 'react';
import { PostController } from '@/controllers/post/post';
import { Logger } from '@/libs/logger/logger';
import { isPostDeleted } from '@/libs/utils/utils';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import { toast } from '@/molecules/Toaster/toast';
import { useTimelineFeedContext } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeedContext';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import type { UseDeletePostOptions, UseDeletePostResult } from './useDeletePost.types';

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
export function useDeletePost(options?: UseDeletePostOptions): UseDeletePostResult {
  const [isDeleting, setIsDeleting] = useState(false);
  const timelineFeed = useTimelineFeedContext();

  // Resolve toast copy with caller overrides so callers like CollectionCard /
  // CollectionHero can swap in collection-specific copy without forking the hook.
  // Missing fields fall back to the generic `toast.post.*` strings.
  const deletedTitle = options?.toastMessages?.deleted ?? 'Post deleted';
  const deleteFailedDesc = options?.toastMessages?.deleteFailed ?? 'Could not delete post. Try again.';

  const deletePost = async (postId: string) => {
    if (isDeleting) {
      Logger.warn('[useDeletePost] Delete already in progress, ignoring request', { postId });
      return;
    }

    if (!postId || !postId.trim()) {
      Logger.error('[useDeletePost] Invalid post ID provided', { postId });
      toast({
        variant: 'error',
        description: 'Invalid post. Try again.',
      });
      return;
    }

    setIsDeleting(true);

    // Optimistically remove post from timeline feed
    timelineFeed?.removePosts(postId);

    try {
      await PostController.commitDelete({ compositePostId: postId });
      // Clear the optimistic attachment cache so its blob URLs are revoked and
      // don't shadow the tombstone for the rest of the session
      useLocalFilesStore.getState().setPostAttachments(postId, []);
      Logger.info('[useDeletePost] Post deleted successfully', { postId });
      toast({
        title: deletedTitle,
        dismissButton: true,
      });
    } catch (error) {
      Logger.error('[useDeletePost] Failed to delete post', {
        postId,
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      // Decide whether to restore the optimistic removal. After the
      // `LocalPostService.delete` tombstone refactor, a successful local-first
      // write leaves a row with `content === '[DELETED]'` rather than removing
      // the row, so an existence check alone can no longer distinguish
      // "local-first succeeded, homeserver sync failed" from "local-first
      // never committed." We have to look at the content too:
      //   - row gone (null)           → local hard-delete committed (legacy)  → don't restore
      //   - row exists, tombstoned    → local soft-delete committed           → don't restore
      //   - row exists, live content  → local-first never committed           → restore
      //   - check threw ('unknown')   → couldn't verify                       → restore optimistically
      // Restoring a tombstoned row would just pop a `PostUnavailable` /
      // `CollectionDeleted` molecule back into the timeline where the user's
      // post used to be, which is more confusing than the error toast alone.
      let postStillExists: PostDetailsModelSchema | null | 'unknown' = 'unknown';
      try {
        postStillExists = await PostController.getDetails({ compositeId: postId });
        Logger.debug('[useDeletePost] Post existence check completed', {
          postId,
          exists: postStillExists !== null,
          tombstoned: postStillExists !== null && isPostDeleted(postStillExists.content),
        });
      } catch (detailsError) {
        Logger.warn('[useDeletePost] Failed to verify post existence after delete failure', {
          postId,
          detailsError,
          errorMessage: detailsError instanceof Error ? detailsError.message : String(detailsError),
        });
        // Keep postStillExists as 'unknown' to restore optimistically
      }

      const localWriteCommitted =
        postStillExists === null || (postStillExists !== 'unknown' && isPostDeleted(postStillExists.content));

      if (localWriteCommitted) {
        // Local-first write succeeded (row gone or tombstoned). Leave the
        // optimistic removal in place — homeserver retry can resync. The
        // optimistic attachment cache is cleared here too (as on success): the
        // post renders as deleted either way, so its blob URLs are dead weight.
        useLocalFilesStore.getState().setPostAttachments(postId, []);
        Logger.warn('[useDeletePost] Local write committed; not restoring to timeline', {
          postId,
          state: postStillExists === null ? 'row_removed' : 'tombstoned',
          note: 'Homeserver sync failed; user can retry to resync',
        });
      } else {
        // Either we couldn't verify, or the row exists with original content
        // (local-first never committed). Put the card back.
        timelineFeed?.prependPosts(postId);
        Logger.info('[useDeletePost] Post restored to timeline after failed deletion', {
          postId,
          reason: postStillExists === 'unknown' ? 'could_not_verify' : 'local_write_did_not_commit',
        });
      }

      toast({
        variant: 'error',
        description: deleteFailedDesc,
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
