'use client';

import { type ReactNode, useState } from 'react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { CONTENT_AREA_STACK_CLASS } from '@/config/layoutClasses';
import { MAP_FIT_MAX_ZOOM } from '@/config/maps';
import { useEventInstances } from '@/hooks/useEventInstances/useEventInstances';
import type { UseResourceSearchResult } from '@/hooks/useResourceSearch/useResourceSearch';
import { getDisplayLink } from '@/molecules/ResourceCard/ResourceCard.utils';
import { ResourceItem } from '@/molecules/ResourceCard/ResourceItem';
import { ResourceLocationProvider } from '@/molecules/ResourceMap/ResourceLocationContext';
import { ResourceMap, type TResourceMapMarker } from '@/molecules/ResourceMap/ResourceMap';
import { TimelineError } from '@/molecules/Timeline/TimelineError';
import { TimelineErrorState } from '@/molecules/Timeline/TimelineErrorState';
import { ResourceInstanceCard } from '@/organisms/ResourceInstanceCard/ResourceInstanceCard';
import { clusterMapPoints } from '@/pipes/resource/resource.cluster';
import { getResourceInstanceKey, type TEventInstance } from '@/pipes/resource/resource.events';
import { getMapPoint } from '@/pipes/resource/resource.places';
import { getResourceSearchRowUri } from '@/pipes/resource/resource.search';
import type { TPinakesCard } from '@/services/pinakes/pinakes.types';

/** How close the map is taken to be before it says: the whole world, so near results start as one pin. */
const INITIAL_ZOOM = 0;

/** What each kind's results are called, and the quiet line under its map. */
const KINDS = {
  place: { one: 'place', many: 'places', hint: 'Pubky Maps is coming.' },
  event: { one: 'event', many: 'events', hint: 'Events on Pubky are coming.' },
} as const;

interface SearchResourceMapProps {
  /** The kind searched: places, or events. */
  kind: keyof typeof KINDS;
  /** The search being shown, read with its rows' cards (`useResourceSearch` with `cards`). */
  search: UseResourceSearchResult;
  /** The search's controls, above the map. */
  children?: ReactNode;
}

/**
 * The map of a search of places or events: one pin for each result that has a point, the results
 * read so far only (the first page, then each page "Load more results" adds). Pins too close to
 * tell apart at the map's zoom share one that counts them (`clusterMapPoints`, in the browser: the
 * map asks Pinakes for nothing as it moves, and searches no area). A press on a group zooms into
 * it; on a pin, or on a group of results at one spot, it opens their real cards under the map, each
 * with its tag bar and saying where it is on a line with "Open in Maps" (the map above already
 * shows it). Under the map: how much it shows, and how many results have no location and so no
 * pin. Every event is its own result, a calendar's occurrences too (`useEventInstances`).
 */
