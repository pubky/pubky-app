'use client';

import { useDeletePost } from '@/hooks/useDeletePost/useDeletePost';

/** Keep header and toast Undo actions consistent while removing only the repost. */
export function useUndoRepost(isCollectionShare = false) {
  const { deletePost, isDeleting } = useDeletePost({
    toastMessages: isCollectionShare
      ? { deleted: 'Share removed', deleteFailed: 'Could not remove share. Try again.' }
      : { deleted: 'Repost removed', deleteFailed: 'Could not remove repost. Try again.' },
  });

  return { undoRepost: deletePost, isUndoing: isDeleting };
}
