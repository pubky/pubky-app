import { describe, expect, it } from 'vitest';
import eventFixture from '@/services/pinakes/fixtures/by-uri.event.json';
import meetupDateFixture from '@/services/pinakes/fixtures/by-uri.meetup-date.json';
import meetupDateJan6Fixture from '@/services/pinakes/fixtures/by-uri.meetup-date-jan6.json';
import meetupGroupFixture from '@/services/pinakes/fixtures/group.meetup-date.json';
import meetupDatesFixture from '@/services/pinakes/fixtures/occurrences.meetup.json';
import eventsFixture from '@/services/pinakes/fixtures/search.events.json';
import type { TPinakesCard, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import {
  getEventDateLinks,
  getEventDayKey,
  getEventFeed,
  getEventLifecycleLabel,
  getGroupPage,
  getOccurrencesWindowStart,
  getResourceInstanceKey,
  getSeriesWindowEnd,
  getSeriesWindowStart,
  groupEventsByDay,
  hasEventStarted,
  hasSameSummary,
  mergeResourceInstances,
  splitFeedDates,
  toEventInstance,
} from './resource.events';

const ROWS: TPinakesCard[] = eventsFixture.items;
const HOLIDAYS = ROWS.filter((card) => card.occurrence);
const CONCERT = ROWS.find((card) => card.name === 'Annett Louisan @ Volkshaus')!;
const DETAILS: TPinakesResourceDetail = eventFixture;
/** A Meetup date's page (token link, its number link an alias) and its group with the feed's same date. */
const MEETUP_DATE: TPinakesResourceDetail = meetupDateFixture;
const MEETUP_DATE_JAN6: TPinakesResourceDetail = meetupDateJan6Fixture;
const MEETUP_MEMBERS: TPinakesCard[] = meetupGroupFixture.members;
/** The organiser's feed: every coming date, by start, Dec 9 and Jan 6 with a page of their own. */
const MEETUP_DATES: TPinakesCard[] = meetupDatesFixture.items;
const FEED = {
  id: '51ee469240e25fe6a378dc8d317e3f89',
  uri: 'https://www.meetup.com/bitcoin-meetup-switzerland/events/ical/',
};

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

  it('shows a date page and the feed’s same date once: the page wins, the other dates stay, by start', () => {
    const [nov25, dec9, dec23, jan6] = MEETUP_DATES;

    const merged = mergeResourceInstances([], [nov25, dec9, MEETUP_DATE, dec23, jan6]);

    expect(merged.map((card) => [card.uri, card.start])).toEqual([
      [nov25.uri, '2026-11-25T18:00:00Z'],
      [MEETUP_DATE.uri, '2026-12-09T18:00:00Z'],
      [dec23.uri, '2026-12-23T18:00:00Z'],
      [jan6.uri, '2027-01-06T18:00:00Z'],
    ]);
    expect(merged[1]).toBe(MEETUP_DATE);
  });

  it('puts the page where the feed’s date stood when the page comes on a later page', () => {
    const [nov25, dec9, dec23] = MEETUP_DATES;

    const merged = mergeResourceInstances([nov25, dec9, dec23], [MEETUP_DATE]);

    expect(merged).toEqual([nov25, MEETUP_DATE, dec23]);
  });

  it('tells the same date by the page’s links too, when a row has no group', () => {
    const [, dec9] = MEETUP_DATES;
    const page = { ...MEETUP_DATE, group: null };

    expect(mergeResourceInstances([], [{ ...dec9, group: null }, page])).toEqual([page]);
    // A search row has no aliases: the link people wrote for the page counts as its link
    const row = { ...page, aliases: undefined, refs: [dec9.uri] };
    expect(mergeResourceInstances([], [row, { ...dec9, group: null }])).toEqual([row]);
  });

  it('keeps a feed’s date whose page is not listed, and a page that has no date in the list', () => {
    const [, , , jan6] = MEETUP_DATES;

    expect(mergeResourceInstances([], [MEETUP_DATE, jan6])).toEqual([MEETUP_DATE, jan6]);
    expect(mergeResourceInstances([], [MEETUP_DATE, MEETUP_DATE_JAN6])).toEqual([MEETUP_DATE, MEETUP_DATE_JAN6]);
  });
});

