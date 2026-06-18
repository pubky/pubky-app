'use client';

import { Container } from '@/atoms/Container/Container';
import { GRID_FEED_COLUMNS_CLASS, GRID_FEED_GAP_CLASS, TIMELINE_FEED_VARIANT } from '@/config/feed';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { parseCollectionContent } from '@/libs/post/collectionContent';
import { cn } from '@/libs/utils/utils';
import { buildCompositeId } from '@/models/models.utils';
import { AddContentDialog } from '@/organisms/AddContentDialog/AddContentDialog';
import { CollectionItemsEmpty } from '@/organisms/Collections/CollectionItemsEmpty/CollectionItemsEmpty';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { CollectionItemsProps } from './CollectionItems.types';

/**
 * CollectionItems
 *
 * Middle region of the single-collection view: renders the collection item feed
 * and, for owners, the persistent Add Content CTA above it.
 *
 * The collection envelope is used only to confirm whether the collection is
 * empty. The grid itself is still driven by the `COLLECTION` stream, while
 * optimistic inserts bridge the gap until Nexus reflects local membership
 * changes. While the envelope is still resolving, we render the feed so the grid
 * can show its normal loading state instead of flashing the empty placeholder.
 *
 * Empty non-owner collections can skip the feed entirely. Empty owner
 * collections keep the feed mounted so `AddContentDialog` can use the timeline
 * context for optimistic inserts.
 */
export function CollectionItems({ authorPubky, postId, pullToRefreshContainerRef }: CollectionItemsProps) {
  const compositeId = buildCompositeId({ pubky: authorPubky, id: postId });
  const { postDetails } = usePostDetails(compositeId);

  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const isOwn = currentUserPubky === authorPubky;

  // Not-found / deleted collections are gated out upstream by the `Collection`
  // template (which renders `CollectionNotFound` instead), so by the time this
  // renders `postDetails` is a resolved collection envelope. The `null` branch
  // here stays as a defensive fall-through to the feed's own empty/error state.
  const collection = postDetails ? parseCollectionContent(postDetails.content) : null;
  const isConfirmedEmpty = postDetails != null && (collection?.items?.length ?? 0) === 0;
  const emptyState = <CollectionItemsEmpty />;

  if (!isOwn && isConfirmedEmpty) {
    return (
      <Container overrideDefaults className="flex w-full flex-col gap-6">
        {emptyState}
      </Container>
    );
  }

  return (
    <Container overrideDefaults className="flex w-full flex-col gap-6">
      <TimelineFeed
        variant={TIMELINE_FEED_VARIANT.COLLECTION}
        emptyState={emptyState}
        pullToRefreshContainerRef={pullToRefreshContainerRef}
      >
        {isOwn && (
          <Container
            overrideDefaults
            data-cy="collection-add-content"
            className={cn('grid', GRID_FEED_COLUMNS_CLASS, GRID_FEED_GAP_CLASS)}
          >
            <AddContentDialog target={{ type: 'collection', collectionId: compositeId }} />
          </Container>
        )}
      </TimelineFeed>
    </Container>
  );
}
