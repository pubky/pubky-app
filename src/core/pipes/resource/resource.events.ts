import type { TPinakesCard, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';

/** The resource read's fields an event's row shows when it has them. */
type TEventDetailField =
  'tz' | 'all_day' | 'venue' | 'event_status' | 'organizer' | 'attendance' | 'address' | 'category' | 'facts';

/**
 * One event as a list shows it: a search row (an event's card, or one occurrence of a calendar)
 * with the details read for it.
 */
export type TEventInstance = TPinakesCard & Partial<Pick<TPinakesResourceDetail, TEventDetailField>>;

const DAY_MS = 24 * 60 * 60 * 1000;

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

/** The rows read so far with the next page's after them, each instance once (`getResourceInstanceKey`). */
export function mergeResourceInstances(read: readonly TPinakesCard[], page: readonly TPinakesCard[]): TPinakesCard[] {
  const seen = new Set<string>();
  return [...read, ...page].filter((card) => {
    const key = getResourceInstanceKey(card);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Whether `start` to `end` runs from one UTC midnight to a later one: how Pinakes writes a
 * calendar's all-day dates (`00:00Z` to the next day's `00:00Z`). A search row says no `all_day`,
 * so such a span is shown as its day rather than as "12:00 AM".
 */
export function isWholeDaySpan(start: string | null | undefined, end: string | null | undefined): boolean {
  const [from, to] = [parseTime(start), parseTime(end)];
  return from !== null && to !== null && to > from && from % DAY_MS === 0 && to % DAY_MS === 0;
}

/**
 * A search row as a list of events shows it. A calendar occurrence stays its own row: its name and
 * dates are the instance's, its status the instance's lifecycle, and nothing is taken from
 * `details` (a read by its id or link answers the calendar itself, not the instance). Any other
 * event takes its own read's details (time zone, venue, status, attendance) once they are read; a
 * read of another resource is ignored.
 */
export function toEventInstance(
  card: TPinakesCard,
  details: TPinakesResourceDetail | null | undefined,
): TEventInstance {
  if (card.occurrence) {
    return {
      ...card,
      event_status: card.occurrence.status,
      ...(isWholeDaySpan(card.start, card.end) ? { all_day: true } : {}),
    };
  }
  if (!details || details.id !== card.id) return card;
  const { tz, all_day, venue, event_status, organizer, attendance, address, category, facts } = details;
  return { ...card, tz, all_day, venue, event_status, organizer, attendance, address, category, facts };
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
