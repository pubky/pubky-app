'use client';

import { useState } from 'react';
import { postUriBuilder } from 'pubky-app-specs';
import { DEFAULT_COLLECTION_LAYOUT } from '@/config/collections';
import { PostController } from '@/controllers/post/post';
import {
  useAuthoredCollections,
  useAuthoredCollectionsPagination,
} from '@/hooks/useAuthoredCollections/useAuthoredCollections';
import { useBookmark } from '@/hooks/useBookmark/useBookmark';
import { usePostCollections } from '@/hooks/usePostCollections/usePostCollections';
import { isAppError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import { parseCompositeId } from '@/models/models.utils';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';

export type PostSaveCollectionTarget = {
  id: string;
  name: string;
  description: string;
  isSaved: boolean;
  isUpdating: boolean;
};

type UsePostSaveTargetsOptions = {
  /**
   * Whether the picker is open. Drives collection pagination: the picker can
   * hold more collections than one page, so it loads more while open and stays
   * inert (no fetching, no scroll listener) while closed. Also gates the
   * "Also in collections" list, which is fetched from Nexus only while open.
   */
  isPickerOpen?: boolean;
};

type UsePostSaveTargetsResult = {
  isBookmarked: boolean;
  isBookmarkLoading: boolean;
  isBookmarkToggling: boolean;
  collections: PostSaveCollectionTarget[];
  isCollectionsLoading: boolean;
  isCreatingCollection: boolean;
  hasMoreCollections: boolean;
  isCollectionsLoadingMore: boolean;
  loadMoreCollections: () => Promise<void>;
  /**
   * Composite ids of other users' collections that contain the post ("Also in
   * collections"). The viewer's own curating collections are left out: they are
   * already listed above with a check mark.
   */
  otherCollectionIds: string[];
  isOtherCollectionsLoading: boolean;
  hasMoreOtherCollections: boolean;
  isOtherCollectionsLoadingMore: boolean;
  loadMoreOtherCollections: () => Promise<void>;
  toggleBookmark: () => Promise<void>;
  toggleCollection: (collectionId: string) => Promise<void>;
  createCollectionWithPost: (name: string) => Promise<void>;
};

export function usePostSaveTargets(
  postId: string,
  { isPickerOpen = false }: UsePostSaveTargetsOptions = {},
): UsePostSaveTargetsResult {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const bookmark = useBookmark(postId);
  const { collections, isLoading: isCollectionsLoading } = useAuthoredCollections(Boolean(currentUserPubky));
  // `useAuthoredCollections` reads the whole cached stream, so it already renders
  // every page this driver persists: the picker list grows through the live read
  // rather than through a page-scoped list that would shrink back to one page.
  const {
    hasMore: hasMoreCollections,
    isLoading: isCollectionsPageLoading,
    isLoadingMore: isCollectionsPageLoadingMore,
    loadMore: loadMoreCollections,
  } = useAuthoredCollectionsPagination({
    enabled: isPickerOpen,
    onError: () => toast({ variant: 'error', description: 'Failed to load collections.' }),
  });
  // The paginator's first page counts as busy too: while it is in flight the
  // picker must not arm its scroll sentinel, or a scroll would start a second
  // concurrent load on the same stream.
  const isCollectionsLoadingMore = isCollectionsPageLoading || isCollectionsPageLoadingMore;
  const {
    collectionIds: postCollectionIds,
    isLoading: isOtherCollectionsLoading,
    hasMore: hasMoreOtherCollections,
    isLoadingMore: isOtherCollectionsLoadingMore,
    loadMore: loadMoreOtherCollections,
    removeCollection: removePostCollection,
  } = usePostCollections(postId, { enabled: isPickerOpen });
  const otherCollectionIds = postCollectionIds.filter((collectionId) => {
    // One malformed key from Nexus must not throw out of the picker's render.
    try {
      return parseCompositeId(collectionId).pubky !== currentUserPubky;
    } catch {
      return false;
    }
  });
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
      // The curators list pages by offset and its raw page includes this collection: keep the
      // offset aligned with the shorter list (an addition lands at the top and needs nothing).
      if (target.isSaved) removePostCollection(collectionId);
      toast({
        title: target.isSaved ? 'Post removed from collection.' : 'Post added to collection.',
      });
    } catch (error) {
      Logger.error('[usePostSaveTargets] Failed to update collection membership', { error, collectionId, postId });
      toast({
        variant: 'error',
        description: isAppError(error) ? error.message : 'Failed to update collection.',
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
        title: 'Collection created and post saved.',
      });
    } catch (error) {
      Logger.error('[usePostSaveTargets] Failed to create collection', { error, postId });
      toast({
        variant: 'error',
        description: isAppError(error) ? error.message : 'Failed to create collection.',
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
    hasMoreCollections,
    isCollectionsLoadingMore,
    loadMoreCollections,
    otherCollectionIds,
    isOtherCollectionsLoading,
    hasMoreOtherCollections,
    isOtherCollectionsLoadingMore,
    loadMoreOtherCollections,
    toggleBookmark: bookmark.toggle,
    toggleCollection,
    createCollectionWithPost,
  };
}