describe('getEventFeed', () => {
  it('is the feed of the group’s member that is a feed’s date', () => {
    expect(getEventFeed(MEETUP_DATE, MEETUP_MEMBERS)).toEqual(FEED);
  });

  it('is none for a group without a feed’s date, and for a card outside a group', () => {
    const pages = MEETUP_MEMBERS.map((member) => ({ ...member, occurrence: null }));

    const lone: TPinakesResourceDetail = { ...MEETUP_DATE, group: null };

    expect(getEventFeed(MEETUP_DATE, pages)).toBeNull();
    expect(getEventFeed(lone, undefined)).toBeNull();
    expect(getEventFeed(DETAILS, null)).toBeNull();
  });

  it('is the row’s own feed for a feed’s date (a search row), with no group read', () => {
    expect(getEventFeed(MEETUP_DATES[0], undefined)).toEqual(FEED);
  });
});

describe('getEventDateLinks', () => {
  const HOLIDAY = HOLIDAYS[0];
  const HOLIDAY_FEED = getEventFeed(HOLIDAY, null)!;

  it('keeps a date page’s own links: none of them is the feed’s', () => {
    expect(getEventDateLinks([MEETUP_DATE.uri, ...MEETUP_DATE.aliases], FEED, MEETUP_DATE)).toEqual([
      MEETUP_DATE.uri,
      ...MEETUP_DATE.aliases,
    ]);
  });

  it('leaves the feed’s links out of a feed’s date that has a page link of its own', () => {
    const [nov25] = MEETUP_DATES;
    // The row's links as its card's footer has them: its page link, the feed's link it was written by
    expect(getEventDateLinks([nov25.uri, ...nov25.refs], FEED, nov25)).toEqual([nov25.uri]);
  });

  it('keeps a date link that differs from the feed’s only by a reserved escape: `%2F` is not `/`', () => {
    const feed = { id: 'f', uri: 'https://cal.example/a%2Fb' };
    const row = { refs: [feed.uri], occurrence: { ...HOLIDAY.occurrence!, feed_uri: feed.uri } };

    expect(getEventDateLinks(['https://cal.example/a/b', feed.uri], feed, row)).toEqual(['https://cal.example/a/b']);
    for (const escape of ['%3F', '%23', '%25', '%2f']) {
      const other = { id: 'f', uri: `https://cal.example/a${escape}b` };
      expect(getEventDateLinks([`https://cal.example/a${decodeURIComponent(escape)}b`], other)).toHaveLength(1);
    }
  });

  it('matches a link however an unreserved character or `@` is escaped, the escape’s case aside', () => {
    const feed = { id: 'f', uri: 'https://cal.example/%7Euser%40group/basic.ics' };

    expect(getEventDateLinks(['https://cal.example/~user@group/basic.ics'], feed)).toEqual([]);
    expect(getEventDateLinks(['https://cal.example/%7euser%40group/basic.ics'], feed)).toEqual([]);
  });

  it('has no date link for a feed’s date whose link is the calendar’s, however it is spelled', () => {
    // Google writes the calendar's `@` as `%40` in the feed's link, not in the row's
    expect(HOLIDAY.uri).not.toBe(HOLIDAY_FEED.uri);
    expect(getEventDateLinks([HOLIDAY.uri, ...HOLIDAY.refs], HOLIDAY_FEED, HOLIDAY)).toEqual([]);
  });
});

describe('getGroupPage', () => {
  it('is the group’s member that is a page, not a feed’s date', () => {
    expect(getGroupPage(MEETUP_MEMBERS)?.id).toBe(MEETUP_DATE.id);
  });

  it('is none for a group of feed’s dates only, and for no group read', () => {
    expect(getGroupPage(MEETUP_MEMBERS.filter((member) => member.occurrence))).toBeNull();
    expect(getGroupPage(undefined)).toBeNull();
  });
});

