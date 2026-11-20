'use client';

import { getResourceRoute } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { COLLECTION_LAYOUT, type CollectionLayout } from '@/config/collections';
import { cn } from '@/libs/utils/utils';
import { GenericResourcePreview } from '@/molecules/PostLinkEmbeds/Providers/Generic/GenericResourcePreview';
import { getAlsoOnName, getDisplayLink, getHttpUrl } from '@/molecules/ResourceCard/ResourceCard.utils';
import { ResourceRowContent } from '@/molecules/ResourceCard/ResourceRowContent';
import { ResourceSurfaceProvider } from '@/molecules/ResourceCard/ResourceSurfaceContext';
import { CollectionHiddenItemsNotice } from '@/organisms/Collections/CollectionHiddenItemsNotice/CollectionHiddenItemsNotice';

interface CollectionResourceItemsProps {
  /** The collection's external resources (items that are no Pubky object), in the collection's order. */
  uris: string[];
  /** The layout the viewer sees the collection in: one column for List, two from `lg` otherwise. */
  layout: CollectionLayout;
}

/**
 * The external resources a collection holds: a web link as the card a post shows for it
 * (`GenericResourcePreview`), standing on the post card's surface as the item itself; any other URI
 * (`isbn:`, `geo:`, a DOI) as a row opening its page, on its item's surface. The Visual layout shows
 * media posts only, so there its notice says some items are hidden.
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
      {uris.map((uri) => {
        const webLink = getHttpUrl(uri);
        return (
          <Container
            key={uri}
            overrideDefaults
            className={cn('min-w-0', !webLink && 'rounded-md bg-card p-4')}
            data-testid="collection-resource-item"
          >
            {webLink ? (
              <ResourceSurfaceProvider surface="card">
                <GenericResourcePreview url={webLink} />
              </ResourceSurfaceProvider>
            ) : (
              <Link
                href={getResourceRoute(uri)}
                overrideDefaults
                className="flex min-w-0 items-center gap-2 rounded-md text-sm transition-opacity outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ResourceRowContent uri={uri} name={getAlsoOnName({ uri })} note={getDisplayLink(uri)} />
              </Link>
            )}
          </Container>
        );
      })}
    </Container>
  );
}
