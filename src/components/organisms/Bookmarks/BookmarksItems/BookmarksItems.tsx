'use client';

import type { ReactNode } from 'react';
import { Container } from '@/atoms/Container/Container';
import type { CollectionViewLayout } from '@/config/collections';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { CollectionItemsEmpty } from '@/organisms/Collections/CollectionItemsEmpty/CollectionItemsEmpty';
import { DialogAddContent } from '@/organisms/Collections/DialogAddContent/DialogAddContent';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';
import { LAYOUT } from '@/stores/home/home.types';

interface BookmarksItemsProps {
  header: ReactNode;
  layout?: CollectionViewLayout;
}

export function BookmarksItems({ header, layout = 'grid' }: BookmarksItemsProps) {
  const emptyState = <CollectionItemsEmpty dataCy="bookmarks-items-empty" />;

  return (
    <TimelineFeed
      variant={TIMELINE_FEED_VARIANT.BOOKMARKS}
      requestedLayout={layout === 'masonry' ? 'masonry' : LAYOUT.COLUMNS}
      emptyState={emptyState}
      trailingSlot={
        <DialogAddContent triggerVariant="grid" target={{ type: 'bookmarks' }} dataCy="bookmarks-add-content-grid" />
      }
    >
      <Container overrideDefaults>{header}</Container>
    </TimelineFeed>
  );
}
