import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/libs/error/error';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
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
    // Asked again, never answered from the cache
    expect(mocks.fetchOccurrences).toHaveBeenLastCalledWith({ id: FEED, limit: 5, from: NOW, fresh: true });
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

  describe('a cursor Pinakes refuses (expired: a 400)', () => {
    const refused = () =>
      new AppError({
        category: ErrorCategory.Client,
        code: ClientErrorCode.BAD_REQUEST,
        message: 'Pinakes answered 400',
        service: ErrorService.Pinakes,
        operation: 'fetchOccurrences',
        context: { statusCode: 400 },
      });

    it('starts the dates over from a fresh first page, once, each date listed once', async () => {
      mocks.fetchOccurrences
        .mockResolvedValueOnce({ cards: DATES.slice(0, 2), cursor: 'expired' })
        .mockRejectedValueOnce(refused())
        .mockResolvedValueOnce({ cards: DATES.slice(0, 2), cursor: 'fresh' })
        .mockResolvedValueOnce({ cards: DATES.slice(2), cursor: null });
      const { result } = renderHook(() => useResourceOccurrences(FEED));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      vi.setSystemTime(new Date('2026-11-13T18:30:10Z'));
      await act(() => result.current.loadMore());

      // A new window from now, with no cursor, asked past the cache
      await waitFor(() => expect(mocks.fetchOccurrences).toHaveBeenCalledTimes(3));
      expect(mocks.fetchOccurrences).toHaveBeenLastCalledWith({
        id: FEED,
        limit: 5,
        from: '2026-11-13T18:30:00Z',
        fresh: true,
      });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current).toMatchObject({ isError: false, isMoreError: false, hasMore: true });
      expect(result.current.cards).toEqual(DATES.slice(0, 2));

      await act(() => result.current.loadMore());
      expect(mocks.fetchOccurrences).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'fresh' }));
      expect(result.current.cards).toEqual(DATES);
    });

    it('starts over past the cache within the same minute, where the window (and so the cached page) is the same', async () => {
      mocks.fetchOccurrences
        .mockResolvedValueOnce({ cards: DATES.slice(0, 2), cursor: 'expired' })
        .mockRejectedValueOnce(refused())
        .mockResolvedValueOnce({ cards: DATES.slice(0, 2), cursor: 'fresh' })
        .mockResolvedValueOnce({ cards: DATES.slice(2), cursor: null });
      const { result } = renderHook(() => useResourceOccurrences(FEED));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // No time passes: the list starts over in the minute it was first read in
      await act(() => result.current.loadMore());
      await waitFor(() => expect(mocks.fetchOccurrences).toHaveBeenCalledTimes(3));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      await act(() => result.current.loadMore());

      const asked = mocks.fetchOccurrences.mock.calls.map(([params]) => params);
      expect(asked).toEqual([
        { id: FEED, limit: 5, from: NOW },
        { id: FEED, limit: 5, from: NOW, cursor: 'expired' },
        // Only the first page read again skips the cache: it is the one the cache holds
        { id: FEED, limit: 5, from: NOW, fresh: true },
        { id: FEED, limit: 5, from: NOW, cursor: 'fresh' },
      ]);
      expect(result.current.cards).toEqual(DATES);
    });

    it('reads another resource from the cache as ever, after a list started over', async () => {
      mocks.fetchOccurrences
        .mockResolvedValueOnce({ cards: DATES.slice(0, 2), cursor: 'expired' })
        .mockRejectedValueOnce(refused())
        .mockResolvedValueOnce({ cards: DATES.slice(0, 2), cursor: 'fresh' })
        .mockResolvedValueOnce({ cards: [], cursor: null });
      const { result, rerender } = renderHook(({ id }) => useResourceOccurrences(id), { initialProps: { id: FEED } });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      await act(() => result.current.loadMore());
      await waitFor(() => expect(mocks.fetchOccurrences).toHaveBeenCalledTimes(3));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      rerender({ id: 'other' });
      await waitFor(() => expect(mocks.fetchOccurrences).toHaveBeenCalledTimes(4));

      expect(mocks.fetchOccurrences).toHaveBeenLastCalledWith({ id: 'other', limit: 5, from: NOW });
    });

    it('asks past the cache for the resource read again only, not for another one opened in the same go', async () => {
      mocks.fetchOccurrences.mockRejectedValueOnce(new Error('down')).mockResolvedValue({ cards: [], cursor: null });
      const { result, rerender } = renderHook(({ id }) => useResourceOccurrences(id), { initialProps: { id: FEED } });
      await waitFor(() => expect(result.current.isError).toBe(true));

      // Try again and, before it is read, another resource: that one's first page is a plain read
      act(() => {
        result.current.retry();
        rerender({ id: 'other' });
      });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const asked = mocks.fetchOccurrences.mock.calls.slice(1).map(([params]) => params);
      expect(asked.length).toBeGreaterThan(0);
      expect(asked).toEqual(asked.map(() => ({ id: 'other', limit: 5, from: NOW })));
    });

    it('says so when the fresh list’s cursor is refused too, instead of starting over again and again', async () => {
      mocks.fetchOccurrences
        .mockResolvedValueOnce({ cards: DATES.slice(0, 2), cursor: 'expired' })
        .mockRejectedValueOnce(refused())
        .mockResolvedValueOnce({ cards: DATES.slice(0, 2), cursor: 'also-refused' })
        .mockRejectedValueOnce(refused());
      const { result } = renderHook(() => useResourceOccurrences(FEED));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      await act(() => result.current.loadMore());
      await waitFor(() => expect(mocks.fetchOccurrences).toHaveBeenCalledTimes(3));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(() => result.current.loadMore());

      expect(mocks.fetchOccurrences).toHaveBeenCalledTimes(4);
      expect(result.current).toMatchObject({ isMoreError: true, hasMore: true });
      expect(result.current.cards).toEqual(DATES.slice(0, 2));
    });
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
