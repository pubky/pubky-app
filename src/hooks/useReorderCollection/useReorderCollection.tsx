'use client';

import { useEffect, useRef, useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import { PostController } from '@/controllers/post/post';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import { Logger } from '@/libs/logger/logger';
import { CompositeIdDomain } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri } from '@/models/models.utils';
import { toast } from '@/molecules/Toaster/toast';
import { useCollectionReorderStore } from '@/stores/collectionReorder/collectionReorder.store';
import type {
  ReorderDraftEntry,
  UseReorderCollectionOptions,
  UseReorderCollectionResult,
} from './useReorderCollection.types';

/**
 * Owns the single-collection page's reorder mode: the drafted item order
 * (a snapshot of the envelope's `items` taken on enter), drag moves, and the
 * save/cancel exits.
 *
 * The draft is local state — only the boolean "reorder active" flag goes
 * through the `collectionReorder` store, whose sole consumer is the global
 * FAB outside this React tree. Entering fires a non-blocking bulk cache warm
 * (`by_ids`) so every card can render from the local DB; individual cards
 * self-heal on cache miss regardless (`PostMain` → `usePostDetails`).
 *
 * A failed save keeps the mode and draft intact so the user can retry;
 * a save with no changes exits without committing.
 */
export function useReorderCollection({
  compositeCollectionId,
  envelopeItems,
}: UseReorderCollectionOptions): UseReorderCollectionResult {
  const [draftItems, setDraftItems] = useState<string[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // The (deduped) order as it was when reorder mode was entered — the baseline
  // for "did the user actually change anything" at save time.
  const enterSnapshotRef = useRef<string[]>([]);

  const isReorderMode = draftItems !== null;

  // Clear the global FAB flag if the page unmounts mid-reorder (navigation).
  useEffect(() => () => useCollectionReorderStore.getState().exit(), []);

  const exitReorderMode = () => {
    setDraftItems(null);
    useCollectionReorderStore.getState().exit();
  };

  const enterReorder = () => {
    if (isReorderMode) return;
    // Dedupe: only this app's write path normalizes envelopes, so a
    // third-party client can produce duplicate item URIs — which would become
    // duplicate React keys / dnd-kit sortable ids in the grid.
    const uris = [...new Set(envelopeItems ?? [])];
    enterSnapshotRef.current = uris;
    setDraftItems(uris);
    useCollectionReorderStore.getState().enter(compositeCollectionId);
    void StreamPostsController.fetchMissingPostsByUris({ uris }).catch((error) => {
      Logger.warn('[useReorderCollection] Failed to warm post cache for reorder', { compositeCollectionId, error });
    });
  };

  const moveItem = (activeUri: string, overUri: string) => {
    setDraftItems((current) => {
      if (current === null) return current;
      const from = current.indexOf(activeUri);
      const to = current.indexOf(overUri);
      if (from === -1 || to === -1 || from === to) return current;
      return arrayMove(current, from, to);
    });
  };

  const saveOrder = async () => {
    if (draftItems === null || isSaving) return;

    // Compare against the enter-time snapshot, NOT the live envelope: a save
    // with zero drags must exit without committing even when the envelope
    // changed concurrently (another tab/device) — committing would overwrite
    // that edit with our stale snapshot. When the user did drag, their order
    // is an explicit change and wins; the controller's merge still protects
    // concurrent adds/removes.
    const snapshot = enterSnapshotRef.current;
    const isUnchanged =
      draftItems.length === snapshot.length && draftItems.every((uri, index) => uri === snapshot[index]);
    if (isUnchanged) {
      exitReorderMode();
      return;
    }

    setIsSaving(true);
    try {
      await PostController.commitReorderCollectionItems({ collectionId: compositeCollectionId, items: draftItems });
      toast({ title: 'Collection order saved', dismissButton: true });
      exitReorderMode();
    } catch (error) {
      Logger.error('[useReorderCollection] Failed to save collection order', { compositeCollectionId, error });
      // Keep the mode and draft so the user can retry or cancel explicitly.
      toast({ variant: 'error', description: 'Failed to save the new order. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  const draftEntries: ReorderDraftEntry[] = (draftItems ?? []).map((uri) => ({
    uri,
    postId: buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.POSTS }),
  }));

  return {
    isReorderMode,
    isSaving,
    draftEntries,
    enterReorder,
    moveItem,
    saveOrder,
    cancelReorder: exitReorderMode,
  };
}
