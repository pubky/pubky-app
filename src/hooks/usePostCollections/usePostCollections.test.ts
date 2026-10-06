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
