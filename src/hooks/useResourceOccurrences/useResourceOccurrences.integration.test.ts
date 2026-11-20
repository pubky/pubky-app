import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import occurrencesFixture from '@/services/pinakes/fixtures/occurrences.holidays.json';
import { pinakesQueryClient } from '@/services/pinakes/pinakes.query-client';
import type { TPinakesCard } from '@/services/pinakes/pinakes.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { useResourceOccurrences } from './useResourceOccurrences';

// The hook over the real controller, application and service (their cache too): only Pinakes'
// origin and the transport are stood in for.
vi.mock('@/config/pinakes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/pinakes')>()),
  getPinakesUrl: () => 'https://pinakes.example',
  isPinakesConfigured: () => true,
}));

const DATES: TPinakesCard[] = occurrencesFixture.items;
const FEED = '2950248974677c9ca34f1f67b8a2da80';
const mockFetch = vi.fn();

const page = (items: TPinakesCard[], cursor: string | null) =>
  new Response(JSON.stringify({ items, cursor }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const requested = () => mockFetch.mock.calls.map(([url]) => Object.fromEntries(new URL(String(url)).searchParams));

describe('useResourceOccurrences over the cached Pinakes reads', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-13T17:05:42Z'));
    pinakesQueryClient.clear();
    mockFetch.mockReset();
    global.fetch = asOpaque<typeof global.fetch>(mockFetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = realFetch;
  });

  it('asks Pinakes for a new first page when a cursor is refused in the minute the list was read in', async () => {
    mockFetch
      .mockResolvedValueOnce(page(DATES.slice(0, 2), 'expired'))
      .mockResolvedValueOnce(new Response('{"error":"invalid cursor"}', { status: 400 }))
      .mockResolvedValueOnce(page(DATES.slice(0, 2), 'new'))
      .mockResolvedValueOnce(page(DATES.slice(2), null));
    const { result } = renderHook(() => useResourceOccurrences(FEED));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // The clock does not move: the list starts over in the same window, whose first page is cached
    await act(() => result.current.loadMore());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toMatchObject({ isError: false, isMoreError: false, hasMore: true });

    await act(() => result.current.loadMore());

    const from = '2026-11-13T17:05:00Z';
    expect(requested()).toEqual([
      { from, limit: '5' },
      { from, limit: '5', cursor: 'expired' },
      // The same request as the first, sent again: nothing of the app's own is added to it
      { from, limit: '5' },
      { from, limit: '5', cursor: 'new' },
    ]);
    expect(result.current.cards).toEqual(DATES);
    expect(result.current).toMatchObject({ hasMore: false, isMoreError: false });
  });
});
