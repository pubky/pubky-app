'use client';

import { Container } from '@/atoms/Container/Container';
import { GRID_FEED_COLUMNS_CLASS, GRID_FEED_GAP_CLASS, TIMELINE_FEED_VARIANT } from '@/config/feed';
import { cn } from '@/libs/utils/utils';
import { AddContentDialog } from '@/organisms/AddContentDialog/AddContentDialog';
import { CollectionItemsEmpty } from '@/organisms/Collections/CollectionItemsEmpty/CollectionItemsEmpty';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';

export function BookmarksItems() {
  const emptyState = <CollectionItemsEmpty dataCy="bookmarks-items-empty" />;

  return (
    <Container overrideDefaults className="flex w-full flex-col gap-6">
      <TimelineFeed variant={TIMELINE_FEED_VARIANT.BOOKMARKS} emptyState={emptyState}>
        <Container
          overrideDefaults
          data-cy="bookmarks-add-content"
          className={cn('grid', GRID_FEED_COLUMNS_CLASS, GRID_FEED_GAP_CLASS)}
        >
          <AddContentDialog target={{ type: 'bookmarks' }} />
        </Container>
      </TimelineFeed>
    </Container>
  );
}
