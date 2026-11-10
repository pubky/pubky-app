'use client';

import { PostController } from '@/controllers/post/post';
import { useBookmark } from '@/hooks/useBookmark/useBookmark';
import { useCollectionSaveTargets } from '@/hooks/useCollectionSaveTargets/useCollectionSaveTargets';
import type { CollectionSaveTarget } from '@/hooks/useCollectionSaveTargets/useCollectionSaveTargets.types';
import { usePostCollections } from '@/hooks/usePostCollections/usePostCollections';
import { parseCompositeId } from '@/models/models.utils';
import { postReferenceSpellings } from '@/pipes/post/post.reference';
import { useAuthStore } from '@/stores/auth/auth.store';

export type PostSaveCollectionTarget = CollectionSaveTarget;

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
   * collections"), a sample of one page. The viewer's own curating collections are
   * left out: they are already listed above with a check mark.
   */
  otherCollectionIds: string[];
  isOtherCollectionsLoading: boolean;
  toggleBookmark: () => Promise<boolean>;
  toggleCollection: (collectionId: string) => Promise<boolean>;
  createCollectionWithPost: (name: string) => Promise<boolean>;
};

export function usePostSaveTargets(postId: string, options: UsePostSaveTargetsOptions = {}): UsePostSaveTargetsResult {
  const isPickerOpen = options.isPickerOpen ?? false;
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const bookmark = useBookmark(postId, { active: options.isPickerOpen ?? true });
  const { pubky, id } = parseCompositeId(postId);
  // A collection may spell the post either way (an item added before its author migrated keeps
  // the 0.x spelling); a new collection curates it by its v1 reference.
  const postUris = postReferenceSpellings(pubky, id);
  const collectionTargets = useCollectionSaveTargets({
    itemUris: postUris,
    isPickerOpen,
    active: options.isPickerOpen ?? true,
    commitToggle: (collectionId, shouldAdd) =>
      PostController.commitUpdateCollectionItem({ collectionId, postId, shouldAdd }),
    messages: {
      added: 'Post added to collection.',
      removed: 'Post removed from collection.',
      created: 'Collection created and post saved.',
    },
    logContext: { source: 'usePostSaveTargets', ids: { postId } },
  });
  const { collectionIds: postCollectionIds, isLoading: isOtherCollectionsLoading } = usePostCollections(postId, {
    enabled: isPickerOpen,
  });
  const otherCollectionIds = postCollectionIds.filter((collectionId) => {
    // One malformed key from Nexus must not throw out of the picker's render.
    try {
      return parseCompositeId(collectionId).pubky !== currentUserPubky;
    } catch {
      return false;
    }
  });

  return {
    isBookmarked: bookmark.isBookmarked,
    isBookmarkLoading: bookmark.isLoading,
    isBookmarkToggling: bookmark.isToggling,
    collections: collectionTargets.collections,
    isCollectionsLoading: collectionTargets.isCollectionsLoading,
    isCreatingCollection: collectionTargets.isCreatingCollection,
    hasMoreCollections: collectionTargets.hasMoreCollections,
    isCollectionsLoadingMore: collectionTargets.isCollectionsLoadingMore,
    loadMoreCollections: collectionTargets.loadMoreCollections,
    otherCollectionIds,
    isOtherCollectionsLoading,
    toggleBookmark: bookmark.toggle,
    toggleCollection: collectionTargets.toggleCollection,
    createCollectionWithPost: collectionTargets.createCollectionWithItem,
  };
}
