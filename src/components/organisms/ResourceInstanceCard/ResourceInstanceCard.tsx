'use client';

import { Container } from '@/atoms/Container/Container';
import { useViewportObserver } from '@/hooks/useViewportObserver/useViewportObserver';
import { ResourceCard } from '@/molecules/ResourceCard/ResourceCard';
import {
  getHttpUrl,
  getResourceLinks,
  getResourceTagsLabel,
  getResourceTarget,
} from '@/molecules/ResourceCard/ResourceCard.utils';
import { ResourceSurfaceProvider } from '@/molecules/ResourceCard/ResourceSurfaceContext';
import { ResourceActions } from '@/organisms/ResourceActions/ResourceActions';
import type { TEventInstance } from '@/pipes/resource/resource.events';
import { getResourceSearchRowUri } from '@/pipes/resource/resource.search';

interface ResourceInstanceCardProps {
  /** A search row's own card, with the details read for it when there are any. */
  card: TEventInstance;
  'data-testid'?: string;
}

/**
 * One search row as the app's card of it, from the row's own card: for rows a link cannot stand
 * for. Every occurrence of a calendar carries the calendar's link, so a card read by that link
 * (`ResourceItem`) is the calendar's, the same for each of them; here each row shows what it is
 * (its own name, dates and lifecycle) and stays a row of its own.
 *
 * The card is the item itself, on the post card's surface, closed by a post's footer as every
 * resource card is (`ResourceActions`): its tags, actions and counts are on the card's link with
 * the links people wrote for it read along (`getResourceTarget`), which for an occurrence is the
 * calendar people tagged. Its title opens the resource's page.
 */
export function ResourceInstanceCard({ card, 'data-testid': testId }: ResourceInstanceCardProps) {
  const { ref, isVisible } = useViewportObserver({ rootMargin: '0px' });
  // The first web link people wrote for it, as a search row's link is
  const written = getResourceSearchRowUri(card);
  const target = getResourceTarget(card, written);
  return (
    <Container overrideDefaults ref={ref} className="@container/grid min-w-0" data-testid={testId}>
      <ResourceSurfaceProvider surface="card">
        <ResourceCard
          card={card}
          href={written}
          isOnScreen={isVisible}
          actions={
            <ResourceActions
              uri={target.uri}
              spellings={target.spellings}
              postUri={getHttpUrl(written)}
              collectionsCount={card.collections}
              tagsLabel={getResourceTagsLabel(card)}
              linkUrl={getResourceLinks(card, written).linkUrl}
              title={card.name}
              isOnScreen={isVisible}
            />
          }
        />
      </ResourceSurfaceProvider>
    </Container>
  );
}
