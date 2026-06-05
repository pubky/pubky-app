'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { GRID_FEED_COLUMNS_CLASS, GRID_FEED_GAP_CLASS, TIMELINE_FEED_VARIANT } from '@/config/feed';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { parseCollectionContent } from '@/libs/post/collectionContent';
import { cn } from '@/libs/utils/utils';
import { buildCompositeId } from '@/models/models.utils';
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
 * Empty state:
 *   - owner → a placeholder "+ Add content" CTA (the flow is out of scope this
 *     slice; the button is a no-op `// TODO`).
 *   - other → plain empty text (no CTA).
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

  if (isConfirmedEmpty) {
    return <CollectionItemsEmpty isOwner={isOwn} />;
  }

  return <TimelineFeed variant={TIMELINE_FEED_VARIANT.COLLECTION} />;
}

function CollectionItemsEmpty({ isOwner }: { isOwner: boolean }) {
  const t = useTranslations('collections.single');

  // Placeholder — the add-content flow itself is out of scope this slice.
  // TODO: wire in collection add-content (#1866 follow-up).
  const handleAddContent = () => {};

  if (!isOwner) {
    return (
      <Container overrideDefaults data-cy="collection-items-empty" className="w-full">
        <Typography overrideDefaults className="text-center text-base font-medium text-muted-foreground">
          {t('empty')}
        </Typography>
      </Container>
    );
  }

  return (
    <Container
      overrideDefaults
      data-cy="collection-items-empty"
      className={cn('grid', GRID_FEED_COLUMNS_CLASS, GRID_FEED_GAP_CLASS)}
    >
      <Button
        overrideDefaults
        onClick={handleAddContent}
        aria-label={t('addContent')}
        className="flex h-39 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
      >
        <Plus className="size-4 shrink-0" />
        <Typography as="span" overrideDefaults className="text-sm font-bold">
          {t('addContent')}
        </Typography>
      </Button>
    </Container>
  );
}
