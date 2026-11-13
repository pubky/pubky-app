'use client';

import { ChevronDown } from 'lucide-react';
import { Badge } from '@/atoms/Badge/Badge';
import { Typography } from '@/atoms/Typography/Typography';
import { EVENT_DATES_PAGE_SIZE } from '@/config/events';
import { useResourceOccurrences } from '@/hooks/useResourceOccurrences/useResourceOccurrences';
import { ResourceFamily } from '@/molecules/ResourceCard/ResourceCard.types';
import { formatResourceDates, getDisplayLink, getResourceFamily } from '@/molecules/ResourceCard/ResourceCard.utils';
import { getEventLifecycleLabel, getResourceInstanceKey, toEventInstance } from '@/pipes/resource/resource.events';
import type { TPinakesCard } from '@/services/pinakes/pinakes.types';
import { ResourceSection } from './ResourceSection';

/** The card type of a calendar feed, whose page is its list of dates. */
const CALENDAR_TYPE = 'DataFeed';

interface ResourceOccurrencesListProps {
  /** The page's card. */
  card: Pick<TPinakesCard, 'id' | 'type' | 'type_path'>;
  /** For tests; the viewer's locale when omitted. */
  locale?: string;
}

/**
 * Upcoming dates: a calendar's coming instances (`useResourceOccurrences`), each with its own name,
 * when it is (in UTC and saying so: an instance names no time zone; a whole-day span as its day)
 * and its lifecycle when it is not going ahead as planned (Cancelled, Rescheduled…). "Show more
 * dates" reads the next ones. A calendar shows the section while its dates are read, without any
 * and when the read failed; an event that is no calendar is asked too and shows it only once it
 * has dates. Nothing is said about how often a date repeats: Pinakes sends no rule.
 */
export function ResourceOccurrencesList({ card, locale }: ResourceOccurrencesListProps) {
  const isCalendar = card.type === CALENDAR_TYPE;
  const applies = isCalendar || getResourceFamily(card) === ResourceFamily.EVENT;
  const { cards, isLoading, isError, hasMore, isLoadingMore, isMoreError, loadMore } = useResourceOccurrences(
    applies ? card.id : null,
  );
  if (!applies) return null;
  // An event's page makes no room for dates it may not have
  if (!isCalendar && cards.length === 0) return null;

  const message = isError ? 'Dates could not be loaded' : cards.length === 0 ? 'No upcoming dates' : null;
  const moreLabel = isLoadingMore ? 'Loading more dates' : 'Show more dates';

  return (
    <ResourceSection
      title="Upcoming dates"
      message={isLoading ? null : message}
      loadingRows={isLoading ? EVENT_DATES_PAGE_SIZE : 0}
      footer={
        hasMore ? { icon: ChevronDown, text: moreLabel, onClick: () => void loadMore(), expanded: false } : undefined
      }
      testId="resource-occurrences"
    >
      {cards.map((occurrence) => {
        const instance = toEventInstance(occurrence, null);
        const status = getEventLifecycleLabel(instance.event_status);
        return (
          <li
            key={getResourceInstanceKey(occurrence)}
            data-testid="resource-occurrence"
            className="flex min-w-0 flex-col gap-0.5"
          >
            <Typography size="sm" dir="auto" className="font-medium wrap-anywhere">
              {occurrence.name?.trim() || getDisplayLink(occurrence.uri)}
            </Typography>
            <Typography size="xs" className="font-normal text-muted-foreground">
              {formatResourceDates(instance, locale)}
            </Typography>
            {status && (
              <Badge variant="secondary" data-testid="resource-occurrence-status" className="w-fit">
                {status}
              </Badge>
            )}
          </li>
        );
      })}
      {isMoreError && (
        <li>
          <Typography
            size="xs"
            data-testid="resource-occurrences-more-error"
            className="font-normal text-muted-foreground"
          >
            More dates could not be loaded. Try again.
          </Typography>
        </li>
      )}
    </ResourceSection>
  );
}
