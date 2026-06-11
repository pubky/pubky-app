'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { GRID_FEED_COLUMNS_CLASS, GRID_FEED_GAP_CLASS, TIMELINE_FEED_VARIANT } from '@/config/feed';
import { cn } from '@/libs/utils/utils';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';

export function BookmarksItems() {
  // The empty state is driven by the bookmarks stream itself (via TimelineFeed's
  // `emptyState` slot), not the aggregate bookmark count — the two are populated
  // by separate paths and can diverge, so gating on the count could hide a
  // non-empty grid (or render an empty grid for a stale non-zero count).
  return <TimelineFeed variant={TIMELINE_FEED_VARIANT.BOOKMARKS} emptyState={<BookmarksItemsEmpty />} />;
}

function BookmarksItemsEmpty() {
  const t = useTranslations('collections.single');

  // Placeholder — bookmarks now use collection-style empty chrome, but the
  // add-content flow itself is out of scope for this slice.
  // TODO: wire in collection add-content (#1866 follow-up).
  const handleAddContent = () => {};

  return (
    <Container
      overrideDefaults
      data-cy="bookmarks-items-empty"
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
