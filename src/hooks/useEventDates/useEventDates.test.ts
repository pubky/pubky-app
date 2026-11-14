import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENT_SERIES_DATES_LIMIT } from '@/config/events';
import type { UseResourceOccurrencesResult } from '@/hooks/useResourceOccurrences/useResourceOccurrences';
import { getSeriesWindowStart } from '@/pipes/resource/resource.events';
import meetupDateFixture from '@/services/pinakes/fixtures/by-uri.meetup-date.json';
import meetupDatesFixture from '@/services/pinakes/fixtures/occurrences.meetup.json';
import type { TPinakesCard, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { useEventDates } from './useEventDates';

const mocks = vi.hoisted(() => ({
  feed: { feed: null as unknown, isLoading: false },
  dates: null as unknown,
  asked: [] as unknown[][],
  feedAsked: [] as unknown[][],
}));

vi.mock('@/hooks/useEventFeed/useEventFeed', () => ({
  useEventFeed: (...args: unknown[]) => {
    mocks.feedAsked.push(args);
    return mocks.feed;
  },
}));
vi.mock('@/hooks/useResourceOccurrences/useResourceOccurrences', () => ({
  // As the hook does, no id reads no dates
  useResourceOccurrences: (...args: unknown[]) => {
    mocks.asked.push(args);
    return args[0] ? mocks.dates : { ...(mocks.dates as object), cards: [], isLoading: false };
  },
}));

const DATE: TPinakesResourceDetail = meetupDateFixture;
const DATES: TPinakesCard[] = meetupDatesFixture.items;
const FEED = {
  id: '51ee469240e25fe6a378dc8d317e3f89',
  uri: 'https://www.meetup.com/bitcoin-meetup-switzerland/events/ical/',
};
const read = (overrides: Partial<UseResourceOccurrencesResult> = {}): UseResourceOccurrencesResult => ({
  cards: DATES,
  isLoading: false,
  isError: false,
  hasMore: false,
  isLoadingMore: false,
  isMoreError: false,
  loadMore: vi.fn(async () => {}),
  retry: vi.fn(),
  ...overrides,
});

describe('useEventDates', () => {
  afterEach(() => vi.useRealTimers());

  beforeEach(() => {
    // Before the series' first date: none has started
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-14T06:00:00Z'));
    mocks.feed = { feed: FEED, isLoading: false };
    mocks.dates = read();
    mocks.asked.length = 0;
    mocks.feedAsked.length = 0;
  });

  it('reads the feed’s coming dates, one read for the series, and splits off this date', () => {
    const { result } = renderHook(() => useEventDates(DATE));

    expect(mocks.asked.at(-1)).toEqual([
      FEED.id,
      { limit: EVENT_SERIES_DATES_LIMIT, windowStart: getSeriesWindowStart },
    ]);
    expect(result.current.feed).toEqual(FEED);
    expect(result.current.sameName).toHaveLength(9);
    expect(result.current.others).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('is loading while the feed or its dates are read', () => {
    mocks.feed = { feed: null, isLoading: true };
    expect(renderHook(() => useEventDates(DATE)).result.current.isLoading).toBe(true);
    expect(mocks.asked.at(-1)?.[0]).toBeNull();

    mocks.feed = { feed: FEED, isLoading: false };
    mocks.dates = read({ cards: [], isLoading: true });
    expect(renderHook(() => useEventDates(DATE)).result.current.isLoading).toBe(true);
  });

  it('reads no dates for an event with no feed, nor while disabled', () => {
    mocks.feed = { feed: null, isLoading: false };
    const { result } = renderHook(() => useEventDates(DATE));
    expect(result.current).toMatchObject({ feed: null, sameName: [], others: [], isLoading: false });
    expect(mocks.asked.at(-1)?.[0]).toBeNull();

    renderHook(() => useEventDates(DATE, { enabled: false }));
    expect(mocks.feedAsked.at(-1)).toEqual([DATE, { enabled: false }]);

    // Disabled, no dates are read even with a feed known (a feed's own date names it)
    mocks.feed = { feed: FEED, isLoading: false };
    const disabled = renderHook(() => useEventDates(DATE, { enabled: false }));
    expect(mocks.asked.at(-1)?.[0]).toBeNull();
    expect(disabled.result.current.isLoading).toBe(false);
  });

  it('passes the read’s error, paging and retry on', () => {
    const retry = vi.fn();
    mocks.dates = read({ cards: [], isError: true, retry });

    const { result } = renderHook(() => useEventDates(DATE));
    result.current.retry();

    expect(result.current.isError).toBe(true);
    expect(retry).toHaveBeenCalledOnce();
  });
});
