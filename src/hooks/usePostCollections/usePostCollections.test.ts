import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COLLECTIONS_COUNT_PROTECTION_MS, COLLECTIONS_SECTION_PAGE_SIZE } from '@/config/collections';
import { usePostCollections } from './usePostCollections';

type PaginationParams = { streamId?: string; limit?: number; skipOverlap?: number | (() => number) };

const mocks = vi.hoisted(() => ({
  paginationParams: null as PaginationParams | null,
  paginationResult: {
    postIds: [] as string[],
    loading: false,
    loadingMore: false,
    hasMore: false,
  },
  loadMore: vi.fn(),
}));

vi.mock('@/hooks/useStreamPagination/useStreamPagination', () => ({
  useStreamPagination: (params: PaginationParams) => {
    mocks.paginationParams = params;
    return { ...mocks.paginationResult, loadMore: mocks.loadMore };
  },
}));

/** What the paginator would rewind by if it issued a request now. */
const pendingOverlap = () => {
  const { skipOverlap } = mocks.paginationParams ?? {};
  return typeof skipOverlap === 'function' ? skipOverlap() : skipOverlap;
};

describe('usePostCollections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.paginationParams = null;
    mocks.paginationResult = { postIds: [], loading: false, loadingMore: false, hasMore: false };
  });

  it('paginates the post_collections stream of the post while enabled', () => {
    mocks.paginationResult = {
      postIds: ['curator:collection1', 'curator:collection2'],
      loading: false,
      loadingMore: true,
      hasMore: false,
    };

    const { result } = renderHook(() => usePostCollections('author:post1', { enabled: true }));

    expect(mocks.paginationParams).toEqual({
      streamId: 'post_collections:author:post1',
      limit: COLLECTIONS_SECTION_PAGE_SIZE,
      skipOverlap: expect.any(Function),
    });
    expect(pendingOverlap()).toBe(0);
    expect(result.current).toEqual({
      collectionIds: ['curator:collection1', 'curator:collection2'],
      isLoading: false,
      hasMore: false,
      isLoadingMore: true,
      loadMore: mocks.loadMore,
      recordRemoval: expect.any(Function),
    });
  });

  it('widens the paginator overlap by one for every own removal, across picker lifetimes', () => {
    let enabled = true;
    const { result, rerender } = renderHook(() => usePostCollections('author:post1', { enabled }));

    result.current.recordRemoval();
    result.current.recordRemoval();
    expect(pendingOverlap()).toBe(2);

    // Closing and reopening the picker before Nexus indexed the removals pages the old
    // list too, so the overlap outlives the enabled lifetime.
    enabled = false;
    rerender();
    enabled = true;
    rerender();
    expect(pendingOverlap()).toBe(2);
  });

  it('lets a removal expire with the protection window, without another mutation or render', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => usePostCollections('author:post1', { enabled: true }));

      result.current.recordRemoval();
      vi.advanceTimersByTime(COLLECTIONS_COUNT_PROTECTION_MS - 1);
      expect(pendingOverlap()).toBe(1);

      // Past the window the removal counts for one more request, so a picker that sat idle
      // while Nexus indexed the shift still rewinds over it once; then it is forgotten.
      vi.advanceTimersByTime(1);
      expect(pendingOverlap()).toBe(1);
      expect(pendingOverlap()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays inert with no stream while disabled (the default)', () => {
    const { result } = renderHook(() => usePostCollections('author:post1'));

    expect(mocks.paginationParams).toEqual({
      streamId: undefined,
      limit: COLLECTIONS_SECTION_PAGE_SIZE,
      skipOverlap: expect.any(Function),
    });
    expect(result.current.collectionIds).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('reports the paginator flags as they are, including a settled empty page with more behind it', () => {
    // A page the stream layer filtered down to nothing still settled: more may follow.
    // Hiding a stale `hasMore` across enables is `useStreamPagination`'s job (it
    // re-arms `loading` while inert), so nothing is layered on top here.
    mocks.paginationResult = { postIds: [], loading: true, loadingMore: false, hasMore: true };
    const { result, rerender } = renderHook(() => usePostCollections('author:post1', { enabled: true }));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.hasMore).toBe(true);

    mocks.paginationResult = { postIds: [], loading: false, loadingMore: false, hasMore: true };
    rerender();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasMore).toBe(true);
  });
});
