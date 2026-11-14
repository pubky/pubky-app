import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeResourceInstances } from '@/pipes/resource/resource.events';
import eventFixture from '@/services/pinakes/fixtures/by-uri.event.json';
import meetupDateFixture from '@/services/pinakes/fixtures/by-uri.meetup-date.json';
import meetupDateJan6Fixture from '@/services/pinakes/fixtures/by-uri.meetup-date-jan6.json';
import meetupGroupFixture from '@/services/pinakes/fixtures/group.meetup-date.json';
import meetupGroupJan6Fixture from '@/services/pinakes/fixtures/group.meetup-date-jan6.json';
import eventsFixture from '@/services/pinakes/fixtures/search.events.json';
import meetupSearchFixture from '@/services/pinakes/fixtures/search.meetup.json';
import meetupCollapsedFixture from '@/services/pinakes/fixtures/search.meetup-collapsed.json';
import { pinakesQueryClient } from '@/services/pinakes/pinakes.query-client';
import type { TPinakesCard, TPinakesGroupDetail, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { PinakesApplication } from './pinakes';

// The application over the real service and its cache: only Pinakes' origin and the transport are
// stood in for.
vi.mock('@/config/pinakes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/pinakes')>()),
  getPinakesUrl: () => 'https://pinakes.example',
}));

