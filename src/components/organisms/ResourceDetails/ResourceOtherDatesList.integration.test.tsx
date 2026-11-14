import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceCard } from '@/molecules/ResourceCard/ResourceCard';
import meetupDateFixture from '@/services/pinakes/fixtures/by-uri.meetup-date.json';
import meetupFeedFixture from '@/services/pinakes/fixtures/by-uri.meetup-feed.json';
import meetupGroupFixture from '@/services/pinakes/fixtures/group.meetup-date.json';
import meetupDatesFixture from '@/services/pinakes/fixtures/occurrences.meetup.json';
import { pinakesQueryClient } from '@/services/pinakes/pinakes.query-client';
import type { TPinakesCard, TPinakesGroupDetail, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { ResourceOtherDatesList } from './ResourceOtherDatesList';

// Cards and the page over the real hooks, controller, application and service (their cache too):
// only Pinakes' origin and the transport are stood in for.
vi.mock('@/config/pinakes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/pinakes')>()),
  getPinakesUrl: () => 'https://pinakes.example',
  isPinakesConfigured: () => true,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({
  useOgMetadata: () => ({ metadata: null, isLoading: false, error: null }),
}));
vi.mock('@/molecules/ResourceMap/ResourceLocation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/molecules/ResourceMap/ResourceLocation')>()),
  ResourceLocation: () => null,
}));

const DATE: TPinakesResourceDetail = meetupDateFixture;
const FEED_CARD: TPinakesResourceDetail = meetupFeedFixture;
const GROUP: TPinakesGroupDetail = meetupGroupFixture;
const DATES: TPinakesCard[] = meetupDatesFixture.items;
const mockFetch = vi.fn();

/** Ten date pages of the one series, each in its own group with the feed's date of it. */
const PAGES: TPinakesResourceDetail[] = DATES.map((date, index) => ({
  ...DATE,
  id: `page-${index}`,
  uri: `https://www.meetup.com/bitcoin-meetup-switzerland/events/page-${index}/`,
  aliases: [date.uri],
  start: date.start,
  end: date.end,
  group: { id: `group-${index}`, size: 2 },
}));

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const paths = () => mockFetch.mock.calls.map(([url]) => new URL(String(url)).pathname);
const count = (pattern: RegExp) => paths().filter((path) => pattern.test(path)).length;

describe('a series’ other dates over the cached Pinakes reads', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-14T06:00:00Z'));
    pinakesQueryClient.clear();
    mockFetch.mockReset().mockImplementation(async (url: string) => {
      const { pathname, searchParams } = new URL(url);
      const group = /^\/v1\/groups\/(group-\d+)$/.exec(pathname)?.[1];
      if (group) return json({ ...GROUP, id: group });
      if (pathname.endsWith('/occurrences')) return json(meetupDatesFixture);
      if (pathname === '/v1/resources/by-uri' && searchParams.get('uri') === FEED_CARD.uri) return json(FEED_CARD);
      return new Response('{}', { status: 404 });
    });
    global.fetch = asOpaque<typeof global.fetch>(mockFetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = realFetch;
  });

  it('reads the feed’s dates once for ten cards of one series, and no feed card', async () => {
    render(
      <>
        {PAGES.map((page) => (
          <ResourceCard key={page.id} card={page} href={page.uri} />
        ))}
      </>,
    );

    await waitFor(() => expect(screen.getAllByTestId('resource-card-other-dates')).toHaveLength(10));
    expect(count(/\/occurrences$/)).toBe(1);
    // Each card's own group, read once each: the only way to its feed
    expect(count(/^\/v1\/groups\//)).toBe(10);
    expect(count(/^\/v1\/resources\/by-uri$/)).toBe(0);
  });

  it('reads the feed’s card once for the page’s “More from”, with the cards’ dates read already', async () => {
    const [, , dec23] = DATES;
    const workshop: TPinakesCard = {
      ...dec23,
      uri: 'https://www.meetup.com/bitcoin-meetup-switzerland/events/1/',
      name: 'Workshop',
      occurrence: { ...dec23.occurrence!, uid: 'event_1@meetup.com' },
    };
    mockFetch.mockImplementation(async (url: string) => {
      const { pathname, searchParams } = new URL(url);
      if (pathname.startsWith('/v1/groups/')) return json({ ...GROUP, id: pathname.split('/').at(-1) });
      if (pathname.endsWith('/occurrences')) return json({ ...meetupDatesFixture, items: [...DATES, workshop] });
      if (searchParams.get('uri') === FEED_CARD.uri) return json(FEED_CARD);
      return new Response('{}', { status: 404 });
    });

    render(
      <>
        {PAGES.slice(0, 3).map((page) => (
          <ResourceCard key={page.id} card={page} href={page.uri} />
        ))}
        <ResourceOtherDatesList card={DATE} />
        <ResourceOtherDatesList card={DATE} />
      </>,
    );

    await waitFor(() =>
      expect(screen.getAllByRole('region', { name: /^More from Bitcoin Switzerland/ })).toHaveLength(2),
    );
    expect(count(/\/occurrences$/)).toBe(1);
    expect(count(/^\/v1\/resources\/by-uri$/)).toBe(1);
  });
});
