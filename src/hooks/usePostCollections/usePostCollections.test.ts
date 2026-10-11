import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COLLECTIONS_SECTION_PAGE_SIZE } from '@/config/collections';
import { usePostCollections } from './usePostCollections';

type PaginationParams = { streamId?: string; limit?: number };

const mocks = vi.hoisted(() => ({
  paginationParams: null as PaginationParams | null,
  paginationResult: { postIds: [] as string[], loading: false },
}));

vi.mock('@/hooks/useStreamPagination/useStreamPagination', () => ({
  useStreamPagination: (params: PaginationParams) => {
    mocks.paginationParams = params;
    return mocks.paginationResult;
  },
}));

describe('usePostCollections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.paginationParams = null;
    mocks.paginationResult = { postIds: [], loading: false };
  });

  it('reads one page of the post_collections stream of the post while enabled', () => {
    mocks.paginationResult = { postIds: ['curator:collection1', 'curator:collection2'], loading: false };

    const { result } = renderHook(() => usePostCollections('author:post1', { enabled: true }));

    expect(mocks.paginationParams).toEqual({
      streamId: 'post_collections:author:post1',
      limit: COLLECTIONS_SECTION_PAGE_SIZE,
    });
    expect(result.current).toEqual({
      collectionIds: ['curator:collection1', 'curator:collection2'],
      isLoading: false,
    });
  });

  it('reports the page in flight', () => {
    mocks.paginationResult = { postIds: [], loading: true };

    const { result } = renderHook(() => usePostCollections('author:post1', { enabled: true }));

    expect(result.current).toEqual({ collectionIds: [], isLoading: true });
  });

  it('stays inert with no stream while disabled (the default)', () => {
    const { result } = renderHook(() => usePostCollections('author:post1'));

    expect(mocks.paginationParams).toEqual({ streamId: undefined, limit: COLLECTIONS_SECTION_PAGE_SIZE });
    expect(result.current).toEqual({ collectionIds: [], isLoading: false });
  });
});
