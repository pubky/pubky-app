'use client';

import type { ReactNode } from 'react';
import { Container } from '@/atoms/Container/Container';
import { COLLECTION_LAYOUT } from '@/config/collections';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { useResourceBookmarks } from '@/hooks/useResourceBookmarks/useResourceBookmarks';
import { CollectionItemsEmpty } from '@/organisms/Collections/CollectionItemsEmpty/CollectionItemsEmpty';
import { CollectionResourceItems } from '@/organisms/Collections/CollectionResourceItems/CollectionResourceItems';
import { DialogAddContent } from '@/organisms/Collections/DialogAddContent/DialogAddContent';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';
import { LAYOUT } from '@/stores/home/home.types';

interface BookmarksItemsProps {
  header: ReactNode;
}

/**
 * The viewer's bookmarks: the bookmarked links (external resources, from their homeserver listing)
 * as a collection shows its links (`CollectionResourceItems`) under the hero, then the bookmarked
 * posts' feed. With bookmarked links only, the feed shows nothing for no posts (not "empty").
 */
export function BookmarksItems({ header }: BookmarksItemsProps) {
  const resourceBookmarks = useResourceBookmarks();
  const resourceUris = resourceBookmarks ?? [];
  // Not "empty" while the links are listed or when there are some.
  const emptyState =
    resourceBookmarks === undefined || resourceUris.length > 0 ? (
      <></>
    ) : (
      <CollectionItemsEmpty dataCy="bookmarks-items-empty" />
    );

  return (
    <TimelineFeed
      variant={TIMELINE_FEED_VARIANT.BOOKMARKS}
      requestedLayout={LAYOUT.CARDS}
      emptyState={emptyState}
      trailingSlot={
        <DialogAddContent triggerVariant="grid" target={{ type: 'bookmarks' }} dataCy="bookmarks-add-content-grid" />
      }
    >
      <Container overrideDefaults className="flex flex-col gap-6">
        {header}
        <CollectionResourceItems uris={resourceUris} layout={COLLECTION_LAYOUT.CARDS} />
      </Container>
    </TimelineFeed>
  );
}
