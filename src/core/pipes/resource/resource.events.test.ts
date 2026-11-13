import { describe, expect, it } from 'vitest';
import eventFixture from '@/services/pinakes/fixtures/by-uri.event.json';
import eventsFixture from '@/services/pinakes/fixtures/search.events.json';
import type { TPinakesCard, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import {
  getEventDayKey,
  getEventLifecycleLabel,
  getOccurrencesWindowStart,
  getResourceInstanceKey,
  groupEventsByDay,
  mergeResourceInstances,
  toEventInstance,
} from './resource.events';

const ROWS: TPinakesCard[] = eventsFixture.items;
const HOLIDAYS = ROWS.filter((card) => card.occurrence);
const CONCERT = ROWS.find((card) => card.name === 'Annett Louisan @ Volkshaus')!;
const DETAILS: TPinakesResourceDetail = eventFixture;

describe('getResourceInstanceKey', () => {
  it('tells a calendar’s occurrences apart though they share the feed’s id and link', () => {
    const keys = HOLIDAYS.map(getResourceInstanceKey);

    expect(HOLIDAYS).toHaveLength(3);
    expect(new Set(HOLIDAYS.map((card) => card.id)).size).toBe(1);
    expect(new Set(keys).size).toBe(3);
  });

  it('tells two dates of one repeating event apart by the date each is', () => {
    const [first] = HOLIDAYS;
    const weekly = (recurrenceId: string, start: string): TPinakesCard => ({
      ...first,
      start,
      occurrence: { ...first.occurrence!, uid: 'weekly@example', recurrence_id: recurrenceId },
    });

    expect(getResourceInstanceKey(weekly('20261117T180000Z', '2026-11-17T18:00:00Z'))).not.toBe(
      getResourceInstanceKey(weekly('20261124T180000Z', '2026-11-24T18:00:00Z')),
    );
  });

  it('is the card’s id for anything that is no occurrence', () => {
    expect(getResourceInstanceKey(CONCERT)).toBe(CONCERT.id);
  });
});

describe('mergeResourceInstances', () => {
  it('keeps every occurrence of a page: none is dropped for sharing an id or a link', () => {
    expect(mergeResourceInstances([], ROWS)).toEqual(ROWS);
  });

  it('adds the next page’s rows after the ones read, and a row sent twice only once', () => {
    const merged = mergeResourceInstances(ROWS.slice(0, 4), ROWS.slice(3));

    expect(merged).toEqual(ROWS);
  });
});

describe('toEventInstance', () => {
  it('keeps an occurrence as its own row: its name, dates and lifecycle, never its feed’s details', () => {
    const [holiday] = HOLIDAYS;
    const feed: TPinakesResourceDetail = {
      ...DETAILS,
      id: holiday.id,
      type: 'DataFeed',
      name: 'Holidays in Germany',
      start: null,
      end: null,
      tz: 'Europe/Berlin',
    };

    const instance = toEventInstance({ ...holiday, occurrence: { ...holiday.occurrence!, status: 'cancelled' } }, feed);

    expect(instance.name).toBe('National Day of Mourning');
    expect(instance.start).toBe('2026-11-15T00:00:00Z');
    expect(instance.event_status).toBe('cancelled');
    expect(instance.tz).toBeUndefined();
    // Midnight to midnight in UTC is what a timed event of a day can be too: nothing says all-day,
    // so nothing is made of it
    expect(instance).not.toHaveProperty('all_day');
    expect(instance.occurrence?.uid).toBe('20261115_4a5h1g1v51192choc0393644vc@google.com');
  });

  it('adds an event’s own details (time zone, venue, status) once they are read', () => {
    const summary: TPinakesCard = { ...CONCERT, id: DETAILS.id };

    const instance = toEventInstance(summary, DETAILS);

    expect(instance.tz).toBe('America/Chicago');
    expect(instance.venue?.name).toBe('Hilton Austin');
    expect(instance.event_status).toBe('scheduled');
    expect(instance.all_day).toBe(false);
  });

  it('keeps the row as it is when the details read are another resource’s, or none', () => {
    expect(toEventInstance(CONCERT, DETAILS)).toEqual(CONCERT);
    expect(toEventInstance(CONCERT, null)).toEqual(CONCERT);
  });
});

describe('getEventLifecycleLabel', () => {
  it.each([
    ['cancelled', 'Cancelled'],
    ['postponed', 'Postponed'],
    ['rescheduled', 'Rescheduled'],
    ['moved_online', 'Moved online'],
    ['CANCELLED', 'Cancelled'],
  ])('says %s in words', (status, label) => {
    expect(getEventLifecycleLabel(status)).toBe(label);
  });

  it('says nothing for an event going ahead as planned, or without a status', () => {
    expect(getEventLifecycleLabel('scheduled')).toBeNull();
    expect(getEventLifecycleLabel(null)).toBeNull();
    expect(getEventLifecycleLabel('  ')).toBeNull();
  });

  it('says a status it does not know as the source wrote it', () => {
    expect(getEventLifecycleLabel('sold out')).toBe('sold out');
  });

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
    'reads a status spelled as a built-in name (%s) as any other unknown one: text, never an object',
    (status) => {
      expect(getEventLifecycleLabel(status)).toBe(status);
      expect(getEventLifecycleLabel(status, (value) => `Event status: ${value}`)).toBe(`Event status: ${status}`);
    },
  );
});

