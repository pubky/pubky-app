'use client';

import { Container } from '@/atoms/Container/Container';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { parseCollectionContent } from '@/libs/post/collectionContent';
import { buildCompositeId } from '@/models/models.utils';
import { CollectionHero } from '@/organisms/Collections/CollectionHero/CollectionHero';
import { CollectionItemsEmpty } from '@/organisms/Collections/CollectionItemsEmpty/CollectionItemsEmpty';
import { DialogAddContent } from '@/organisms/Collections/DialogAddContent/DialogAddContent';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';
import { useAuthStore } from '@/stores/auth/auth.store';
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

  const hero = <CollectionHero authorPubky={authorPubky} postId={postId} postDetails={postDetails} />;

  // Not-found / deleted collections are gated out upstream by the `Collection`
  // template (which renders `CollectionNotFound` instead), so by the time this
  // renders `postDetails` is a resolved collection envelope. The `null` branch
  // here stays as a defensive fall-through to the feed's own empty/error state.
  const collection = postDetails ? parseCollectionContent(postDetails.content) : null;
  const isConfirmedEmpty = postDetails != null && (collection?.items?.length ?? 0) === 0;
  const emptyState = <CollectionItemsEmpty />;

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
      emptyState={emptyState}
      pullToRefreshContainerRef={pullToRefreshContainerRef}
      gridTrailingSlot={
        isOwn ? (
          <DialogAddContent
            triggerVariant="grid"
            target={{ type: 'collection', collectionId: compositeId }}
            dataCy="collection-add-content-grid"
          />
        ) : undefined
      }
    >
      <Container overrideDefaults>{hero}</Container>
    </TimelineFeed>
  );
}
