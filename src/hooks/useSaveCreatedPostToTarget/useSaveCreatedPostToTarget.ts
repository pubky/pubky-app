'use client';

import { useTranslations } from 'next-intl';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import { PostController } from '@/controllers/post/post';
import { Logger } from '@/libs/logger/logger';
import { useToast } from '@/molecules/Toaster/use-toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { FeedInsertTarget } from '@/stores/feedOptimistic/feedOptimistic.types';

type SaveCreatedPostToTargetParams = {
  target: FeedInsertTarget;
  createdPostId: string;
  onSaved?: (createdPostId: string, target: FeedInsertTarget) => void | Promise<void>;
};

export function useSaveCreatedPostToTarget() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const { toast } = useToast();
  const tFab = useTranslations('fab');
  const tToast = useTranslations('toast');
  const tSave = useTranslations('postSave');
  const tBookmark = useTranslations('toast.bookmark');

  return async ({ target, createdPostId, onSaved }: SaveCreatedPostToTargetParams): Promise<void> => {
    try {
      if (target.type === 'collection') {
        await PostController.commitUpdateCollectionItem({
          collectionId: target.collectionId,
          postId: createdPostId,
          shouldAdd: true,
        });
        await onSaved?.(createdPostId, target);
        toast({ title: tToast('success'), description: tFab('addedToCollection') });
        return;
      }

      // The post is already created by the time this runs, so a missing pubky
      // (e.g. sign-out racing the create) must surface feedback.
      if (!currentUserPubky) {
        toast({ variant: 'error', description: tBookmark('loginRequired') });
        return;
      }

      await BookmarkController.commitCreate({ postId: createdPostId, userId: currentUserPubky });
      await onSaved?.(createdPostId, target);
      toast({ title: tBookmark('added') });
    } catch (error) {
      Logger.error('[useSaveCreatedPostToTarget] Failed to save created post', { error, target, createdPostId });
      toast({
        variant: 'error',
        description: target.type === 'collection' ? tSave('updateCollectionFailed') : tBookmark('addFailed'),
      });
    }
  };
}