describe('getEventDayKey', () => {
  it('is the day in the event’s own time zone when it has one', () => {
    // 23:30 UTC on the 16th is half past midnight on the 17th in Zurich
    expect(getEventDayKey({ start: '2026-11-16T23:30:00Z', tz: 'Europe/Zurich' })).toBe('2026-11-17');
    expect(getEventDayKey({ start: '2026-11-16T23:30:00Z', tz: 'America/Chicago' })).toBe('2026-11-16');
  });

  it('is the UTC day without a time zone, for an all-day event, and for a zone it does not know', () => {
    expect(getEventDayKey({ start: '2026-11-16T23:30:00Z' })).toBe('2026-11-16');
    expect(getEventDayKey({ start: '2026-11-15T00:00:00Z', tz: 'America/Chicago', all_day: true })).toBe('2026-11-15');
    expect(getEventDayKey({ start: '2026-11-16T23:30:00Z', tz: 'Mars/Olympus' })).toBe('2026-11-16');
  });

  it('is nothing without a start that is a time', () => {
    expect(getEventDayKey({ start: null })).toBeNull();
    expect(getEventDayKey({ start: 'soon' })).toBeNull();
  });
});

describe('groupEventsByDay', () => {
  it('groups the rows by day, days in order, each day’s rows in the order they came', () => {
    const groups = groupEventsByDay(ROWS.map((card) => toEventInstance(card, null)));

    expect(groups.map((group) => group.day)).toEqual([
      '2026-11-15',
      '2026-11-16',
      '2026-11-18',
      '2026-11-21',
      '2026-11-22',
      '2026-11-25',
    ]);
    expect(groups.flatMap((group) => group.items)).toHaveLength(ROWS.length);
  });

  it('puts two events of one day under it once, and one without a date last', () => {
    const at = (name: string, start: string | null, tz?: string) => ({ ...CONCERT, id: name, name, start, tz });
    const groups = groupEventsByDay([
      at('late', '2026-11-16T23:30:00Z', 'Europe/Zurich'),
      at('undated', null),
      at('early', '2026-11-17T08:00:00Z', 'Europe/Zurich'),
      at('before', '2026-11-16T10:00:00Z', 'Europe/Zurich'),
    ]);

    expect(groups.map((group) => [group.day, group.items.map((item) => item.name)])).toEqual([
      ['2026-11-16', ['before']],
      ['2026-11-17', ['late', 'early']],
      [null, ['undated']],
    ]);
  });
});

describe('getOccurrencesWindowStart', () => {
  it('is now as RFC 3339 in UTC, to the minute: the spelling the occurrences route reads', () => {
    expect(getOccurrencesWindowStart(new Date('2026-11-13T17:05:42.123Z'))).toBe('2026-11-13T17:05:00Z');
  });
});
