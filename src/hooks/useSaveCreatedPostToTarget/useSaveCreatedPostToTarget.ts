'use client';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import { PostController } from '@/controllers/post/post';
import { Logger } from '@/libs/logger/logger';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { FeedInsertTarget } from '@/stores/feedOptimistic/feedOptimistic.types';

type SaveCreatedPostToTargetParams = {
  target: FeedInsertTarget;
  createdPostId: string;
  onSaved?: (createdPostId: string, target: FeedInsertTarget) => void | Promise<void>;
};

export function useSaveCreatedPostToTarget() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  return async ({ target, createdPostId, onSaved }: SaveCreatedPostToTargetParams): Promise<void> => {
    try {
      if (target.type === 'collection') {
        await PostController.commitUpdateCollectionItem({
          collectionId: target.collectionId,
          postId: createdPostId,
          shouldAdd: true,
        });
        await onSaved?.(createdPostId, target);
        toast({ title: 'Success', description: 'Post added to collection.' });
        return;
      }

      // The post is already created by the time this runs, so a missing pubky
      // (e.g. sign-out racing the create) must surface feedback.
      if (!currentUserPubky) {
        toast({ variant: 'error', description: 'Sign in to bookmark posts' });
        return;
      }

      await BookmarkController.commitCreate({ postId: createdPostId, userId: currentUserPubky });
      await onSaved?.(createdPostId, target);
      toast({ title: 'Post saved to bookmarks' });
    } catch (error) {
      Logger.error('[useSaveCreatedPostToTarget] Failed to save created post', { error, target, createdPostId });
      toast({
        variant: 'error',
        description: target.type === 'collection' ? 'Failed to update collection.' : 'Could not add bookmark',
      });
    }
  };
}
