'use client';

import type { ReactNode } from 'react';
import { Container } from '@/atoms/Container/Container';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { CollectionItemsEmpty } from '@/organisms/Collections/CollectionItemsEmpty/CollectionItemsEmpty';
import { DialogAddContent } from '@/organisms/Collections/DialogAddContent/DialogAddContent';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';

interface BookmarksItemsProps {
  header: ReactNode;
}

export function BookmarksItems({ header }: BookmarksItemsProps) {
  const emptyState = <CollectionItemsEmpty dataCy="bookmarks-items-empty" />;

  return (
    <TimelineFeed
      variant={TIMELINE_FEED_VARIANT.BOOKMARKS}
      emptyState={emptyState}
      trailingSlot={
        <DialogAddContent triggerVariant="grid" target={{ type: 'bookmarks' }} dataCy="bookmarks-add-content-grid" />
      }
    >
      <Container overrideDefaults>{header}</Container>
    </TimelineFeed>
  );
}