describe('splitFeedDates', () => {
  it('lists the feed’s other dates of the same name, this date left out by its number link', () => {
    const { sameName, others } = splitFeedDates(MEETUP_DATE, MEETUP_DATES);

    expect(sameName).toHaveLength(9);
    expect(sameName.map((card) => card.start)).not.toContain(MEETUP_DATE.start);
    expect(sameName[0].start).toBe('2026-11-25T18:00:00Z');
    expect(others).toEqual([]);
  });

  it('leaves this date out by its token link and by its group too', () => {
    const [, dec9] = MEETUP_DATES;
    const byToken = { ...dec9, uri: MEETUP_DATE.uri, group: null };
    const byGroup = { ...dec9, uri: 'https://www.meetup.com/bitcoin-meetup-switzerland/events/other/' };

    expect(splitFeedDates(MEETUP_DATE, [byToken, byGroup]).sameName).toEqual([]);
  });

  it('leaves a feed’s date out of its own list (a search row is that date)', () => {
    const [nov25] = MEETUP_DATES;

    expect(splitFeedDates(nov25, MEETUP_DATES).sameName.map((card) => card.start)).not.toContain(nov25.start);
  });

  it('puts the feed’s events of another name apart, names compared trimmed and case-folded', () => {
    const [nov25, , dec23, jan6] = MEETUP_DATES;
    const workshop = { ...dec23, name: 'Lightning workshop' };
    const shouting = { ...jan6, name: '  BITCOIN MEETUP ZÜRICH ' };

    const { sameName, others } = splitFeedDates(MEETUP_DATE, [nov25, workshop, shouting]);

    expect(sameName).toEqual([nov25, shouting]);
    expect(others).toEqual([workshop]);
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

describe('hasSameSummary', () => {
  const details: TPinakesResourceDetail = { ...DETAILS, ...CONCERT };

  it('holds for a read that says the row’s name, status, start, end and point, however the times are spelled', () => {
    expect(hasSameSummary(CONCERT, details)).toBe(true);
    expect(
      hasSameSummary(CONCERT, {
        ...details,
        start: '2026-11-16T20:00:00+01:00',
        end: '2026-11-16T23:00:00.000Z',
      }),
    ).toBe(true);
    expect(hasSameSummary(CONCERT, { ...details, point: { ...CONCERT.point! } })).toBe(true);
    // Neither says a time or a place: nothing differs
    const bare = { name: null, status: 'ok', start: null, end: undefined, point: null };
    expect(hasSameSummary(bare, { status: 'ok', start: undefined, end: null, point: undefined })).toBe(true);
  });

  it.each([
    ['another start', { start: '2026-11-17T19:00:00Z' }],
    ['another end', { end: '2026-11-17T01:00:00Z' }],
    ['no end', { end: null }],
    ['another point', { point: { lat: 47.3712, lon: 8.5363 } }],
    ['no point', { point: null }],
    ['another name', { name: 'CANCELLED: Annett Louisan @ Volkshaus' }],
    ['another read status', { status: 'missing' }],
  ])('does not hold for a read that says %s: it is of the event as it was', (_name, other) => {
    expect(hasSameSummary(CONCERT, { ...details, ...other })).toBe(false);
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

describe('getSeriesWindowStart', () => {
  it('is the start of the hour, so a series’ cards share a read for an hour', () => {
    expect(getSeriesWindowStart(new Date('2026-11-14T06:59:59.900Z'))).toBe('2026-11-14T06:00:00Z');
  });
});

describe('getSeriesWindowEnd', () => {
  it('is an hour after the window’s start', () => {
    expect(new Date(getSeriesWindowEnd('2026-11-14T06:00:00Z')).toISOString()).toBe('2026-11-14T07:00:00.000Z');
  });
});

describe('hasEventStarted', () => {
  const now = new Date('2026-11-14T06:04:00Z').getTime();

  it('tells a date that started by its start, else its end', () => {
    expect(hasEventStarted({ start: '2026-11-14T06:02:00Z', end: '2026-11-14T09:00:00Z' }, now)).toBe(true);
    expect(hasEventStarted({ start: '2026-11-14T06:05:00Z', end: null }, now)).toBe(false);
    expect(hasEventStarted({ start: null, end: '2026-11-14T06:00:00Z' }, now)).toBe(true);
    expect(hasEventStarted({ start: null, end: null }, now)).toBe(false);
  });
});

describe('getOccurrencesWindowStart', () => {
  it('is now as RFC 3339 in UTC, to the minute: the spelling the occurrences route reads', () => {
    expect(getOccurrencesWindowStart(new Date('2026-11-13T17:05:42.123Z'))).toBe('2026-11-13T17:05:00Z');
  });
});