const ROWS: TPinakesCard[] = eventsFixture.items;
const CONCERT = ROWS.find((card) => card.name === 'Annett Louisan @ Volkshaus')!;
/** The row as the search gives it after the concert moved to another day and hall. */
const MOVED: TPinakesCard = {
  ...CONCERT,
  start: '2026-11-17T19:00:00Z',
  end: '2026-11-17T23:00:00Z',
  point: { lat: 47.3712, lon: 8.5363 },
};
const before: TPinakesResourceDetail = {
  ...eventFixture,
  ...CONCERT,
  tz: 'Europe/Zurich',
  venue: { name: 'Volkshaus' },
  event_status: 'scheduled',
};
const now: TPinakesResourceDetail = {
  ...before,
  ...MOVED,
  venue: { name: 'Kaufleuten' },
  event_status: 'rescheduled',
};
const mockFetch = vi.fn();
/** A Meetup series: two date pages, each grouped with the feed's date of it. */
const DEC9: TPinakesResourceDetail = meetupDateFixture;
const JAN6: TPinakesResourceDetail = meetupDateJan6Fixture;
const DEC9_GROUP: TPinakesGroupDetail = meetupGroupFixture;
const JAN6_GROUP: TPinakesGroupDetail = meetupGroupJan6Fixture;
const answer = (card: TPinakesResourceDetail) =>
  new Response(JSON.stringify(card), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('PinakesApplication.fetchEventInstances over the cached card reads', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-13T17:05:00Z'));
    pinakesQueryClient.clear();
    mockFetch.mockReset();
    global.fetch = asOpaque<typeof global.fetch>(mockFetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = realFetch;
  });

  it('asks Pinakes again for details the cache holds from before the event moved, and shows the new ones', async () => {
    mockFetch.mockResolvedValueOnce(answer(before)).mockResolvedValueOnce(answer(now));
    // The concert's card was read two minutes ago (a post's card, an earlier search)
    await PinakesApplication.fetchCardByUri(CONCERT.uri);
    vi.setSystemTime(new Date('2026-11-13T17:07:00Z'));

    const [instance] = await PinakesApplication.fetchEventInstances([MOVED]);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(instance).toMatchObject({
      start: MOVED.start,
      point: MOVED.point,
      venue: { name: 'Kaufleuten' },
      event_status: 'rescheduled',
    });
  });

  it('asks once for details it had not read, though they differ from the row: asking again would say the same', async () => {
    mockFetch.mockImplementation(async () => answer(before));

    const [instance] = await PinakesApplication.fetchEventInstances([MOVED]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    // The row's own time and place, with the details Pinakes has now
    expect(instance).toMatchObject({ start: MOVED.start, point: MOVED.point, venue: { name: 'Volkshaus' } });
  });

  it('asks nothing for details the cache holds that say what the row says', async () => {
    mockFetch.mockResolvedValueOnce(answer(now));
    await PinakesApplication.fetchCardByUri(MOVED.uri);
    vi.setSystemTime(new Date('2026-11-13T17:07:00Z'));

    const [instance] = await PinakesApplication.fetchEventInstances([MOVED]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(instance.venue?.name).toBe('Kaufleuten');
  });
});

describe('PinakesApplication.fetchEventInstances of a series’ dates (live Meetup search)', () => {
  const realFetch = global.fetch;
  const PAGES: Record<string, TPinakesResourceDetail> = { [DEC9.uri]: DEC9, [JAN6.uri]: JAN6 };
  const GROUPS: Record<string, TPinakesGroupDetail> = { [DEC9_GROUP.id]: DEC9_GROUP, [JAN6_GROUP.id]: JAN6_GROUP };
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const paths = () => mockFetch.mock.calls.map(([url]) => new URL(String(url)).pathname);
  const groupReads = () => paths().filter((path) => path.startsWith('/v1/groups/'));

  beforeEach(() => {
    pinakesQueryClient.clear();
    mockFetch.mockReset().mockImplementation(async (url: string) => {
      const { pathname, searchParams } = new URL(url);
      const group = GROUPS[pathname.replace('/v1/groups/', '')];
      if (group) return json(group);
      const page = PAGES[searchParams.get('uri') ?? ''];
      if (page) return json(page);
      return new Response('{}', { status: 404 });
    });
    global.fetch = asOpaque<typeof global.fetch>(mockFetch);
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('shows the page of a date the collapsed search kept as the feed’s row, in its place; the other dates stay', async () => {
    const rows: TPinakesCard[] = meetupCollapsedFixture.items;

    const instances = await PinakesApplication.fetchEventInstances(rows);

    expect(instances.map((instance) => instance.id)).toEqual(
      rows.map((row) =>
        row.group?.id === DEC9.group?.id ? DEC9.id : row.group?.id === JAN6.group?.id ? JAN6.id : row.id,
      ),
    );
    expect(instances[1]).toMatchObject({
      uri: DEC9.uri,
      start: DEC9.start,
      tz: 'Europe/Zurich',
    });
    expect(instances[1].occurrence).toBeFalsy();
    expect(instances[3]).toMatchObject({ uri: JAN6.uri, start: JAN6.start });
    expect(instances.map((instance) => instance.start)).toEqual(rows.map((row) => row.start));
    // One group read per grouped row's group, and each page's own details
    expect(groupReads()).toHaveLength(2);
    expect(paths().filter((path) => path === '/v1/resources/by-uri')).toHaveLength(2);
  });

  it('reads a group once for two rows of it, also on a later page', async () => {
    const [, dec9] = meetupCollapsedFixture.items as TPinakesCard[];
    const again = { ...dec9, occurrence: { ...dec9.occurrence!, uid: 'event_316908442b@meetup.com' } };

    await PinakesApplication.fetchEventInstances([dec9, again]);
    await PinakesApplication.fetchEventInstances([dec9]);

    expect(groupReads()).toEqual([`/v1/groups/${DEC9_GROUP.id}`]);
  });

  it('shows the uncollapsed search’s dates once, the pages where they stand, with no group read', async () => {
    const rows = mergeResourceInstances([], meetupSearchFixture.items);

    const instances = await PinakesApplication.fetchEventInstances(rows);

    expect(instances).toHaveLength(10);
    expect(instances.filter((instance) => instance.start === DEC9.start).map((instance) => instance.id)).toEqual([
      DEC9.id,
    ]);
    expect(instances.filter((instance) => instance.start === JAN6.start).map((instance) => instance.id)).toEqual([
      JAN6.id,
    ]);
    expect(instances.map((instance) => instance.start)).toEqual(meetupCollapsedFixture.items.map((row) => row.start));
    expect(groupReads()).toHaveLength(0);
  });

  it('keeps a feed’s row when its group has no page, or cannot be read', async () => {
    const [, dec9] = meetupCollapsedFixture.items as TPinakesCard[];
    GROUPS[DEC9_GROUP.id] = { ...DEC9_GROUP, members: DEC9_GROUP.members.filter((member) => member.occurrence) };
    const [kept] = await PinakesApplication.fetchEventInstances([dec9]);
    GROUPS[DEC9_GROUP.id] = DEC9_GROUP;
    expect(kept).toMatchObject({ id: dec9.id, uri: dec9.uri, occurrence: dec9.occurrence });

    pinakesQueryClient.clear();
    mockFetch.mockImplementation(async () => new Response('{}', { status: 500 }));
    const [failed] = await PinakesApplication.fetchEventInstances([dec9]);
    expect(failed).toMatchObject({ id: dec9.id, occurrence: dec9.occurrence });
  });
});
