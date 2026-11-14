import type { TPinakesCard, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';

/** The resource read's fields an event's row shows when it has them. */
type TEventDetailField =
  'tz' | 'all_day' | 'venue' | 'event_status' | 'organizer' | 'attendance' | 'address' | 'category' | 'facts';

/**
 * One event as a list shows it: a search row (an event's card, or one occurrence of a calendar)
 * with the details read for it.
 */
export type TEventInstance = TPinakesCard & Partial<Pick<TPinakesResourceDetail, TEventDetailField>>;

/** The `event_status` of an event going ahead as planned. */
const SCHEDULED = 'scheduled';

/** The lifecycle values Pinakes documents for an occurrence, in words. */
const LIFECYCLE_LABELS: Readonly<Record<string, string>> = {
  cancelled: 'Cancelled',
  postponed: 'Postponed',
  rescheduled: 'Rescheduled',
  moved_online: 'Moved online',
};

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * What tells one search row from another, as a list key and to keep each row once: the card's id,
 * and for a calendar occurrence its instance too (`uid`, the date of a repeating event it is, its
 * start). Every occurrence of a calendar carries the calendar's `id`, `uri` and `refs`, so none of
 * those tells two of them apart.
 */
export function getResourceInstanceKey(card: Pick<TPinakesCard, 'id' | 'start' | 'occurrence'>): string {
  const { occurrence } = card;
  if (!occurrence) return card.id;
  return JSON.stringify([card.id, occurrence.uid, occurrence.recurrence_id ?? null, card.start ?? null]);
}

/** A card's own links: its canonical one, the links people wrote for it and its other spellings. */
function getOwnLinks(card: Pick<TPinakesCard, 'uri' | 'refs'> & { aliases?: readonly string[] | null }): Set<string> {
  return new Set([card.uri, ...(card.refs ?? []), ...(card.aliases ?? [])]);
}

/**
 * Whether a row is the same date as an event's card: one of the card's links (`uri`, `refs`,
 * `aliases`; a date page has a number and a token link), the card's group (a date page and the
 * feed's date of it are one group), or, for a feed's date, the same instance.
 */
export function isSameEventDate(
  card: Pick<TPinakesCard, 'id' | 'uri' | 'refs' | 'start' | 'group' | 'occurrence'> & {
    aliases?: readonly string[] | null;
  },
  row: Pick<TPinakesCard, 'id' | 'uri' | 'start' | 'group' | 'occurrence'>,
): boolean {
  if (getOwnLinks(card).has(row.uri)) return true;
  if (card.group?.id && row.group?.id === card.group.id) return true;
  return Boolean(card.occurrence && row.occurrence) && getResourceInstanceKey(card) === getResourceInstanceKey(row);
}

/**
 * The rows read so far with the next page's after them, each instance once (`getResourceInstanceKey`).
 * A date page and the feed's date of it (`isSameEventDate`) are one row: the page's, where the first
 * of the two stood, so the list keeps its order by start.
 */
export function mergeResourceInstances(read: readonly TPinakesCard[], page: readonly TPinakesCard[]): TPinakesCard[] {
  const seen = new Set<string>();
  const rows = [...read, ...page].filter((card) => {
    const key = getResourceInstanceKey(card);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const pages = rows.filter((card) => !card.occurrence);
  const placed = new Set<TPinakesCard>();
  return rows.flatMap((card) => {
    const shown = card.occurrence ? (pages.find((other) => isSameEventDate(other, card)) ?? card) : card;
    if (placed.has(shown)) return [];
    placed.add(shown);
    return [shown];
  });
}

/** The calendar feed an event's date is part of: the one people tag for all its dates. */
export interface TEventFeed {
  /** Pinakes resource ID of the feed (`occurrence.feed_id`), whose dates are its occurrences. */
  id: string;
  /** The feed's link (`occurrence.feed_uri`). */
  uri: string;
}

/**
 * The feed an event's date is part of: a feed's date (a search row) names its own; a date page's
 * group (`GET /v1/groups/{id}`) has the feed's date of it as a member. `null` for an event outside a
 * group, a group read not yet or no longer there, or a group with no feed's date.
 *
 * @param members - The card's group members; absent while read, or for a card outside a group
 */
export function getEventFeed(
  card: Pick<TPinakesCard, 'occurrence'>,
  members: readonly Pick<TPinakesCard, 'occurrence'>[] | null | undefined,
): TEventFeed | null {
  const occurrence = card.occurrence ?? members?.find((member) => member.occurrence)?.occurrence;
  return occurrence ? { id: occurrence.feed_id, uri: occurrence.feed_uri } : null;
}

/**
 * The page of a group of one date (a date page joined with the feed's date of it): its member that
 * is no feed's date. `null` for no group read, or a group of feed's dates only.
 */
export function getGroupPage<T extends Pick<TPinakesCard, 'occurrence'>>(
  members: readonly T[] | null | undefined,
): T | null {
  return members?.find((member) => !member.occurrence) ?? null;
}

/** A name as two dates of one series are compared: trimmed and case-folded. */
const toSeriesName = (name: string | null | undefined) => name?.trim().toLocaleLowerCase() ?? '';

/**
 * A feed's coming dates as an event's page lists them, this date left out (`isSameEventDate`):
 * `sameName`, the dates of this event (the same name, trimmed and case-folded), and `others`, the
 * feed's other events, each in the feed's order.
 */
export function splitFeedDates<T extends Pick<TPinakesCard, 'id' | 'uri' | 'name' | 'start' | 'group' | 'occurrence'>>(
  card: Parameters<typeof isSameEventDate>[0] & Pick<TPinakesCard, 'name'>,
  dates: readonly T[],
): { sameName: T[]; others: T[] } {
  const name = toSeriesName(card.name);
  const sameName: T[] = [];
  const others: T[] = [];
  for (const date of dates) {
    if (isSameEventDate(card, date)) continue;
    (name && toSeriesName(date.name) === name ? sameName : others).push(date);
  }
  return { sameName, others };
}

/**
 * A search row as a list of events shows it. A calendar occurrence stays its own row: its name and
 * dates are the instance's, its status the instance's lifecycle, and nothing is taken from
 * `details` (a read by its id or link answers the calendar itself, not the instance). Nothing is
 * added that the row does not say: an occurrence names no time zone and no `all_day`, so its times
 * show as they are, in UTC (a span from one UTC midnight to the next can be a timed event too). Any other
 * event takes its own read's details (time zone, venue, status, attendance) once they are read; a
 * read of another resource is ignored.
 */
export function toEventInstance(
  card: TPinakesCard,
  details: TPinakesResourceDetail | null | undefined,
): TEventInstance {
  if (card.occurrence) {
    return { ...card, event_status: card.occurrence.status };
  }
  if (!details || details.id !== card.id) return card;
  const { tz, all_day, venue, event_status, organizer, attendance, address, category, facts } = details;
  return { ...card, tz, all_day, venue, event_status, organizer, attendance, address, category, facts };
}

/**
 * Whether a resource read says of an event what its search row says: the same name and read
 * status, the same start and end (as moments, however spelled) and the same point. A read kept
 * from before the event changed does not: its details (time zone, venue, status) are of the event
 * as it was. Only what both always carry alike is compared, never the counts that move on their
 * own (`collections`, `refs`).
 */
export function hasSameSummary(
  card: Pick<TPinakesCard, 'name' | 'status' | 'start' | 'end' | 'point'>,
  details: Pick<TPinakesCard, 'name' | 'status' | 'start' | 'end' | 'point'>,
): boolean {
  return (
    (card.name ?? null) === (details.name ?? null) &&
    card.status === details.status &&
    parseTime(card.start) === parseTime(details.start) &&
    parseTime(card.end) === parseTime(details.end) &&
    (card.point?.lat ?? null) === (details.point?.lat ?? null) &&
    (card.point?.lon ?? null) === (details.point?.lon ?? null)
  );
}

/**
 * What to say about an event that is not going ahead as planned: Pinakes' lifecycle values in
 * words, any other status as the source wrote it (through `formatOther`, for a surface that says
 * what such a value is). `null` for `scheduled` or no status.
 */
export function getEventLifecycleLabel(
  status: string | null | undefined,
  formatOther: (value: string) => string = (value) => value,
): string | null {
  const value = status?.trim();
  if (!value || value.toLowerCase() === SCHEDULED) return null;
  const key = value.toLowerCase();
  // Own keys only: a status such as `constructor` must not read a built-in property of the object
  return Object.hasOwn(LIFECYCLE_LABELS, key) ? LIFECYCLE_LABELS[key] : formatOther(value);
}

/** A time's calendar day (`YYYY-MM-DD`) in a time zone; in UTC for a zone the browser does not know. */
function getDayIn(time: number, timeZone: string): string {
  const format = (zone: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
      time,
    );
  try {
    return format(timeZone);
  } catch {
    return format('UTC');
  }
}

/**
 * The day an event starts on (`YYYY-MM-DD`): in its own time zone when it has one, else in UTC, as
 * an all-day event's is (never in the viewer's zone, which would move an event to another day
 * without saying so). `null` without a start.
 */
export function getEventDayKey(event: Pick<TEventInstance, 'start' | 'tz' | 'all_day'>): string | null {
  const start = parseTime(event.start);
  if (start === null) return null;
  return getDayIn(start, event.all_day || !event.tz ? 'UTC' : event.tz);
}

/**
 * The events by the day each starts on (`getEventDayKey`), days in order, each day's events in the
 * order they came; the ones without a start last, under `null`.
 */
export function groupEventsByDay<T extends Pick<TEventInstance, 'start' | 'tz' | 'all_day'>>(
  events: readonly T[],
): { day: string | null; items: T[] }[] {
  const groups = new Map<string | null, T[]>();
  for (const event of events) {
    const day = getEventDayKey(event);
    groups.set(day, [...(groups.get(day) ?? []), event]);
  }
  return [...groups.entries()]
    .map(([day, items]) => ({ day, items }))
    .sort((a, b) => (a.day === null ? 1 : b.day === null ? -1 : a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/**
 * From when a calendar's dates are listed: now, as RFC 3339 in UTC to the minute. The occurrences
 * route reads only RFC 3339 (not search's `now`); the minute keeps one read per calendar a minute.
 */
export function getOccurrencesWindowStart(now: Date): string {
  return `${now.toISOString().slice(0, 16)}:00Z`;
}
