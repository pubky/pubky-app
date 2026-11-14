'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, RotateCw } from 'lucide-react';
import { getResourceRoute } from '@/app/routes';
import { Typography } from '@/atoms/Typography/Typography';
import { EVENT_DATES_PAGE_SIZE } from '@/config/events';
import { useEventDates, type UseEventDatesResult } from '@/hooks/useEventDates/useEventDates';
import { usePinakesCard } from '@/hooks/usePinakesCard/usePinakesCard';
import { ResourceFamily } from '@/molecules/ResourceCard/ResourceCard.types';
import { getDisplayLink, getResourceFamily, OTHER_DATES_ANCHOR } from '@/molecules/ResourceCard/ResourceCard.utils';
import { getResourceInstanceKey } from '@/pipes/resource/resource.events';
import type { TPinakesCard, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { ResourceOccurrenceRow } from './ResourceOccurrenceRow';
import { ResourceSection } from './ResourceSection';

/** The Other dates section, in each copy of the sidebar. */
const OTHER_DATES_TEST_ID = 'resource-other-dates';

interface ResourceOtherDatesListProps {
  /** The page's card: a date of a series (a date page, or a feed's date). */
  card: TPinakesResourceDetail;
  /**
   * The section carries the page's `#other-dates` id: the page lays its sidebar out more than once
   * (beside the card, under it on a phone), and only one copy may have it.
   */
  isAnchor?: boolean;
  /** For tests; the viewer's locale when omitted. */
  locale?: string;
}

/**
 * A date's page in a series: "Other dates · N", the series' other coming dates (its feed's dates of
 * the same name, this date left out: `useEventDates`), each a row as Upcoming dates has it, opening
 * that date's own page; then "More from <feed>" for the feed's other events, only when it has some,
 * named by one read of the feed's card. "Show more dates" shows the next ones. The section shows its
 * skeleton rows while the dates are read, and when they could not be, says so with "Try again";
 * nothing for an event with no feed or a series with no other coming date. Past dates are never
 * listed: the feed's dates are read from now on.
 */
export function ResourceOtherDatesList({ card, isAnchor = false, locale }: ResourceOtherDatesListProps) {
  const dates = useEventDates(card, { enabled: getResourceFamily(card) === ResourceFamily.EVENT });
  const { feed, sameName, others, isLoading, isError, retry } = dates;
  // The feed's name, for its other events only
  const { data: feedCard, isLoading: isFeedLoading } = usePinakesCard(others.length > 0 ? feed?.uri : null);
  const isShown = Boolean(feed) && (isLoading || isError || sameName.length > 0);
  useScrollToAnchor(isShown && !isLoading);
  if (!feed) return null;
  const feedName = feedCard?.name?.trim() || getDisplayLink(feed.uri);

  return (
    <>
      {isShown && (
        <DatesSection
          id={isAnchor ? OTHER_DATES_ANCHOR : undefined}
          title="Other dates"
          rows={sameName}
          dates={dates}
          locale={locale}
          testId={OTHER_DATES_TEST_ID}
          message={isError ? 'Other dates could not be loaded' : null}
          // The page's own event: each row is its day
          hideNames
          onRetry={retry}
        />
      )}
      {others.length > 0 && !isFeedLoading && (
        <DatesSection
          title={`More from ${feedName}`}
          rows={others}
          dates={dates}
          locale={locale}
          testId="resource-more-from"
        />
      )}
    </>
  );
}

/**
 * One list of the series' dates: the first `EVENT_DATES_PAGE_SIZE`, then as many again on "Show more
 * dates", which reads the feed's next dates once the ones read are all shown.
 */
function DatesSection({
  id,
  title,
  rows,
  dates,
  locale,
  testId,
  message = null,
  onRetry,
  hideNames = false,
}: {
  id?: string;
  title: string;
  rows: TPinakesCard[];
  dates: UseEventDatesResult;
  locale?: string;
  testId: string;
  message?: string | null;
  onRetry?: () => void;
  /** The rows are dates of the page's own event: by day alone (`ResourceOccurrenceRow` `hideName`). */
  hideNames?: boolean;
}) {
  const [shown, setShown] = useState(EVENT_DATES_PAGE_SIZE);
  const { isLoading, hasMore, isLoadingMore, isMoreError, loadMore } = dates;
  const showMore = () => {
    const next = shown + EVENT_DATES_PAGE_SIZE;
    setShown(next);
    // The next page's dates are asked of Pinakes once fewer than a page are left to show
    if (hasMore && rows.length < next + EVENT_DATES_PAGE_SIZE) void loadMore();
  };
  const footer =
    message && onRetry
      ? { icon: RotateCw, text: 'Try again', onClick: onRetry }
      : rows.length > shown || hasMore
        ? { icon: ChevronDown, text: isLoadingMore ? 'Loading more dates' : 'Show more dates', onClick: showMore }
        : undefined;

  return (
    <ResourceSection
      id={id}
      title={title}
      count={isLoading || message ? undefined : `${rows.length}${hasMore ? '+' : ''}`}
      message={isLoading ? null : message}
      loadingRows={isLoading ? EVENT_DATES_PAGE_SIZE : 0}
      footer={isLoading ? undefined : footer}
      testId={testId}
    >
      {rows.slice(0, shown).map((occurrence) => (
        <ResourceOccurrenceRow
          key={getResourceInstanceKey(occurrence)}
          occurrence={occurrence}
          href={getResourceRoute(occurrence.uri)}
          hideName={hideNames}
          locale={locale}
        />
      ))}
      {isMoreError && (
        <li>
          <Typography size="xs" className="font-normal text-muted-foreground">
            More dates could not be loaded. Try again.
          </Typography>
        </li>
      )}
    </ResourceSection>
  );
}

/**
 * Brings the Other dates section into view once it is shown, when the page was opened at it (an event
 * card's "Other dates · N"): it shows only once its dates are read, after the browser looked for the
 * anchor. The page lays its sidebar out twice (beside the card, under it on a phone), the anchor's id
 * on one of them: the copy on screen is scrolled to.
 */
function useScrollToAnchor(isReady: boolean) {
  useEffect(() => {
    if (!isReady || window.location.hash !== `#${OTHER_DATES_ANCHOR}`) return;
    const shown = [...document.querySelectorAll(`[data-testid="${OTHER_DATES_TEST_ID}"]`)].find(
      (element) => element.getClientRects().length > 0,
    );
    shown?.scrollIntoView({ block: 'start' });
  }, [isReady]);
}
