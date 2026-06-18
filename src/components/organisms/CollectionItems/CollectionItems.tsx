'use client';

import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { GRID_FEED_COLUMNS_CLASS, GRID_FEED_GAP_CLASS, TIMELINE_FEED_VARIANT } from '@/config/feed';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { parseCollectionContent } from '@/libs/post/collectionContent';
import { cn } from '@/libs/utils/utils';
import { buildCompositeId } from '@/models/models.utils';
import { AddContentDialog } from '@/organisms/AddContentDialog/AddContentDialog';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { CollectionItemsProps } from './CollectionItems.types';

/**
 * CollectionItems
 *
 * Middle region of the single-collection view: either the infinite-scroll grid
 * of the collection's items (`TimelineFeed` with the `COLLECTION` variant) or,
 * when the collection has no items, a variant-specific empty state.
 *
 * Item membership is read from the parsed envelope (`items.length`), the source
 * of truth for the collection. While the envelope is still resolving we render
 * the feed (which shows its own grid skeleton); the empty state appears only
 * once the envelope is confirmed empty, so a populated collection never flashes
 * the placeholder.
 *
 * The owner can add content from the top of the region regardless of whether
 * the collection currently has items; non-owners only see the feed or empty text.
 */
export function CollectionItems({ authorPubky, postId }: CollectionItemsProps) {
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

  return (
    <Container overrideDefaults className="flex w-full flex-col gap-6">
      {isOwn && (
        <Container
          overrideDefaults
          data-cy="collection-add-content"
          className={cn('grid', GRID_FEED_COLUMNS_CLASS, GRID_FEED_GAP_CLASS)}
        >
          <AddContentDialog />
        </Container>
      )}
      {isConfirmedEmpty ? <CollectionItemsEmpty /> : <TimelineFeed variant={TIMELINE_FEED_VARIANT.COLLECTION} />}
    </Container>
  );
}

function CollectionItemsEmpty() {
  const t = useTranslations('collections.single');

  return (
    <Container overrideDefaults data-cy="collection-items-empty" className="w-full">
      <Typography overrideDefaults className="text-center text-base font-medium text-muted-foreground">
        {t('empty')}
      </Typography>
    </Container>
  );
}
