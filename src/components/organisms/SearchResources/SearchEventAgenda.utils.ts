/** A day of the agenda as its date block shows it, and in full for its heading. */
export type TEventDayParts = { month: string; day: string; weekday: string; label: string };

/**
 * A day (`YYYY-MM-DD`, `getEventDayKey`) in the viewer's locale: the parts of its date block (`Nov`,
 * `15`, `Sun`) and its full name (`Sunday, November 15, 2026`). The day is already the event's own
 * (in its time zone, else UTC), so it is read as a plain calendar day: the viewer's time zone never
 * moves it.
 *
 * @param locale - For tests; the viewer's locale when omitted
 */
export function formatEventDay(day: string, locale?: string): TEventDayParts {
  const date = new Date(`${day}T00:00:00Z`);
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(date);
  return {
    month: format({ month: 'short' }),
    day: format({ day: 'numeric' }),
    weekday: format({ weekday: 'short' }),
    label: format({ weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
  };
}
