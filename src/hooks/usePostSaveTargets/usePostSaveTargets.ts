'use client';

import { useRef, useState } from 'react';
import { postUriBuilder } from 'pubky-app-specs';
import { DEFAULT_COLLECTION_LAYOUT } from '@/config/collections';
import { PostController } from '@/controllers/post/post';
import {
  useAuthoredCollections,
  useAuthoredCollectionsPagination,
} from '@/hooks/useAuthoredCollections/useAuthoredCollections';
import { useBookmark } from '@/hooks/useBookmark/useBookmark';
import { usePostCollections } from '@/hooks/usePostCollections/usePostCollections';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
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
  const { waitForAuth } = useRequireAuth(options.isPickerOpen ?? true);
  const pending = useRef(new Set<string>());
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const bookmark = useBookmark(postId, { active: options.isPickerOpen ?? true });
  // Each completed toggle forces a fresh local read and stays busy until that read lands.
  // `pendingReads` maps a collection to the read version its last toggle waits for.
  const [localReads, setLocalReads] = useState({ version: 0, pendingReads: new Map<string, number>() });
  const {
    collections,
    isLoading: isCollectionsLoading,
    readVersion,
  } = useAuthoredCollections(Boolean(currentUserPubky), localReads.version);
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
  const [updatingCollectionIds, setUpdatingCollectionIds] = useState<Set<string>>(new Set());
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);

  const { pubky, id } = parseCompositeId(postId);
  const postUri = postUriBuilder(pubky, id);

  const saveTargets: PostSaveCollectionTarget[] = collections.map((collection) => {
    const id = collection.details.id;
    const isSaved = (collection.content.items ?? []).includes(postUri);
    return {
      id,
      name: collection.content.name,
      description: collection.content.description ?? '',
      isSaved,
      isUpdating: updatingCollectionIds.has(id) || (localReads.pendingReads.get(id) ?? 0) > readVersion,
    };
  });

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
    if (!target || target.isUpdating || pending.current.has(collectionId)) return false;
    pending.current.add(collectionId);

    setCollectionUpdating(collectionId, true);

    try {
      if (!(await waitForAuth(collectionId))) return false;
      await PostController.commitUpdateCollectionItem({
        collectionId,
        postId,
        shouldAdd: !target.isSaved,
      });
      toast({
        title: target.isSaved ? 'Post removed from collection.' : 'Post added to collection.',
      });
      return true;
    } catch (error) {
      Logger.error('[usePostSaveTargets] Failed to update collection membership', { error, collectionId, postId });
      toast({
        variant: 'error',
        description: isAppError(error) ? error.message : 'Failed to update collection.',
      });
      return false;
    } finally {
      // Observe the current database after success/rollback, including writes
      // from other pickers. Waiting for an expected boolean can never settle
      // when another writer has already superseded this operation. Only this
      // collection waits for the read; the other rows stay interactive.
      setLocalReads(({ version, pendingReads }) => ({
        version: version + 1,
        pendingReads: new Map(pendingReads).set(collectionId, version + 1),
      }));
      pending.current.delete(collectionId);
      setCollectionUpdating(collectionId, false);
    }
  };

  const createCollectionWithPost = async (name: string) => {
    if (!currentUserPubky || pending.current.has('create')) return false;
    pending.current.add('create');

    setIsCreatingCollection(true);

    try {
      if (!(await waitForAuth('create'))) return false;
      await PostController.commitCreateCollection({
        authorId: currentUserPubky,
        name,
        items: [postUri],
        layout: DEFAULT_COLLECTION_LAYOUT,
      });
      toast({
        title: 'Collection created and post saved.',
      });
      return true;
    } catch (error) {
      Logger.error('[usePostSaveTargets] Failed to create collection', { error, postId });
      toast({
        variant: 'error',
        description: isAppError(error) ? error.message : 'Failed to create collection.',
      });
      return false;
    } finally {
      pending.current.delete('create');
      setIsCreatingCollection(false);
    }
  };

  return {
    isBookmarked: bookmark.isBookmarked,
    isBookmarkLoading: bookmark.isLoading,
    isBookmarkToggling: bookmark.isToggling,
    collections: saveTargets,
    isCollectionsLoading: isCollectionsLoading && collections.length === 0,
    isCreatingCollection,
    hasMoreCollections,
    isCollectionsLoadingMore,
    loadMoreCollections,
    otherCollectionIds,
    isOtherCollectionsLoading,
    toggleBookmark: bookmark.toggle,
    toggleCollection,
    createCollectionWithPost,
  };
}
