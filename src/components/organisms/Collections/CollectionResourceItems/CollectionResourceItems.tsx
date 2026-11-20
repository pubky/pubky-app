'use client';

import { Container } from '@/atoms/Container/Container';
import { COLLECTION_LAYOUT, type CollectionLayout } from '@/config/collections';
import { cn } from '@/libs/utils/utils';
import { ResourceItem } from '@/molecules/ResourceCard/ResourceItem';
import { CollectionHiddenItemsNotice } from '@/organisms/Collections/CollectionHiddenItemsNotice/CollectionHiddenItemsNotice';

interface CollectionResourceItemsProps {
  /** The collection's external resources (items that are no Pubky object), in the collection's order. */
  uris: string[];
  /** The layout the viewer sees the collection in: one column for List, two from `lg` otherwise. */
  layout: CollectionLayout;
}

/**
 * The external resources a collection holds, each as an item of its own (`ResourceItem`). The
 * Visual layout shows media posts only, so there its notice says some items are hidden.
 */
export function CollectionResourceItems({ uris, layout }: CollectionResourceItemsProps) {
  if (uris.length === 0) return null;
  if (layout === COLLECTION_LAYOUT.VISUAL) return <CollectionHiddenItemsNotice />;
  return (
    <Container
      overrideDefaults
      as="section"
      aria-label="External resources in this collection"
      data-testid="collection-resource-items"
      className={cn('grid gap-4', layout === COLLECTION_LAYOUT.LIST ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2')}
    >
      {uris.map((uri) => (
        <ResourceItem key={uri} uri={uri} data-testid="collection-resource-item" />
      ))}
    </Container>
  );
}
