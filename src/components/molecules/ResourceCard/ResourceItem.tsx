'use client';

import { getResourceRoute } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { PINAKES_SLOW_READ_MS } from '@/config/pinakes';
import { usePinakesCard } from '@/hooks/usePinakesCard/usePinakesCard';
import { isExternalParentUri } from '@/libs/post/externalParent';
import { cn } from '@/libs/utils/utils';
import { GenericResourcePreview } from '@/molecules/PostLinkEmbeds/Providers/Generic/GenericResourcePreview';
import { useSlowRead } from '@/molecules/PostLinkEmbeds/Providers/Generic/useSlowRead';
import {
  getAlsoOnIdentifier,
  getAlsoOnName,
  getHttpUrl,
  getPubkyObjectApp,
} from '@/molecules/ResourceCard/ResourceCard.utils';
import { ResourceRowContent } from '@/molecules/ResourceCard/ResourceRowContent';
import { ResourceSurfaceProvider } from '@/molecules/ResourceCard/ResourceSurfaceContext';
import { ResourceCardSkeleton } from '@/molecules/ResourceCardSkeleton/ResourceCardSkeleton';

interface ResourceItemProps {
  /** The external resource: a web link or any other URI (`isbn:`, `geo:`, a DOI, a Pubky app's object). */
  uri: string;
  'data-testid'?: string;
}

/**
 * Whether Pinakes is asked for the card of a URI that is no web link: a Pubky app's object
 * (`pubky://…`, a Loopky deck) or an identifier a post may name (`isbn:`, `doi:`…), never anything
 * else written into a collection (`javascript:`).
 */
const hasCardToRead = (uri: string) => uri.startsWith('pubky://') || isExternalParentUri(uri);

/**
 * An external resource shown as an item of its own, in no post (a collection's items, a feed of
 * resources): a web link as the card a post shows for it (`GenericResourcePreview`), standing on the
 * post card's surface; any other URI Pinakes has a named card for (a Pubky app's object, a book by
 * its ISBN) as that card too, named and credited to its site as on its page. Any other URI is a row
 * opening its page, on its item's surface: a Pubky object named by its app, never by its path. It is
 * a grid cell, a `@container/grid` as the Cards layout's cells are, so the card's footer stacks its
 * tags and actions when the cell is narrow.
 */
export function ResourceItem({ uri, 'data-testid': testId }: ResourceItemProps) {
  const webLink = getHttpUrl(uri);
  const lookup = !webLink && hasCardToRead(uri) ? uri : null;
  const { data: card, isLoading } = usePinakesCard(lookup);
  // A read slower than a link card's gives way to the row; the card takes its place once read
  const isSlow = useSlowRead(lookup, isLoading, PINAKES_SLOW_READ_MS);
  const cardLink = webLink ?? (card?.name?.trim() ? uri : null);
  const isRow = cardLink === null && (!isLoading || isSlow);
  const app = getPubkyObjectApp(uri);
  return (
    <Container
      overrideDefaults
      className={cn('@container/grid min-w-0', isRow && 'rounded-md bg-card p-4')}
      data-testid={testId}
    >
      {cardLink ? (
        <ResourceSurfaceProvider surface="card">
          <GenericResourcePreview url={cardLink} />
        </ResourceSurfaceProvider>
      ) : !isRow ? (
        <ResourceSurfaceProvider surface="card">
          <ResourceCardSkeleton withActions />
        </ResourceSurfaceProvider>
      ) : (
        <Link
          href={getResourceRoute(uri)}
          overrideDefaults
          className="flex min-w-0 items-center gap-2 rounded-md text-sm transition-opacity outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ResourceRowContent
            uri={uri}
            name={app ?? getAlsoOnName({ uri })}
            note={app ? null : getAlsoOnIdentifier({ uri })}
          />
        </Link>
      )}
    </Container>
  );
}
