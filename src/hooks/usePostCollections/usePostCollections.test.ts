import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COLLECTIONS_SECTION_PAGE_SIZE } from '@/config/collections';
import { usePostCollections } from './usePostCollections';

type PaginationParams = { streamId?: string; limit?: number };

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
    });
    expect(result.current).toEqual({
      collectionIds: ['curator:collection1', 'curator:collection2'],
      isLoading: false,
      hasMore: false,
      isLoadingMore: true,
      loadMore: mocks.loadMore,
    });
  });

  it('stays inert with no stream while disabled (the default)', () => {
    const { result } = renderHook(() => usePostCollections('author:post1'));

    expect(mocks.paginationParams).toEqual({ streamId: undefined, limit: COLLECTIONS_SECTION_PAGE_SIZE });
    expect(result.current.collectionIds).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('honours hasMore only once the first page of this lifetime has settled', () => {
    // The paginator reports `hasMore: true` from the moment it is enabled, before its own
    // effect flips `loading` on: that render must not read as a page with more behind it.
    mocks.paginationResult = { postIds: [], loading: false, loadingMore: false, hasMore: true };
    const { result, rerender } = renderHook(() => usePostCollections('author:post1', { enabled: true }));
    expect(result.current.hasMore).toBe(false);

    mocks.paginationResult = { postIds: [], loading: true, loadingMore: false, hasMore: true };
    rerender();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.hasMore).toBe(false);

    // A page that the stream layer filtered down to nothing still settled: more may follow.
    mocks.paginationResult = { postIds: [], loading: false, loadingMore: false, hasMore: true };
    rerender();
    expect(result.current.hasMore).toBe(true);
  });

  it('starts a new lifetime every time the surface is enabled again', () => {
    let enabled = true;
    mocks.paginationResult = { postIds: [], loading: true, loadingMore: false, hasMore: true };
    const { result, rerender } = renderHook(() => usePostCollections('author:post1', { enabled }));
    mocks.paginationResult = { postIds: ['curator:collection1'], loading: false, loadingMore: false, hasMore: true };
    rerender();
    expect(result.current.hasMore).toBe(true);

    enabled = false;
    mocks.paginationResult = { postIds: [], loading: false, loadingMore: false, hasMore: false };
    rerender();
    expect(result.current.hasMore).toBe(false);

    // Re-enabled: the stale settled flags from the previous lifetime do not count.
    enabled = true;
    mocks.paginationResult = { postIds: [], loading: false, loadingMore: false, hasMore: true };
    rerender();
    expect(result.current.hasMore).toBe(false);
  });
});
