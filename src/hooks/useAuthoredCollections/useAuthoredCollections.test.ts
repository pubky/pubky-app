import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COLLECTIONS_SECTION_PAGE_SIZE } from '@/config/collections';
import { useAuthoredCollections, useAuthoredCollectionsPagination } from './useAuthoredCollections';

type LocalFirstParams = {
  queryFn: () => Promise<unknown>;
  fetchFn: () => Promise<unknown>;
  deps: unknown[];
  enabled: boolean;
};

const mocks = vi.hoisted(() => ({
  currentUserPubky: 'current-user' as string | null,
  capturedParams: null as LocalFirstParams | null,
  localFirstResult: {
    data: undefined as unknown,
    isLoading: false,
  },
  getAuthoredCollections: vi.fn(),
  fetchAuthoredCollections: vi.fn(),
  loadMore: vi.fn(),
  paginationParams: null as { streamId?: string; limit?: number; onError?: (error: unknown) => void } | null,
  paginationResult: { hasMore: false, loading: false, loadingMore: false },
}));

const authoredCollections = [
  {
    details: { id: 'current-user:collection1' },
    content: {
      name: 'Proof of Work',
      description: 'Bitcoin writing',
      items: [],
    },
  },
];

vi.mock('@/controllers/post/post', () => ({
  PostController: {
    getAuthoredCollections: (...args: unknown[]) => mocks.getAuthoredCollections(...args),
    fetchAuthoredCollections: (...args: unknown[]) => mocks.fetchAuthoredCollections(...args),
  },
}));

vi.mock('@/hooks/useLocalFirstQuery/useLocalFirstQuery', () => ({
  useLocalFirstQuery: (params: LocalFirstParams) => {
    mocks.capturedParams = params;
    return mocks.localFirstResult;
  },
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: mocks.currentUserPubky }),
}));

vi.mock('@/hooks/useStreamPagination/useStreamPagination', () => ({
  useStreamPagination: (params: { streamId?: string; limit?: number; onError?: (error: unknown) => void }) => {
    mocks.paginationParams = params;
    return {
      hasMore: mocks.paginationResult.hasMore,
      loading: mocks.paginationResult.loading,
      loadingMore: mocks.paginationResult.loadingMore,
      loadMore: mocks.loadMore,
    };
  },
}));

describe('useAuthoredCollections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUserPubky = 'current-user';
    mocks.capturedParams = null;
    mocks.localFirstResult = {
      data: authoredCollections,
      isLoading: false,
    };
    mocks.getAuthoredCollections.mockResolvedValue(authoredCollections);
    mocks.fetchAuthoredCollections.mockResolvedValue(authoredCollections);
  });

  it('returns collections and loading state from the local-first query', () => {
    const { result } = renderHook(() => useAuthoredCollections());

    expect(result.current.collections).toEqual(authoredCollections);
    expect(result.current.isLoading).toBe(false);
  });

  it('wires local and network collection reads to the current user', async () => {
    renderHook(() => useAuthoredCollections());

    expect(mocks.capturedParams).toMatchObject({
      deps: ['current-user'],
      enabled: true,
    });

    await mocks.capturedParams!.queryFn();
    await mocks.capturedParams!.fetchFn();

    expect(mocks.getAuthoredCollections).toHaveBeenCalledWith({ authorId: 'current-user' });
    expect(mocks.fetchAuthoredCollections).toHaveBeenCalledWith({
      authorId: 'current-user',
      viewerId: 'current-user',
    });
  });

  it('returns an empty list and disables reads when there is no current user', () => {
    mocks.currentUserPubky = null;
    mocks.localFirstResult = {
      data: undefined,
      isLoading: false,
    };

    const { result } = renderHook(() => useAuthoredCollections());

    expect(result.current.collections).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(mocks.capturedParams).toMatchObject({
      deps: [null],
      enabled: false,
    });
  });

  it('respects an explicit disabled flag', () => {
    renderHook(() => useAuthoredCollections(false));

    expect(mocks.capturedParams).toMatchObject({
      deps: ['current-user'],
      enabled: false,
    });
  });
});

describe('useAuthoredCollectionsPagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUserPubky = 'current-user';
    mocks.paginationParams = null;
    mocks.paginationResult = { hasMore: true, loading: false, loadingMore: false };
  });

  it('paginates the current user authored-collections stream at the collections page size', () => {
    const { result } = renderHook(() => useAuthoredCollectionsPagination({ enabled: true }));

    expect(mocks.paginationParams?.streamId).toContain('current-user');
    expect(mocks.paginationParams?.streamId).toContain(':author:collection');
    expect(mocks.paginationParams?.limit).toBe(COLLECTIONS_SECTION_PAGE_SIZE);
    expect(result.current).toMatchObject({ hasMore: true, isLoading: false, isLoadingMore: false });
    expect(result.current.loadMore).toBe(mocks.loadMore);
  });

  it('stays inert while disabled, without a stream to paginate', () => {
    renderHook(() => useAuthoredCollectionsPagination({ enabled: false }));

    expect(mocks.paginationParams?.streamId).toBeUndefined();
  });

  it('stays inert for a signed-out user even when enabled', () => {
    mocks.currentUserPubky = null;
    renderHook(() => useAuthoredCollectionsPagination({ enabled: true }));

    expect(mocks.paginationParams?.streamId).toBeUndefined();
  });

  it('forwards the page-load error handler to the pagination hook', () => {
    const onError = vi.fn();
    renderHook(() => useAuthoredCollectionsPagination({ enabled: true, onError }));

    expect(mocks.paginationParams?.onError).toBe(onError);
  });
});
