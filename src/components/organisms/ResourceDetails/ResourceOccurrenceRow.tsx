'use client';

import { Badge } from '@/atoms/Badge/Badge';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import { formatResourceDates, getDisplayLink } from '@/molecules/ResourceCard/ResourceCard.utils';
import { getMapsDestination } from '@/molecules/ResourceMap/ResourceMap.utils';
import { ResourceMapsMenu } from '@/molecules/ResourceMap/ResourceMapsMenu';
import { getEventLifecycleLabel, toEventInstance } from '@/pipes/resource/resource.events';
import type { TPinakesCard } from '@/services/pinakes/pinakes.types';

interface ResourceOccurrenceRowProps {
  /** One date of a calendar (`GET /v1/resources/{id}/occurrences`). */
  occurrence: TPinakesCard;
  /** Where the row opens (the date's own page), in the same tab; a row of text without one. */
  href?: string;
  /**
   * The list is of the page's own event (its other dates): the date is the row's main line, its name
   * only in the row link's name.
   */
  hideName?: boolean;
  /** For tests; the viewer's locale when omitted. */
  locale?: string;
}

/**
 * One date of a calendar in a resource page's list of dates: its name, when it is (its start and end
 * in UTC, saying so: an instance names no time zone and no all-day), its lifecycle when it is not
 * going ahead as planned (Cancelled, Rescheduled…), and, when it has a place, "Open in Maps" at the
 * row's end, beside the row's link (`href`) and never in it. In a list of one event's dates
 * (`hideName`), the date leads and the name is said only in the link's name.
 */
export function ResourceOccurrenceRow({ occurrence, href, hideName = false, locale }: ResourceOccurrenceRowProps) {
  const instance = toEventInstance(occurrence, null);
  const status = getEventLifecycleLabel(instance.event_status);
  // A date that has a place ends in "Open in Maps", as every located event does
  const destination = getMapsDestination(instance, locale);
  const name = occurrence.name?.trim() || getDisplayLink(occurrence.uri);
  const dates = formatResourceDates(instance, locale);
  const content = (
    <>
      {hideName ? (
        // The date as the name's line
        <Typography size="sm" className="font-medium wrap-anywhere">
          {dates}
        </Typography>
      ) : (
        <>
          <Typography size="sm" dir="auto" className="font-medium wrap-anywhere">
            {name}
          </Typography>
          <Typography size="xs" className="font-normal text-muted-foreground">
            {dates}
          </Typography>
        </>
      )}
      {status && (
        <Badge variant="secondary" data-testid="resource-occurrence-status" className="w-fit">
          {status}
        </Badge>
      )}
    </>
  );
  const contentClassName = 'flex min-w-0 flex-col gap-0.5';
  return (
    <li data-testid="resource-occurrence" className="flex min-w-0 items-start justify-between gap-2">
      {href ? (
        // As an Also on row opens its link's page (`ResourceListRow`)
        <Link
          href={href}
          aria-label={hideName ? [name, dates, status].filter(Boolean).join(', ') : undefined}
          overrideDefaults
          className={cn(
            contentClassName,
            'transition-opacity outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          {content}
        </Link>
      ) : (
        <Container overrideDefaults className={contentClassName}>
          {content}
        </Container>
      )}
      {destination && <ResourceMapsMenu destination={destination} />}
    </li>
  );
}
