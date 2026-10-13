'use client';

import { useDeletePost } from '@/hooks/useDeletePost/useDeletePost';

/**
 * Keep header and toast Undo actions consistent while removing only the repost.
 * The toast's Undo passes `outlivesOwner`: it is clicked after the repost dialog has closed.
 */
export function useUndoRepost(isCollectionShare = false, options?: { outlivesOwner?: boolean }) {
  const { deletePost, isDeleting } = useDeletePost({
    outlivesOwner: options?.outlivesOwner,
    toastMessages: isCollectionShare
      ? { deleted: 'Share removed', deleteFailed: 'Could not remove share. Try again.' }
      : { deleted: 'Repost removed', deleteFailed: 'Could not remove repost. Try again.' },
  });

  return { undoRepost: deletePost, isUndoing: isDeleting };
}
