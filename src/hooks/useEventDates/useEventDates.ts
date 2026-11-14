'use client';

import { EVENT_SERIES_DATES_LIMIT } from '@/config/events';
import { useEventFeed } from '@/hooks/useEventFeed/useEventFeed';
import {
  useResourceOccurrences,
  type UseResourceOccurrencesResult,
} from '@/hooks/useResourceOccurrences/useResourceOccurrences';
import { isSameEventDate, splitFeedDates, type TEventFeed } from '@/pipes/resource/resource.events';
import type { TPinakesCard } from '@/services/pinakes/pinakes.types';

export interface UseEventDatesResult extends Omit<UseResourceOccurrencesResult, 'cards'> {
  /** The feed the date is part of (`useEventFeed`); `null` while read and for an event with none. */
  feed: TEventFeed | null;
  /** The feed's other coming dates of this event (the same name), by start. */
  sameName: TPinakesCard[];
  /** The feed's coming dates of its other events, by start. */
  others: TPinakesCard[];
}

/**
 * The other coming dates of an event's series: its feed (`useEventFeed`) and the feed's dates from now
 * on (`useResourceOccurrences`, `EVENT_SERIES_DATES_LIMIT` at once), this date left out
 * (`splitFeedDates`). Every card and the page of one series ask the same read, which the Pinakes
 * cache answers once. An event with no feed reads no dates.
 *
 * @param card - The event's card (a date page, or a feed's date)
 * @param options.enabled - `false` asks nothing yet (a card not on screen yet)
 */
export function useEventDates(
  card: Parameters<typeof isSameEventDate>[0] & Pick<TPinakesCard, 'name'>,
  { enabled = true }: { enabled?: boolean } = {},
): UseEventDatesResult {
  const { feed, isLoading: isFeedLoading } = useEventFeed(card, { enabled });
  const { cards, isLoading, ...read } = useResourceOccurrences(feed?.id ?? null, { limit: EVENT_SERIES_DATES_LIMIT });
  const { sameName, others } = splitFeedDates(card, cards);
  return { ...read, feed, sameName, others, isLoading: isFeedLoading || (feed !== null && isLoading) };
}
