'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { postUriBuilder } from 'pubky-app-specs';
import { DEFAULT_COLLECTION_LAYOUT } from '@/config/collections';
import { PostController } from '@/controllers/post/post';
import { useAuthoredCollections } from '@/hooks/useAuthoredCollections/useAuthoredCollections';
import { useBookmark } from '@/hooks/useBookmark/useBookmark';
import { isAppError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import { parseCompositeId } from '@/models/models.utils';
import { useToast } from '@/molecules/Toaster/use-toast';
import { useAuthStore } from '@/stores/auth/auth.store';

export type PostSaveCollectionTarget = {
  id: string;
  name: string;
  description: string;
  isSaved: boolean;
  isUpdating: boolean;
};

type UsePostSaveTargetsResult = {
  isBookmarked: boolean;
  isBookmarkLoading: boolean;
  isBookmarkToggling: boolean;
  collections: PostSaveCollectionTarget[];
  isCollectionsLoading: boolean;
  isCreatingCollection: boolean;
  toggleBookmark: () => Promise<void>;
  toggleCollection: (collectionId: string) => Promise<void>;
  createCollectionWithPost: (name: string) => Promise<void>;
};

export function usePostSaveTargets(postId: string): UsePostSaveTargetsResult {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const bookmark = useBookmark(postId);
  const { collections, isLoading: isCollectionsLoading } = useAuthoredCollections(Boolean(currentUserPubky));
  const { toast } = useToast();
  const tSave = useTranslations('postSave');
  const [updatingCollectionIds, setUpdatingCollectionIds] = useState<Set<string>>(new Set());
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);

  const { pubky, id } = parseCompositeId(postId);
  const postUri = postUriBuilder(pubky, id);

  const saveTargets: PostSaveCollectionTarget[] = collections.map((collection) => ({
    id: collection.details.id,
    name: collection.content.name,
    description: collection.content.description ?? '',
    isSaved: (collection.content.items ?? []).includes(postUri),
    isUpdating: updatingCollectionIds.has(collection.details.id),
  }));

  const setCollectionUpdating = (collectionId: string, isUpdating: boolean) => {
    setUpdatingCollectionIds((current) => {
      const next = new Set(current);
      if (isUpdating) {
        next.add(collectionId);
      } else {
        next.delete(collectionId);
      }
      return next;
    });
  };

  const toggleCollection = async (collectionId: string) => {
    const target = saveTargets.find((collection) => collection.id === collectionId);
    if (!target || target.isUpdating) return;

    setCollectionUpdating(collectionId, true);

    try {
      await PostController.commitUpdateCollectionItem({
        collectionId,
        postId,
        shouldAdd: !target.isSaved,
      });
      toast({
        title: target.isSaved ? tSave('removedFromCollection') : tSave('addedToCollection'),
      });
    } catch (error) {
      Logger.error('[usePostSaveTargets] Failed to update collection membership', { error, collectionId, postId });
      toast({
        variant: 'error',
        description: isAppError(error) ? error.message : tSave('updateCollectionFailed'),
      });
    } finally {
      setCollectionUpdating(collectionId, false);
    }
  };

  const createCollectionWithPost = async (name: string) => {
    if (!currentUserPubky || isCreatingCollection) return;

    setIsCreatingCollection(true);

    try {
      await PostController.commitCreateCollection({
        authorId: currentUserPubky,
        name,
        items: [postUri],
        layout: DEFAULT_COLLECTION_LAYOUT,
      });
      toast({
        title: tSave('collectionCreated'),
      });
    } catch (error) {
      Logger.error('[usePostSaveTargets] Failed to create collection', { error, postId });
      toast({
        variant: 'error',
        description: isAppError(error) ? error.message : tSave('createCollectionFailed'),
      });
    } finally {
      setIsCreatingCollection(false);
    }
  };

  return {
    isBookmarked: bookmark.isBookmarked,
    isBookmarkLoading: bookmark.isLoading,
    isBookmarkToggling: bookmark.isToggling,
    collections: saveTargets,
    isCollectionsLoading,
    isCreatingCollection,
    toggleBookmark: bookmark.toggle,
    toggleCollection,
    createCollectionWithPost,
  };
}