export function SearchResourceMap({ kind, search, children }: SearchResourceMapProps) {
  const { cards, loading, loadingMore, error, hasMore, loadMore, retry, unavailable } = search;
  const isEvents = kind === 'event';
  // An event's card shows its details (time zone, venue): read for the rows as the agenda reads them
  const events = useEventInstances(isEvents ? cards : []);
  const rows: readonly (TPinakesCard | TEventInstance)[] = isEvents ? events.instances : cards;
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const [selected, setSelected] = useState<string[]>([]);
  const words = KINDS[kind];
  const count = (total: number) => `${total} ${total === 1 ? words.one : words.many}`;

  const located = rows.flatMap((card) => {
    const point = getMapPoint(card.point);
    return point ? [{ id: getResourceInstanceKey(card), point, card }] : [];
  });
  const clusters = clusterMapPoints(located, zoom);
  const nameOf = (id: string) => {
    const card = located.find((item) => item.id === id)?.card;
    return card?.name?.trim() || (card ? getDisplayLink(card.uri) : '');
  };
  const markers: TResourceMapMarker[] = clusters.map((cluster) => ({
    id: cluster.id,
    point: cluster.point,
    label: cluster.ids.length > 1 ? `${count(cluster.ids.length)} here` : nameOf(cluster.ids[0]),
    ...(cluster.ids.length > 1 ? { count: cluster.ids.length } : {}),
    // A group that the closest zoom still shows as one opens its cards instead of zooming
    ...(cluster.bounds && zoom < MAP_FIT_MAX_ZOOM ? { bounds: cluster.bounds } : {}),
  }));
  const selectedPin = clusters.find((cluster) => cluster.ids.some((id) => selected.includes(id)));
  const selectedRows = located.filter((item) => selected.includes(item.id));
  const unplaced = rows.length - located.length;
  const isFirstRead = loading || (isEvents && cards.length > 0 && rows.length === 0 && events.isLoading);

  const loadMoreButton = hasMore && (
    <Button
      type="button"
      variant={ButtonVariant.SECONDARY}
      size="sm"
      disabled={loadingMore}
      onClick={() => void loadMore()}
      className="w-fit"
    >
      {loadingMore ? 'Loading more results' : 'Load more results'}
    </Button>
  );

  // No retry helps a search no source can answer
  const retryButton = !unavailable && (
    <Button variant={ButtonVariant.SECONDARY} type="button" onClick={retry}>
      Try again
    </Button>
  );
  // A next page that failed leaves the rows read and nothing more to ask for: that is not "all"
  const isComplete = !hasMore && !error;

  let body: ReactNode;
  if (isFirstRead) {
    body = <Skeleton className="h-80 w-full sm:h-96" data-testid="search-map-loading" />;
  } else if (error && rows.length === 0) {
    body = (
      <Container overrideDefaults className="flex flex-col items-center gap-2" data-testid="search-map-error">
        <TimelineErrorState message={error} />
        {retryButton}
      </Container>
    );
  } else if (located.length === 0) {
    body = (
      <Container overrideDefaults className="flex flex-col items-center gap-3 py-8" data-testid="search-map-empty">
        <Typography size="md" className="text-center text-muted-foreground">
          {rows.length === 0
            ? `No ${words.many} found`
            : `None of the ${count(rows.length)} loaded so far has a location.`}
        </Typography>
        {loadMoreButton}
      </Container>
    );
  } else {
    body = (
      <>
        <ResourceMap
          markers={markers}
          label={`Map of ${count(located.length)}`}
          mode="explore"
          size="wide"
          fit={located.map((item) => item.point)}
          selectedId={selectedPin?.id ?? null}
          onSelect={(id) => setSelected(clusters.find((cluster) => cluster.id === id)?.ids ?? [])}
          onZoom={setZoom}
        />
        <Container overrideDefaults className="flex flex-col gap-2">
          <Typography size="sm" data-testid="search-map-scope" className="font-normal text-muted-foreground">
            {isComplete ? `Showing all ${count(rows.length)}.` : `Showing the ${count(rows.length)} loaded so far.`}
            {unplaced > 0 &&
              ` ${unplaced} ${unplaced === 1 ? 'has' : 'have'} no location and ${unplaced === 1 ? 'is' : 'are'} not on the map.`}
          </Typography>
          {loadMoreButton}
          {error && (
            <Container overrideDefaults className="flex flex-col items-start gap-2" data-testid="search-map-more-error">
              <TimelineError message={error} />
              {retryButton}
            </Container>
          )}
        </Container>
        <Container
          as="section"
          overrideDefaults
          aria-label="Selected on the map"
          aria-live="polite"
          data-testid="search-map-selection"
          className="flex min-w-0 flex-col gap-4"
        >
          {selectedRows.length === 0 ? (
            <Typography size="sm" className="font-normal text-muted-foreground">
              Select a pin to see its card.
            </Typography>
          ) : (
            // The map above shows where each is: its card says it on one line, with Open in Maps
            <ResourceLocationProvider variant="row">
              {selectedRows.map(({ id, card }) =>
                isEvents ? (
                  <ResourceInstanceCard key={id} card={card} data-testid="search-map-card" />
                ) : (
                  <ResourceItem key={id} uri={getResourceSearchRowUri(card)} data-testid="search-map-card" />
                ),
              )}
            </ResourceLocationProvider>
          )}
        </Container>
      </>
    );
  }

  return (
    <Container className={CONTENT_AREA_STACK_CLASS}>
      {children}
      {body}
      <Typography size="xs" data-testid="search-map-hint" className="font-normal text-muted-foreground">
        {words.hint}
      </Typography>
    </Container>
  );
}
