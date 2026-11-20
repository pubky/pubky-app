import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import meetupDateFixture from '@/services/pinakes/fixtures/by-uri.meetup-date.json';
import meetupDatesFixture from '@/services/pinakes/fixtures/occurrences.meetup.json';
import { pinakesQueryClient } from '@/services/pinakes/pinakes.query-client';
import type { TPinakesCard, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { useEventDates } from './useEventDates';

// The series read over the real controller, application and service (their cache too): only
// Pinakes' origin, the transport and the feed lookup are stood in for.
vi.mock('@/config/pinakes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/pinakes')>()),
  getPinakesUrl: () => 'https://pinakes.example',
  isPinakesConfigured: () => true,
}));
vi.mock('@/hooks/useEventFeed/useEventFeed', () => ({
  useEventFeed: () => ({
    feed: { id: '51ee469240e25fe6a378dc8d317e3f89', uri: 'https://www.meetup.com/x/events/ical/' },
    isLoading: false,
  }),
}));

const DATE: TPinakesResourceDetail = meetupDateFixture;
const DATES: TPinakesCard[] = meetupDatesFixture.items;
/** A date of the series that starts a minute after the first card opened. */
const SOON: TPinakesCard = {
  ...DATES[0],
  uri: 'https://www.meetup.com/bitcoin-meetup-switzerland/events/1/',
  start: '2026-11-14T06:02:00Z',
  end: '2026-11-14T09:00:00Z',
  occurrence: { ...DATES[0].occurrence!, uid: 'event_1@meetup.com' },
};
const mockFetch = vi.fn();
const occurrenceReads = () =>
  mockFetch.mock.calls.map(([url]) => new URL(String(url))).filter((url) => url.pathname.endsWith('/occurrences'));

describe('useEventDates over the cached Pinakes reads', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-14T06:01:10Z'));
    pinakesQueryClient.clear();
    mockFetch.mockReset().mockImplementation(
      async () =>
        new Response(JSON.stringify({ items: [SOON, ...DATES], cursor: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    global.fetch = asOpaque<typeof global.fetch>(mockFetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = realFetch;
  });

  it('reads a series once for cards opened minutes apart, and lists no date that has started', async () => {
    const first = renderHook(() => useEventDates(DATE));
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    expect(first.result.current.sameName.map((card) => card.start)).toContain(SOON.start);

    vi.setSystemTime(new Date('2026-11-14T06:04:30Z'));
    const later = renderHook(() => useEventDates(DATE));
    await waitFor(() => expect(later.result.current.isLoading).toBe(false));

    expect(occurrenceReads()).toHaveLength(1);
    // The window starts on the hour, for every card of the hour
    expect(occurrenceReads()[0].searchParams.get('from')).toBe('2026-11-14T06:00:00Z');
    // Started by the time the later card opened: left out there
    expect(later.result.current.sameName.map((card) => card.start)).not.toContain(SOON.start);
    expect(later.result.current.sameName).toHaveLength(first.result.current.sameName.length - 1);
  });

  it('keeps the series read for its hour: no new read 7 minutes later, a new one in the next hour', async () => {
    const first = renderHook(() => useEventDates(DATE));
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));

    // Past the cache's own 5 minutes, within the hour
    vi.setSystemTime(new Date('2026-11-14T06:08:00Z'));
    const later = renderHook(() => useEventDates(DATE));
    await waitFor(() => expect(later.result.current.isLoading).toBe(false));
    expect(occurrenceReads()).toHaveLength(1);

    vi.setSystemTime(new Date('2026-11-14T07:00:30Z'));
    const nextHour = renderHook(() => useEventDates(DATE));
    await waitFor(() => expect(nextHour.result.current.isLoading).toBe(false));
    expect(occurrenceReads().map((url) => url.searchParams.get('from'))).toEqual([
      '2026-11-14T06:00:00Z',
      '2026-11-14T07:00:00Z',
    ]);
  });

  it('keeps the read fresh to the hour’s end from when it was made: a card 39 minutes later reads nothing', async () => {
    const first = renderHook(() => useEventDates(DATE));
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));

    vi.setSystemTime(new Date('2026-11-14T06:40:00Z'));
    const later = renderHook(() => useEventDates(DATE));
    await waitFor(() => expect(later.result.current.isLoading).toBe(false));
    expect(occurrenceReads()).toHaveLength(1);

    vi.setSystemTime(new Date('2026-11-14T07:01:00Z'));
    const nextHour = renderHook(() => useEventDates(DATE));
    await waitFor(() => expect(nextHour.result.current.isLoading).toBe(false));
    expect(occurrenceReads()).toHaveLength(2);
  });
});
