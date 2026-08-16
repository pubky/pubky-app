'use client';

import { useEffect, useState } from 'react';
import { Container } from '@/atoms/Container/Container';
import { COLLECTION_LAYOUT, type CollectionLayout, DEFAULT_COLLECTION_LAYOUT } from '@/config/collections';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { useReorderCollection } from '@/hooks/useReorderCollection/useReorderCollection';
import { parseCollectionContent } from '@/libs/post/collectionContent';
import { buildCompositeId } from '@/models/models.utils';
import { CollectionHero } from '@/organisms/Collections/CollectionHero/CollectionHero';
import { CollectionHiddenItemsNotice } from '@/organisms/Collections/CollectionHiddenItemsNotice/CollectionHiddenItemsNotice';
import { CollectionItemsEmpty } from '@/organisms/Collections/CollectionItemsEmpty/CollectionItemsEmpty';
import { CollectionReorderGrid } from '@/organisms/Collections/CollectionReorderGrid/CollectionReorderGrid';
import { DialogAddContent } from '@/organisms/Collections/DialogAddContent/DialogAddContent';
import { PostMainLayoutProvider } from '@/organisms/PostMain/PostMainLayoutContext';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';
import { useAuthStore } from '@/stores/auth/auth.store';
import { LAYOUT } from '@/stores/home/home.types';
import type { CollectionItemsProps } from './CollectionItems.types';

/**
 * CollectionItems
 *
 * Middle region of the single-collection view: renders the collection hero and
 * item feed inside one `TimelineFeed` so hero actions (Add Content) can access
 * `TimelineFeedContext` for optimistic inserts.
 *
 * The collection envelope is used only to confirm whether the collection is
 * empty. The grid itself is still driven by the `COLLECTION` stream. While the
 * envelope is still resolving, we render the feed so the grid can show its
 * normal loading state instead of flashing the empty placeholder.
 *
 * Empty non-owner collections skip the feed and render hero + empty copy only.
 */
export function CollectionItems({ authorPubky, postId, postDetails, pullToRefreshContainerRef }: CollectionItemsProps) {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const isOwn = currentUserPubky === authorPubky;

  const compositeId = buildCompositeId({ pubky: authorPubky, id: postId });

  // Not-found / deleted collections are gated out upstream by the `Collection`
  // template (which renders `CollectionNotFound` instead), so by the time this
  // renders `postDetails` is a resolved collection envelope. The `null` branch
  // here stays as a defensive fall-through to the feed's own empty/error state.
  const collection = postDetails ? parseCollectionContent(postDetails.content) : null;
  const creatorLayout = collection?.layout ?? DEFAULT_COLLECTION_LAYOUT;
  const [viewerLayoutOverride, setViewerLayoutOverride] = useState<CollectionLayout | null>(null);
  const viewerLayout = viewerLayoutOverride ?? creatorLayout;

  const reorder = useReorderCollection({
    compositeCollectionId: compositeId,
    envelopeItems: collection?.items,
  });

  // If moderation blurs the collection mid-reorder, the hero swaps to the
  // blurred placeholder — which has no Save/Cancel controls — so bail out of
  // reorder mode rather than trapping the user (and keeping the FAB hidden).
  const isBlurred = postDetails?.is_blurred === true;
  const { isReorderMode, cancelReorder } = reorder;
  useEffect(() => {
    if (isBlurred && isReorderMode) cancelReorder();
  }, [isBlurred, isReorderMode, cancelReorder]);

  const hero = (
    <CollectionHero
      authorPubky={authorPubky}
      postId={postId}
      postDetails={postDetails}
      layout={viewerLayout}
      onLayoutChange={setViewerLayoutOverride}
      reorder={
        isOwn
          ? {
              isActive: reorder.isReorderMode,
              isSaving: reorder.isSaving,
              onEnter: reorder.enterReorder,
              onSave: () => void reorder.saveOrder(),
              onCancel: reorder.cancelReorder,
            }
          : undefined
      }
    />
  );

  if (postDetails === undefined) {
    return (
      <Container overrideDefaults className="w-full">
        {hero}
      </Container>
    );
  }

  // Reorder mode replaces the paginated stream grid with a full drag-and-drop
  // grid of every envelope item (always GRID, regardless of viewer layout).
  // Dropping `TimelineFeed` also drops pagination, pull-to-refresh, and the
  // trailing Add Post cell — reorder mode is for reordering only. gap-6
  // mirrors the hero → grid spacing of `TimelineFeedContent`'s container.
  if (reorder.isReorderMode) {
    return (
      <Container overrideDefaults className="flex w-full flex-col gap-6">
        {hero}
        <PostMainLayoutProvider tagsLayout="inline">
          <CollectionReorderGrid entries={reorder.draftEntries} onMove={reorder.moveItem} disabled={reorder.isSaving} />
        </PostMainLayoutProvider>
      </Container>
    );
  }

  const isConfirmedEmpty = postDetails != null && (collection?.items?.length ?? 0) === 0;
  const emptyState = <CollectionItemsEmpty />;
  const isListLayout = viewerLayout === COLLECTION_LAYOUT.LIST;
  const isVisualLayout = viewerLayout === COLLECTION_LAYOUT.VISUAL;
  const requestedLayout = isListLayout ? LAYOUT.LIST : isVisualLayout ? LAYOUT.VISUAL : LAYOUT.COLUMNS;
  const addContentVariant = isListLayout ? 'list' : isVisualLayout ? 'visual' : 'grid';

  if (!isOwn && isConfirmedEmpty) {
    // gap-6 mirrors the hero → grid/empty spacing the feed-driven paths get from
    // `TimelineFeedContent`'s container, so empty non-owner collections line up
    // with every other collection/bookmarks path.
    return (
      <Container overrideDefaults className="flex w-full flex-col gap-6">
        {hero}
        {emptyState}
      </Container>
    );
  }

  return (
    <TimelineFeed
      variant={TIMELINE_FEED_VARIANT.COLLECTION}
      requestedLayout={requestedLayout}
      emptyState={emptyState}
      pullToRefreshContainerRef={pullToRefreshContainerRef}
      visualHiddenItemsNotice={<CollectionHiddenItemsNotice />}
      trailingSlot={
        isOwn ? (
          <DialogAddContent
            triggerVariant={addContentVariant}
            target={{ type: 'collection', collectionId: compositeId }}
            dataCy={`collection-add-content-${addContentVariant}`}
          />
        ) : undefined
      }
    >
      <Container overrideDefaults>{hero}</Container>
    </TimelineFeed>
  );
}
