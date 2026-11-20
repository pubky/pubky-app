'use client';

import { CalendarOff, Repeat } from 'lucide-react';
import type { ReactNode } from 'react';
import { getResourceRoute } from '@/app/routes';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { TIMELINE_MAX_UNPRODUCTIVE_AUTO_LOADS } from '@/config/feed';
import { CONTENT_AREA_STACK_CLASS } from '@/config/layoutClasses';
import { useEventInstances } from '@/hooks/useEventInstances/useEventInstances';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import type { UseResourceSearchResult } from '@/hooks/useResourceSearch/useResourceSearch';
import { ResourceSurfaceProvider } from '@/molecules/ResourceCard/ResourceSurfaceContext';
import { ResourceCardSkeleton } from '@/molecules/ResourceCardSkeleton/ResourceCardSkeleton';
import { TimelineEndMessage } from '@/molecules/Timeline/TimelineEndMessage';
import { TimelineError } from '@/molecules/Timeline/TimelineError';
import { TimelineErrorState } from '@/molecules/Timeline/TimelineErrorState';
import { TimelineLoadingMore } from '@/molecules/Timeline/TimelineLoadingMore';
import { TimelineLoadMore } from '@/molecules/Timeline/TimelineLoadMore';
import { TimelineStateWrapper } from '@/molecules/Timeline/TimelineStateWrapper/TimelineStateWrapper';
import { ResourceInstanceCard } from '@/organisms/ResourceInstanceCard/ResourceInstanceCard';
import { getResourceInstanceKey, groupEventsByDay, type TEventInstance } from '@/pipes/resource/resource.events';
import { formatEventDay } from './SearchEventAgenda.utils';

const SKELETON_COUNT = 3;

interface SearchEventAgendaProps {
  /** The event search being shown, read with its rows' cards (`useResourceSearch` with `cards`). */
  search: UseResourceSearchResult;
  /** The search's controls, above the list. */
  children?: ReactNode;
}

/**
 * The agenda of an event search: its events by the day each starts on (in the event's own time
 * zone, else UTC: `groupEventsByDay`), each day under its date block, each event as the app's card
 * of it with its tag bar (`ResourceInstanceCard`: when, in which zone, where on the map). Every
 * search row is an event of its own: a calendar's occurrences share one link and are not merged
 * into their calendar (`useEventInstances`).
 *
 * Each card says what the source says of an event not going ahead as planned (an occurrence's
 * lifecycle, else the event's status). Above a calendar occurrence's card: a way to its calendar,
 * whose page lists its dates (they are the calendar's, not other dates of this event, so they are
 * not called that). "Repeats" shows only for an occurrence Pinakes marks as one date of a repeating
 * event; how often it repeats is never guessed. The list has the feeds' loading, empty, error and
 * infinite-scroll states, and one quiet line that events on Pubky are coming: nothing to press.
 */
