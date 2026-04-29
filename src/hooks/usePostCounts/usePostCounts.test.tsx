import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePostCounts } from './usePostCounts';

// Mock direct dependencies
const mockGetCounts = vi.fn();
const mockFetch = vi.fn().mockResolvedValue(undefined);
vi.mock('@/controllers/post/post', () => ({
  PostController: {
    getCounts: (params: { compositeId: string }) => mockGetCounts(params),
    fetch: (params: { compositeId: string }) => mockFetch(params),
  },
}));

// Mock dexie-react-hooks (same pattern as usePostDetails.test.tsx)
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (queryFn: () => Promise<unknown>, _deps: unknown[], defaultValue: unknown) => {
    queryFn();
    const result = mockGetCounts.mock.results[mockGetCounts.mock.results.length - 1];
    return result?.value ?? defaultValue;
  },
}));

describe('usePostCounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCounts.mockReturnValue(null);
  });

  describe('Loading state', () => {
    it('returns isLoading true when compositeId is null', () => {
      const { result } = renderHook(() => usePostCounts(null));

      // enabled=false → queryFn not called → useLiveQuery returns undefined (defaultValue)
      expect(result.current.isLoading).toBe(true);
      expect(result.current.postCounts).toBeUndefined();
    });

    it('returns isLoading true when compositeId is undefined', () => {
      const { result } = renderHook(() => usePostCounts(undefined));

      expect(result.current.isLoading).toBe(true);
      expect(result.current.postCounts).toBeUndefined();
    });

    it('returns isLoading true when counts not found in cache (null from DB)', () => {
      // DB returns null (cache miss) → useLocalFirstQuery triggers fetchFn
      mockGetCounts.mockReturnValue(null);

      const { result } = renderHook(() => usePostCounts('user-123:post-456'));

      expect(result.current.isLoading).toBe(true);
    });

    it('returns isLoading false when counts exist', () => {
      const mockCounts = {
        id: 'user-123:post-456',
        replies: 10,
        reposts: 3,
        bookmarks: 5,
      };
      mockGetCounts.mockReturnValue(mockCounts);

      const { result } = renderHook(() => usePostCounts('user-123:post-456'));

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('Post counts data', () => {
    it('returns post counts when compositeId is valid', () => {
      const mockCounts = {
        id: 'user-123:post-456',
        replies: 10,
        reposts: 3,
        bookmarks: 5,
      };
      mockGetCounts.mockReturnValue(mockCounts);

      const { result } = renderHook(() => usePostCounts('user-123:post-456'));

      expect(result.current.postCounts).toEqual(mockCounts);
      expect(result.current.isLoading).toBe(false);
    });

    it('handles zero counts', () => {
      const mockCounts = {
        id: 'user-123:post-456',
        replies: 0,
        reposts: 0,
        bookmarks: 0,
      };
      mockGetCounts.mockReturnValue(mockCounts);

      const { result } = renderHook(() => usePostCounts('user-123:post-456'));

      expect(result.current.postCounts).toEqual(mockCounts);
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('Controller integration', () => {
    it('calls PostController.getCounts with correct compositeId', () => {
      mockGetCounts.mockReturnValue({ id: 'user-123:post-456', replies: 0, reposts: 0, bookmarks: 0 });

      renderHook(() => usePostCounts('user-123:post-456'));

      expect(mockGetCounts).toHaveBeenCalledWith({ compositeId: 'user-123:post-456' });
    });

    it('does not call PostController.fetch when data is cached (cache hit optimization)', () => {
      mockGetCounts.mockReturnValue({ id: 'user-123:post-456', replies: 0, reposts: 0, bookmarks: 0 });

      renderHook(() => usePostCounts('user-123:post-456'));

      // Phase 1 optimization: fetchFn is skipped when data is non-null (cache hit)
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does not call getCounts when compositeId is null', () => {
      renderHook(() => usePostCounts(null));

      // enabled=false → queryFn not called
      expect(mockGetCounts).not.toHaveBeenCalled();
    });

    it('does not call getCounts when compositeId is undefined', () => {
      renderHook(() => usePostCounts(undefined));

      // enabled=false → queryFn not called
      expect(mockGetCounts).not.toHaveBeenCalled();
    });

    it('does not call fetch when compositeId is null', () => {
      renderHook(() => usePostCounts(null));

      // enabled=false → fetchFn not called
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
