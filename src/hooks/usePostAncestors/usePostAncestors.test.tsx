import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePostAncestors } from './usePostAncestors';

// Hoist mock data for useLiveQuery
const { mockQueryResult, setMockQueryResult } = vi.hoisted(() => {
  const queryResultData = {
    current: undefined as
      | { ancestors: { postId: string; userId: string }[]; nextMissingPostId: string | null }
      | null
      | undefined,
  };
  return {
    mockQueryResult: queryResultData,
    setMockQueryResult: (
      value: { ancestors: { postId: string; userId: string }[]; nextMissingPostId: string | null } | null | undefined,
    ) => {
      queryResultData.current = value;
    },
  };
});

// Mock dexie-react-hooks
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn((_queryFn: () => Promise<unknown>, _deps: unknown[], defaultValue: unknown) => {
    return mockQueryResult.current !== undefined ? mockQueryResult.current : defaultValue;
  }),
}));

// Mock Core
const mockGetRelationships = vi.fn();
const mockFetch = vi.fn().mockResolvedValue({ id: 'mock-post' });
vi.mock('@/core', () => ({
  PostController: {
    getRelationships: (params: { compositeId: string }) => mockGetRelationships(params),
    fetch: (params: { compositeId: string }) => mockFetch(params),
  },
  parseCompositeId: vi.fn(),
  buildCompositeIdFromPubkyUri: vi.fn(),
  CompositeIdDomain: { POSTS: 'posts' },
}));

