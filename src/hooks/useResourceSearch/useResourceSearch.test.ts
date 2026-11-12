import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/libs/error/error';
import { ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import type { TResourceQuery } from '@/pipes/resource/resource.search';
import { RESOURCE_SEARCH_UNAVAILABLE, useResourceSearch } from './useResourceSearch';

const mocks = vi.hoisted(() => ({ fetchSearchPage: vi.fn() }));

vi.mock('@/controllers/resource/resource', () => ({ ResourceController: { fetchSearchPage: mocks.fetchSearchPage } }));
vi.mock('@/config/pinakes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/pinakes')>()),
  PINAKES_SEARCH_DEBOUNCE_MS: 0,
}));

const query = (tags: string[]): TResourceQuery => ({
  input: { kind: 'tags', tags },
  sort: 'activity',
  reach: 'all',
  viewer: null,
  collapse: true,
});
const page = (uris: string[], cursor: string | null, extra = {}) => ({
  source: 'pinakes',
  uris,
  next: cursor ? { source: 'pinakes', cursor } : null,
  ...extra,
});
const appError = (statusCode: 400 | 503) =>
  statusCode === 400
    ? new AppError({
        category: ErrorCategory.Client,
        code: ClientErrorCode.BAD_REQUEST,
        message: 'Pinakes answered 400',
        service: ErrorService.Pinakes,
        operation: 'search',
        context: { statusCode },
      })
    : new AppError({
        category: ErrorCategory.Server,
        code: ServerErrorCode.SERVICE_UNAVAILABLE,
        message: 'Pinakes answered 503',
        service: ErrorService.Pinakes,
        operation: 'search',
        context: { statusCode },
      });

describe('useResourceSearch', () => {
  beforeEach(() => {
    mocks.fetchSearchPage.mockReset();
  });

  it('reads the first page with the facets, then the next pages by cursor, each link once', async () => {
    mocks.fetchSearchPage
      .mockResolvedValueOnce(
        page(['a', 'b'], 'c2', {
          typeFacets: [{ type: 'Book', type_path: ['Thing'], count: 3 }],
          relatedTags: ['track'],
        }),
      )
      .mockResolvedValueOnce(page(['b', 'c'], null));
    const q = query(['music']);

    const { result } = renderHook(() => useResourceSearch(q, { limit: 2, facets: true }));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.fetchSearchPage).toHaveBeenLastCalledWith({ query: q, limit: 2, facets: true });
    expect(result.current).toMatchObject({
      uris: ['a', 'b'],
      typeFacets: [{ type: 'Book', type_path: ['Thing'], count: 3 }],
      relatedTags: ['track'],
      source: 'pinakes',
      hasMore: true,
    });

    await act(() => result.current.loadMore());

    expect(mocks.fetchSearchPage).toHaveBeenLastCalledWith({
      query: q,
      cursor: { source: 'pinakes', cursor: 'c2' },
      limit: 2,
    });
    expect(result.current.uris).toEqual(['a', 'b', 'c']);
    expect(result.current.hasMore).toBe(false);
  });

  it('reads one query once, however often an equal query is passed', async () => {
    mocks.fetchSearchPage.mockResolvedValue(page(['a'], null));
    const { result, rerender } = renderHook(({ tags }) => useResourceSearch(query(tags)), {
      initialProps: { tags: ['music'] },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ tags: ['music'] });
    rerender({ tags: ['music'] });

    expect(mocks.fetchSearchPage).toHaveBeenCalledTimes(1);
  });

  it('starts over from the first page once when Pinakes refuses a cursor, then shows the error', async () => {
    mocks.fetchSearchPage
      .mockResolvedValueOnce(page(['a'], 'stale'))
      .mockRejectedValueOnce(appError(400))
      .mockResolvedValueOnce(page(['a'], 'stale-again'))
      .mockRejectedValueOnce(appError(400));
    const q = query(['music']);
    const { result } = renderHook(() => useResourceSearch(q));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.loadMore());
    await waitFor(() => expect(mocks.fetchSearchPage).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Started over past the cache, which still holds the refused cursor
    expect(mocks.fetchSearchPage.mock.calls[2][0]).toEqual({ query: q, limit: 10, facets: false, fresh: true });

    await act(() => result.current.loadMore());
    expect(result.current.error).toBe('Pinakes answered 400');
    expect(result.current.hasMore).toBe(false);
    expect(mocks.fetchSearchPage).toHaveBeenCalledTimes(4);
  });

  it('shows a failed first page with a retry that reads it again', async () => {
    mocks.fetchSearchPage.mockRejectedValueOnce(appError(503)).mockResolvedValueOnce(page(['a'], null));
    const { result } = renderHook(() => useResourceSearch(query(['music'])));
    await waitFor(() => expect(result.current.error).toBe('Pinakes answered 503'));

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.uris).toEqual(['a']));
    expect(result.current.error).toBeNull();
  });

  it('says so when no source can answer the query', async () => {
    mocks.fetchSearchPage.mockResolvedValueOnce({ source: 'unavailable', uris: [], next: null });
    const { result } = renderHook(() => useResourceSearch(query(['music'])));

    await waitFor(() => expect(result.current.error).toBe(RESOURCE_SEARCH_UNAVAILABLE));
    expect(result.current.hasMore).toBe(false);
    expect(result.current.unavailable).toBe(true);
  });

  it('drops a page that comes back for an older query', async () => {
    let resolveOld: (value: unknown) => void = () => {};
    mocks.fetchSearchPage
      .mockReturnValueOnce(new Promise((resolve) => (resolveOld = resolve)))
      .mockResolvedValueOnce(page(['video'], null));
    const { result, rerender } = renderHook(({ tags }) => useResourceSearch(query(tags)), {
      initialProps: { tags: ['music'] },
    });
    await waitFor(() => expect(mocks.fetchSearchPage).toHaveBeenCalledTimes(1));
    rerender({ tags: ['video'] });
    await waitFor(() => expect(result.current.uris).toEqual(['video']));

    resolveOld(page(['music'], null));
    await act(async () => {});
    expect(result.current.uris).toEqual(['video']);
  });

  it('reads nothing without a query', () => {
    const { result } = renderHook(() => useResourceSearch(null));

    expect(mocks.fetchSearchPage).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ uris: [], loading: false, hasMore: false });
  });
});