export function SearchEventAgenda({ search, children }: SearchEventAgendaProps) {
  const { cards, loading, loadingMore, error, hasMore, loadMore, retry, unavailable } = search;
  const { instances, isLoading: isReadingDetails } = useEventInstances(cards);
  const { sentinelRef, isStalled, resumeAutoLoad } = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    // Also while the events' details are read: the list does not grow meanwhile, and asking again
    // would pile page upon page
    isLoading: loadingMore || isReadingDetails,
    threshold: 3000,
    debounceMs: 20,
    itemCount: instances.length,
    maxUnproductiveLoads: TIMELINE_MAX_UNPRODUCTIVE_AUTO_LOADS,
  });
  const days = groupEventsByDay(instances);
  const hasItems = instances.length > 0;
  // The first events wait for their details, so no event changes its day after it is shown
  const isFirstRead = loading || (cards.length > 0 && !hasItems && isReadingDetails);
  // No retry helps a search no source can answer
  const retryButton = unavailable ? null : (
    <Button variant={ButtonVariant.SECONDARY} type="button" onClick={retry}>
      Try again
    </Button>
  );

  return (
    <Container className={CONTENT_AREA_STACK_CLASS}>
      {children}
      <TimelineStateWrapper
        loading={isFirstRead}
        error={error}
        hasItems={hasItems}
        hasMore={hasMore}
        stalled={isStalled}
        loadingComponent={
          <ResourceSurfaceProvider surface="card">
            <Container overrideDefaults className="flex flex-col gap-4" data-testid="agenda-loading">
              {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
                <ResourceCardSkeleton key={`agenda-skeleton-${index}`} withActions />
              ))}
            </Container>
          </ResourceSurfaceProvider>
        }
        errorComponent={
          <Container overrideDefaults className="flex flex-col items-center gap-2" data-testid="agenda-error">
            <TimelineErrorState message={error ?? ''} />
            {retryButton}
          </Container>
        }
        emptyComponent={
          <Container overrideDefaults className="flex flex-col items-center gap-2 py-8" data-testid="agenda-empty">
            <CalendarOff aria-hidden="true" className="size-6 text-muted-foreground" />
            <Typography size="md" className="text-muted-foreground">
              No events found
            </Typography>
          </Container>
        }
      >
        <Container overrideDefaults className="flex flex-col gap-4">
          <Container
            overrideDefaults
            role="feed"
            aria-label="Events"
            aria-busy={loading || isReadingDetails}
            data-testid="event-agenda"
            className="flex flex-col gap-6"
          >
            {days.map(({ day, items }) => (
              <AgendaDay key={day ?? 'undated'} day={day} events={items} />
            ))}
          </Container>

          {hasItems && (loadingMore || isReadingDetails) && (
            <Container overrideDefaults data-testid="agenda-loading-more">
              <TimelineLoadingMore />
            </Container>
          )}

          {error && hasItems && (
            <Container overrideDefaults className="flex flex-col items-center gap-2">
              <TimelineError message={error} />
              {retryButton}
            </Container>
          )}

          {!loading && !hasMore && !loadingMore && hasItems && <TimelineEndMessage />}

          {hasMore && isStalled && !loadingMore && <TimelineLoadMore onLoadMore={resumeAutoLoad} />}

          {hasMore && !isStalled && !loading && (
            <Container overrideDefaults className="h-5" ref={sentinelRef} data-cy="timeline-sentinel" />
          )}
        </Container>
      </TimelineStateWrapper>
      <Typography size="xs" data-testid="agenda-hint" className="font-normal text-muted-foreground">
        Events on Pubky are coming.
      </Typography>
    </Container>
  );
}

/** One day of the agenda: its date block (the day's heading) beside its events. */
function AgendaDay({ day, events }: { day: string | null; events: TEventInstance[] }) {
  const parts = day ? formatEventDay(day) : null;
  return (
    <Container
      as="section"
      overrideDefaults
      data-testid="agenda-day"
      className="flex min-w-0 flex-col gap-3 sm:flex-row sm:gap-4"
    >
      {parts ? (
        <>
          <Typography as="h3" overrideDefaults className="sr-only">
            {parts.label}
          </Typography>
          <Container
            overrideDefaults
            aria-hidden="true"
            data-testid="agenda-date-block"
            className="flex h-fit w-fit shrink-0 items-baseline gap-2 rounded-md bg-card px-3 py-2 text-card-foreground sm:w-16 sm:flex-col sm:items-center sm:gap-0"
          >
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{parts.month}</span>
            <span className="text-2xl leading-8 font-bold">{parts.day}</span>
            <span className="text-xs font-medium text-muted-foreground">{parts.weekday}</span>
          </Container>
        </>
      ) : (
        <Typography as="h3" overrideDefaults className="shrink-0 text-sm font-medium text-muted-foreground sm:w-16">
          Date not known
        </Typography>
      )}
      <Container overrideDefaults className="flex min-w-0 flex-1 flex-col gap-4">
        {events.map((event) => (
          <AgendaEvent key={getResourceInstanceKey(event)} event={event} />
        ))}
      </Container>
    </Container>
  );
}

/** One event of a day: for a calendar occurrence a way to its calendar, then its card. */
function AgendaEvent({ event }: { event: TEventInstance }) {
  const { occurrence } = event;
  return (
    <Container as="article" overrideDefaults className="flex min-w-0 flex-col gap-2">
      {occurrence && (
        <Container overrideDefaults className="flex min-w-0 flex-wrap items-center gap-2">
          {occurrence.recurrence_id && (
            <Typography
              as="span"
              size="xs"
              data-testid="agenda-repeats"
              className="flex items-center gap-1 font-medium text-muted-foreground"
            >
              <Repeat aria-hidden="true" className="size-3" />
              Repeats
            </Typography>
          )}
          <Link
            href={getResourceRoute(occurrence.feed_uri)}
            overrideDefaults
            className="text-xs font-medium text-muted-foreground hover:text-brand hover:underline"
          >
            More from this feed
          </Link>
        </Container>
      )}
      <ResourceInstanceCard card={event} data-testid="agenda-event" />
    </Container>
  );
}