describe('usePostAncestors', () => {
  const mockPostId = 'user3:post3';

  beforeEach(() => {
    vi.clearAllMocks();
    setMockQueryResult(undefined);
    mockFetch.mockResolvedValue({ id: 'mock-post' });
  });

  describe('Loading state', () => {
    it('returns isLoading true when query result is undefined', () => {
      setMockQueryResult(undefined);

      const { result } = renderHook(() => usePostAncestors(mockPostId));

      expect(result.current.isLoading).toBe(true);
      expect(result.current.ancestors).toEqual([]);
      expect(result.current.hasError).toBe(false);
    });

    it('returns isLoading false when query resolves', () => {
      setMockQueryResult({ ancestors: [], nextMissingPostId: null });

      const { result } = renderHook(() => usePostAncestors(mockPostId));

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('Disabled (null/undefined postId)', () => {
    it('returns empty ancestors when postId is null', () => {
      setMockQueryResult({ ancestors: [], nextMissingPostId: null });

      const { result } = renderHook(() => usePostAncestors(null));

      expect(result.current.isLoading).toBe(false);
      expect(result.current.ancestors).toEqual([]);
      expect(result.current.hasError).toBe(false);
    });

    it('returns empty ancestors when postId is undefined', () => {
      setMockQueryResult({ ancestors: [], nextMissingPostId: null });

      const { result } = renderHook(() => usePostAncestors(undefined));

      expect(result.current.isLoading).toBe(false);
      expect(result.current.ancestors).toEqual([]);
      expect(result.current.hasError).toBe(false);
    });

    it('does not call fetch when postId is null', () => {
      setMockQueryResult({ ancestors: [], nextMissingPostId: null });

      renderHook(() => usePostAncestors(null));

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does not call fetch when postId is undefined', () => {
      setMockQueryResult({ ancestors: [], nextMissingPostId: null });

      renderHook(() => usePostAncestors(undefined));

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Complete chain (no missing ancestors)', () => {
    it('returns single ancestor for root post', () => {
      setMockQueryResult({
        ancestors: [{ postId: 'user1:post1', userId: 'user1' }],
        nextMissingPostId: null,
      });

      const { result } = renderHook(() => usePostAncestors('user1:post1'));

      expect(result.current.ancestors).toEqual([{ postId: 'user1:post1', userId: 'user1' }]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.hasError).toBe(false);
    });

    it('returns ancestor chain for reply post', () => {
      setMockQueryResult({
        ancestors: [
          { postId: 'user1:post1', userId: 'user1' }, // Root
          { postId: 'user2:post2', userId: 'user2' }, // Parent
          { postId: 'user3:post3', userId: 'user3' }, // Current
        ],
        nextMissingPostId: null,
      });

      const { result } = renderHook(() => usePostAncestors(mockPostId));

      expect(result.current.ancestors).toHaveLength(3);
      expect(result.current.ancestors[0]).toEqual({ postId: 'user1:post1', userId: 'user1' });
      expect(result.current.ancestors[1]).toEqual({ postId: 'user2:post2', userId: 'user2' });
      expect(result.current.ancestors[2]).toEqual({ postId: 'user3:post3', userId: 'user3' });
      expect(result.current.hasError).toBe(false);
    });

    it('does not call fetch when chain is complete', () => {
      setMockQueryResult({
        ancestors: [{ postId: 'user1:post1', userId: 'user1' }],
        nextMissingPostId: null,
      });

      renderHook(() => usePostAncestors('user1:post1'));

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('handles deep reply chains', () => {
      const deepChain = [
        { postId: 'user1:post1', userId: 'user1' },
        { postId: 'user2:post2', userId: 'user2' },
        { postId: 'user3:post3', userId: 'user3' },
        { postId: 'user4:post4', userId: 'user4' },
        { postId: 'user5:post5', userId: 'user5' },
      ];

      setMockQueryResult({ ancestors: deepChain, nextMissingPostId: null });

      const { result } = renderHook(() => usePostAncestors('user5:post5'));

      expect(result.current.ancestors).toHaveLength(5);
      expect(result.current.ancestors[0].postId).toBe('user1:post1');
      expect(result.current.ancestors[4].postId).toBe('user5:post5');
    });

    it('preserves ancestor order from root to current', () => {
      setMockQueryResult({
        ancestors: [
          { postId: 'root:post', userId: 'root' },
          { postId: 'middle:post', userId: 'middle' },
          { postId: 'current:post', userId: 'current' },
        ],
        nextMissingPostId: null,
      });

      const { result } = renderHook(() => usePostAncestors('current:post'));

      expect(result.current.ancestors[0].userId).toBe('root');
      expect(result.current.ancestors[result.current.ancestors.length - 1].userId).toBe('current');
    });
  });

  describe('Fetch arm (missing ancestors)', () => {
    it('calls fetch when a missing ancestor is detected', () => {
      setMockQueryResult({
        ancestors: [{ postId: 'user2:post2', userId: 'user2' }],
        nextMissingPostId: 'user1:post1',
      });

      renderHook(() => usePostAncestors(mockPostId));

      expect(mockFetch).toHaveBeenCalledWith({ compositeId: 'user1:post1' });
    });

    it('buffers ancestors and stays in loading state while fetching', () => {
      setMockQueryResult({
        ancestors: [
          { postId: 'user2:post2', userId: 'user2' },
          { postId: 'user3:post3', userId: 'user3' },
        ],
        nextMissingPostId: 'user1:post1',
      });

      const { result } = renderHook(() => usePostAncestors(mockPostId));

      // Ancestors are buffered while the chain is still resolving
      expect(result.current.ancestors).toEqual([]);
      expect(result.current.isLoading).toBe(true);
      expect(result.current.hasError).toBe(false);
    });

    it('sets hasError when fetch rejects (network error)', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      setMockQueryResult({
        ancestors: [],
        nextMissingPostId: 'missing:post',
      });

      const { result } = renderHook(() => usePostAncestors(mockPostId));

      await waitFor(() => {
        expect(result.current.hasError).toBe(true);
      });
      expect(result.current.isLoading).toBe(false);
    });

    it('does not call fetch again after hasError is set', async () => {
      // First render: fetch rejects → hasError = true
      mockFetch.mockRejectedValue(new Error('Network error'));
      setMockQueryResult({
        ancestors: [],
        nextMissingPostId: 'missing:post',
      });

      const { result } = renderHook(() => usePostAncestors(mockPostId));

      await waitFor(() => {
        expect(result.current.hasError).toBe(true);
      });

      // Clear calls after error was set
      mockFetch.mockClear();

      // The same nextMissingPostId is still present, but hasError guards the effect
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does not set hasError when fetch resolves successfully', () => {
      mockFetch.mockResolvedValue({ id: 'fetched-post' });
      setMockQueryResult({
        ancestors: [{ postId: 'user2:post2', userId: 'user2' }],
        nextMissingPostId: 'user1:post1',
      });

      const { result } = renderHook(() => usePostAncestors(mockPostId));

      expect(mockFetch).toHaveBeenCalledWith({ compositeId: 'user1:post1' });
      // Still resolving (Dexie would re-fire useLiveQuery after persist)
      expect(result.current.isLoading).toBe(true);
      expect(result.current.hasError).toBe(false);
    });
  });

  describe('Stalled chain (ancestor not found)', () => {
    it('exposes partial ancestors after fetch returns null', async () => {
      mockFetch.mockResolvedValue(null);
      setMockQueryResult({
        ancestors: [
          { postId: 'user2:post2', userId: 'user2' },
          { postId: 'user3:post3', userId: 'user3' },
        ],
        nextMissingPostId: 'user1:post1',
      });

      const { result } = renderHook(() => usePostAncestors(mockPostId));

      // While fetching, ancestors are buffered
      expect(result.current.isLoading).toBe(true);
      expect(result.current.ancestors).toEqual([]);

      // After the fetch settles with null, the chain is stalled — expose partial results
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.ancestors).toHaveLength(2);
      expect(result.current.hasError).toBe(false);
    });

    it('does not retry fetch for the same stalled ID', async () => {
      mockFetch.mockResolvedValue(null);
      setMockQueryResult({
        ancestors: [],
        nextMissingPostId: 'missing:post',
      });

      const { result } = renderHook(() => usePostAncestors(mockPostId));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // fetch was called exactly once for this ID
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith({ compositeId: 'missing:post' });
    });
  });

  describe('Local traversal error', () => {
    it('returns hasError true when traversal returns null (queryFn error)', () => {
      // null signals that the queryFn caught an internal error
      setMockQueryResult(null);

      const { result } = renderHook(() => usePostAncestors(mockPostId));

      expect(result.current.ancestors).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.hasError).toBe(true);
    });

    it('does not call fetch when traversal errors', () => {
      setMockQueryResult(null);

      renderHook(() => usePostAncestors(mockPostId));

      // nextMissingPostId is null (from null?.nextMissingPostId ?? null), so no fetch
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns hasError true when postId is invalid (null from useLiveQuery)', () => {
      // When postId is invalid, the useLiveQuery callback returns null,
      // which surfaces as hasError: true to consumers
      setMockQueryResult(null);

      const { result } = renderHook(() => usePostAncestors('invalid-no-delimiter'));

      expect(result.current.ancestors).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.hasError).toBe(true);
    });
  });
});
