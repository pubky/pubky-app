import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import occurrencesFixture from '@/services/pinakes/fixtures/occurrences.holidays.json';
import type { TPinakesCard } from '@/services/pinakes/pinakes.types';
import { useResourceOccurrences } from './useResourceOccurrences';

const mocks = vi.hoisted(() => ({ configured: true, fetchOccurrences: vi.fn() }));

vi.mock('@/config/pinakes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/pinakes')>()),
  isPinakesConfigured: () => mocks.configured,
}));
vi.mock('@/controllers/pinakes/pinakes', () => ({ PinakesController: { fetchOccurrences: mocks.fetchOccurrences } }));

const DATES: TPinakesCard[] = occurrencesFixture.items;
const FEED = '2950248974677c9ca34f1f67b8a2da80';
const NOW = '2026-11-13T17:05:00Z';

describe('useResourceOccurrences', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-13T17:05:42Z'));
    mocks.configured = true;
    mocks.fetchOccurrences.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it('reads the first dates from now on, then the next page in the same window by its cursor', async () => {
    mocks.fetchOccurrences
      .mockResolvedValueOnce({ cards: DATES.slice(0, 2), cursor: 'c2' })
      .mockResolvedValueOnce({ cards: DATES.slice(2), cursor: null });

    const { result } = renderHook(() => useResourceOccurrences(FEED));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.fetchOccurrences).toHaveBeenLastCalledWith({ id: FEED, limit: 5, from: NOW });
    expect(result.current.cards).toEqual(DATES.slice(0, 2));
    expect(result.current.hasMore).toBe(true);

    // Later: the window still starts where the first page's did, so the cursor fits
    vi.setSystemTime(new Date('2026-11-13T17:20:00Z'));
    await act(() => result.current.loadMore());

    expect(mocks.fetchOccurrences).toHaveBeenLastCalledWith({ id: FEED, limit: 5, from: NOW, cursor: 'c2' });
    expect(result.current.cards).toEqual(DATES);
    expect(result.current.hasMore).toBe(false);
  });

  it('keeps every date of a calendar: they share its id and link', async () => {
    mocks.fetchOccurrences.mockResolvedValueOnce({ cards: DATES, cursor: null });

    const { result } = renderHook(() => useResourceOccurrences(FEED));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(new Set(DATES.map((card) => card.id)).size).toBe(1);
    expect(result.current.cards).toHaveLength(3);
  });

  it('has no dates and nothing more for a resource that is no calendar', async () => {
    mocks.fetchOccurrences.mockResolvedValueOnce({ cards: [], cursor: null });

    const { result } = renderHook(() => useResourceOccurrences('an-event'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current).toMatchObject({ cards: [], hasMore: false, isError: false });
  });

  it('says so when the first dates cannot be read', async () => {
    mocks.fetchOccurrences.mockRejectedValueOnce(new Error('down'));

    const { result } = renderHook(() => useResourceOccurrences(FEED));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.cards).toEqual([]);
  });

  it('keeps the dates read when a later page fails, says so, and reads it again on the next ask', async () => {
    mocks.fetchOccurrences
      .mockResolvedValueOnce({ cards: DATES.slice(0, 2), cursor: 'c2' })
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ cards: DATES.slice(2), cursor: null });
    const { result } = renderHook(() => useResourceOccurrences(FEED));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(() => result.current.loadMore());
    expect(result.current).toMatchObject({ isMoreError: true, hasMore: true, isError: false });
    expect(result.current.cards).toEqual(DATES.slice(0, 2));

    await act(() => result.current.loadMore());
    expect(result.current).toMatchObject({ isMoreError: false, hasMore: false });
    expect(result.current.cards).toEqual(DATES);
  });

  it('reads the first dates again on retry, after they could not be read', async () => {
    mocks.fetchOccurrences
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ cards: DATES, cursor: null });
    const { result } = renderHook(() => useResourceOccurrences(FEED));
    await waitFor(() => expect(result.current.isError).toBe(true));

    act(() => result.current.retry());

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.cards).toEqual(DATES));
    expect(result.current.isError).toBe(false);
  });

  it('drops a next page that comes back after the same calendar was opened anew: its cursor is another window’s', async () => {
    let finish: (page: { cards: TPinakesCard[]; cursor: string | null }) => void = () => {};
    mocks.fetchOccurrences
      .mockResolvedValueOnce({ cards: DATES.slice(0, 1), cursor: 'old-c2' })
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
      .mockResolvedValueOnce({ cards: [], cursor: null })
      .mockResolvedValueOnce({ cards: DATES.slice(0, 2), cursor: 'new-c2' })
      .mockResolvedValueOnce({ cards: DATES.slice(2), cursor: null });
    const { result, rerender } = renderHook(({ id }) => useResourceOccurrences(id), { initialProps: { id: FEED } });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => void result.current.loadMore());

    // Away to another resource and back: the calendar is read anew, in a new window
    rerender({ id: 'other' });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    rerender({ id: FEED });
    await waitFor(() => expect(result.current.cards).toHaveLength(2));
    await act(async () => finish({ cards: DATES.slice(1), cursor: 'old-c3' }));

    expect(result.current.cards).toEqual(DATES.slice(0, 2));
    await act(() => result.current.loadMore());
    expect(mocks.fetchOccurrences).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'new-c2' }));
  });

  it('asks for one next page at a time', async () => {
    let finish: (page: { cards: TPinakesCard[]; cursor: string | null }) => void = () => {};
    mocks.fetchOccurrences
      .mockResolvedValueOnce({ cards: DATES.slice(0, 1), cursor: 'c2' })
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useResourceOccurrences(FEED));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => void result.current.loadMore());
    act(() => void result.current.loadMore());
    expect(result.current.isLoadingMore).toBe(true);
    await act(async () => finish({ cards: DATES.slice(1), cursor: null }));

    expect(mocks.fetchOccurrences).toHaveBeenCalledTimes(2);
    expect(result.current.isLoadingMore).toBe(false);
  });

  it('reads nothing without a resource, or without Pinakes', () => {
    const { result } = renderHook(() => useResourceOccurrences(null));
    expect(result.current).toMatchObject({ cards: [], isLoading: false, hasMore: false });

    mocks.configured = false;
    renderHook(() => useResourceOccurrences(FEED));
    expect(mocks.fetchOccurrences).not.toHaveBeenCalled();
  });

  it('drops a page that comes back for another resource', async () => {
    let finish: (page: { cards: TPinakesCard[]; cursor: string | null }) => void = () => {};
    mocks.fetchOccurrences
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
      .mockResolvedValueOnce({ cards: [], cursor: null });
    const { result, rerender } = renderHook(({ id }) => useResourceOccurrences(id), { initialProps: { id: FEED } });

    rerender({ id: 'other' });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => finish({ cards: DATES, cursor: null }));

    expect(result.current.cards).toEqual([]);
  });
});
