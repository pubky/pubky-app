'use client';

import { useRef, useState } from 'react';
import { DEFAULT_COLLECTION_LAYOUT } from '@/config/collections';
import { PostController } from '@/controllers/post/post';
import {
  useAuthoredCollections,
  useAuthoredCollectionsPagination,
} from '@/hooks/useAuthoredCollections/useAuthoredCollections';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { isAppError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import type {
  CollectionSaveTarget,
  UseCollectionSaveTargetsParams,
  UseCollectionSaveTargetsResult,
} from './useCollectionSaveTargets.types';

/**
 * The viewer's own collections as save targets for one item (a post, or an external resource's
 * link): which of them hold it, toggling it in or out, and a new collection created with it.
 *
 * `itemUris` are the item's spellings: a collection holding any of them holds the item, and a new
 * collection gets `itemUris[0]`. `commitToggle` writes one collection's membership, so the item
 * kind decides which controller method edits the collection.
 */
export function useCollectionSaveTargets({
  itemUris,
  isPickerOpen,
  active = true,
  commitToggle,
  messages,
  logContext,
}: UseCollectionSaveTargetsParams): UseCollectionSaveTargetsResult {
  const { waitForAuth } = useRequireAuth(active);
  const pending = useRef(new Set<string>());
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
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
  const [updatingCollectionIds, setUpdatingCollectionIds] = useState<Set<string>>(new Set());
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);

  const saveTargets: CollectionSaveTarget[] = collections.map((collection) => {
    const id = collection.details.id;
    const isSaved = (collection.content.items ?? []).some((item) => itemUris.includes(item));
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
      await commitToggle(collectionId, !target.isSaved);
      toast({
        title: target.isSaved ? messages.removed : messages.added,
      });
      return true;
    } catch (error) {
      Logger.error(`[${logContext.source}] Failed to update collection membership`, {
        error,
        collectionId,
        ...logContext.ids,
      });
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

  const createCollectionWithItem = async (name: string) => {
    if (!currentUserPubky || pending.current.has('create')) return false;
    pending.current.add('create');

    setIsCreatingCollection(true);

    try {
      if (!(await waitForAuth('create'))) return false;
      await PostController.commitCreateCollection({
        authorId: currentUserPubky,
        name,
        items: [itemUris[0]],
        layout: DEFAULT_COLLECTION_LAYOUT,
      });
      toast({
        title: messages.created,
      });
      return true;
    } catch (error) {
      Logger.error(`[${logContext.source}] Failed to create collection`, { error, ...logContext.ids });
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
    collections: saveTargets,
    isCollectionsLoading: isCollectionsLoading && collections.length === 0,
    isCreatingCollection,
    hasMoreCollections,
    isCollectionsLoadingMore,
    loadMoreCollections,
    toggleCollection,
    createCollectionWithItem,
  };
}
