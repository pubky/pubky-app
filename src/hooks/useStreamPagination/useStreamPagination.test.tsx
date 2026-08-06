import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import type { PostStreamId } from '@/models/stream/post/postStream.types';
import { sortPostIdsByTimestamp } from '@/utils/sorting';
import { useStreamPagination } from './useStreamPagination';

// Mock dependencies
vi.mock('@/controllers/stream/posts/posts', () => ({
  StreamPostsController: {
    getCachedLastPostTimestamp: vi.fn(),
    getOrFetchStreamSlice: vi.fn(),
    prepareStreamForInitialLoad: vi.fn(),
  },
}));
vi.mock('@/models/post/details/postDetails', () => ({
  PostDetailsModel: {
    findByIdsPreserveOrder: vi.fn(),
  },
}));
vi.mock('@/utils/sorting', () => ({
  sortPostIdsByTimestamp: vi.fn(),
}));

describe('useStreamPagination', () => {
  const mockStreamId = 'timeline:all:all' as PostStreamId;
  const mockPostIds = ['post1', 'post2', 'post3'];

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(StreamPostsController.prepareStreamForInitialLoad).mockResolvedValue(undefined);
    vi.mocked(StreamPostsController.getCachedLastPostTimestamp).mockResolvedValue(0);
    vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
      nextPageIds: mockPostIds,
      nextCursor: Date.now(),
    });
    // Mock PostDetailsModel to return posts with timestamps that preserve input order
    // (newer posts first = higher timestamps)
    vi.mocked(PostDetailsModel.findByIdsPreserveOrder).mockImplementation(async (ids) => {
      const now = Date.now();
      return ids.map((id, index) => ({
        id,
        indexed_at: now - index * 1000, // Each post 1 second older than previous
      }));
    });
    // Mock sortPostIdsByTimestamp to preserve input order by default
    // (simulates already-sorted posts)
    vi.mocked(sortPostIdsByTimestamp).mockImplementation(async (ids: string[]) => ids);
  });

  describe('Cursor advances on empty-after-filter pages', () => {
    it('advances streamTail from nextCursor on an empty page so the next loadMore resumes past it', async () => {
      const streamId = 'timeline:all:all' as PostStreamId;
      vi.mocked(StreamPostsController.getCachedLastPostTimestamp).mockResolvedValue(0);
      // Initial load: a full page, cursor 20.
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValueOnce({
        nextPageIds: ['p1', 'p2'],
        nextCursor: 20,
      });
      const { result } = renderHook(() => useStreamPagination({ streamId }));
      await waitFor(() => expect(result.current.loading).toBe(false));

      // loadMore #1: a fully-filtered (empty) page that isn't the end; cursor advances to 40.
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockClear();
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValueOnce({
        nextPageIds: [],
        reachedEnd: false,
        nextCursor: 40,
      });
      await act(async () => {
        await result.current.loadMore();
      });
      expect(result.current.hasMore).toBe(true); // empty-but-not-ended keeps loading

      // loadMore #2 must resume from the advanced cursor (40), not the stale 20.
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockClear();
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValueOnce({
        nextPageIds: ['p3'],
        nextCursor: 41,
      });
      await act(async () => {
        await result.current.loadMore();
      });
      expect(StreamPostsController.getOrFetchStreamSlice).toHaveBeenCalledWith(
        expect.objectContaining({ streamId, streamTail: 40 }),
      );
    });
  });

  describe('Initialization', () => {
    it('should initialize with loading state', () => {
      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
        }),
      );

      expect(result.current.loading).toBe(true);
      expect(result.current.loadingMore).toBe(false);
      expect(result.current.postIds).toEqual([]);
      expect(result.current.error).toBeNull();
      expect(result.current.hasMore).toBe(true);
    });

    it('should accept custom limit parameter', async () => {
      const customLimit = 50;
      renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
          limit: customLimit,
        }),
      );

      await waitFor(() => {
        expect(StreamPostsController.getOrFetchStreamSlice).toHaveBeenCalledWith(
          expect.objectContaining({
            limit: customLimit,
          }),
        );
      });
    });

    it('should accept resetOnStreamChange parameter', () => {
      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
          resetOnStreamChange: false,
        }),
      );

      expect(result.current).toBeDefined();
    });
  });

  describe('Initial Load', () => {
    it('should fetch posts on mount', async () => {
      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(StreamPostsController.getCachedLastPostTimestamp).toHaveBeenCalledWith({ streamId: mockStreamId });
      expect(StreamPostsController.getOrFetchStreamSlice).toHaveBeenCalled();
      expect(result.current.postIds).toEqual(mockPostIds);
      expect(result.current.error).toBeNull();
    });

    it('should set hasMore to false when no posts are returned', async () => {
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: [],
        nextCursor: Date.now(),
        reachedEnd: true, // Actual end of stream
      });

      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.postIds).toEqual([]);
      expect(result.current.hasMore).toBe(false);
    });

    it('should keep hasMore true when empty results but not reached end', async () => {
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: [],
        nextCursor: Date.now(),
        reachedEnd: false, // Filters removed all posts, but more exist
      });

      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.postIds).toEqual([]);
      expect(result.current.hasMore).toBe(true);
    });

    it('should set hasMore based on response length vs limit', async () => {
      const limit = 30;
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: Array(25).fill('post'),
        nextCursor: Date.now(),
        reachedEnd: true, // Less than limit (30) means end of stream
      });

      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
          limit,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // reachedEnd: true means no more posts
      expect(result.current.hasMore).toBe(false);
    });

    it('should handle fetch errors gracefully', async () => {
      const errorMessage = 'Network error';
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('An unknown error occurred.');
      expect(result.current.hasMore).toBe(false);
      expect(result.current.postIds).toEqual([]);
    });
  });

  describe('Pagination', () => {
    it('should have loadMore function available', async () => {
      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.loadMore).toBeDefined();
      expect(typeof result.current.loadMore).toBe('function');
    });

    it('should not load more when hasMore is false', async () => {
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: ['post1', 'post2'],
        nextCursor: Date.now(),
        reachedEnd: true, // Less than limit (10) means end of stream
      });

      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
          limit: 10,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // reachedEnd: true means no more posts
      expect(result.current.hasMore).toBe(false);

      const callCountBefore = vi.mocked(StreamPostsController.getOrFetchStreamSlice).mock.calls.length;

      await act(async () => {
        await result.current.loadMore();
      });

      const callCountAfter = vi.mocked(StreamPostsController.getOrFetchStreamSlice).mock.calls.length;

      // Should not make additional calls
      expect(callCountAfter).toBe(callCountBefore);
    });
  });

  describe('Refresh', () => {
    it('should clear state and reload when refresh is called', async () => {
      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
        }),
      );

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.postIds.length).toBeGreaterThan(0);

      // Refresh
      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should have called getCachedLastPostTimestamp again
      expect(StreamPostsController.getCachedLastPostTimestamp).toHaveBeenCalledTimes(2);
    });
  });

  describe('Stream Change', () => {
    it('should reset state when streamId changes with resetOnStreamChange=true', async () => {
      const firstStreamId = 'timeline:all:all' as PostStreamId;
      const secondStreamId = 'timeline:following:all' as PostStreamId;

      const { result, rerender } = renderHook(
        ({ streamId }) =>
          useStreamPagination({
            streamId,
            resetOnStreamChange: true,
          }),
        {
          initialProps: { streamId: firstStreamId },
        },
      );

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Change stream
      rerender({ streamId: secondStreamId });

      // Should be loading again
      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should have fetched for the new stream
      expect(StreamPostsController.getOrFetchStreamSlice).toHaveBeenCalledWith(
        expect.objectContaining({
          streamId: secondStreamId,
        }),
      );
    });

    it('should not reset state when streamId changes with resetOnStreamChange=false', async () => {
      const firstStreamId = 'timeline:all:all' as PostStreamId;
      const secondStreamId = 'timeline:following:all' as PostStreamId;

      const { result, rerender } = renderHook(
        ({ streamId }) =>
          useStreamPagination({
            streamId,
            resetOnStreamChange: false,
          }),
        {
          initialProps: { streamId: firstStreamId },
        },
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const callCountBefore = vi.mocked(StreamPostsController.getOrFetchStreamSlice).mock.calls.length;

      // Change stream
      rerender({ streamId: secondStreamId });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const callCountAfter = vi.mocked(StreamPostsController.getOrFetchStreamSlice).mock.calls.length;

      // Should still fetch for new stream
      expect(callCountAfter).toBeGreaterThan(callCountBefore);
    });
  });

  describe('Engagement Stream Handling', () => {
    it('should handle engagement streams', async () => {
      const engagementStreamId = 'engagement:all:all' as PostStreamId;

      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: ['post1', 'post2', 'post3'],
        nextCursor: undefined, // Engagement streams don't use timestamp
      });

      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: engagementStreamId,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.postIds).toEqual(['post1', 'post2', 'post3']);
      expect(StreamPostsController.getOrFetchStreamSlice).toHaveBeenCalledWith(
        expect.objectContaining({
          streamId: engagementStreamId,
        }),
      );
    });
  });

  describe('Skip-paginated streams (collection items)', () => {
    // collection:<author>:<postId> pages by offset (`skip`); Nexus returns no timestamp/score
    // cursor, so the resume cursor is a raw offset advanced by the controller and threaded
    // back via `nextCursor`. Regression guard for the infinite-scroll flicker where a stuck
    // cursor re-served page 1 forever, and for deriving the offset from the visible count.
    const collectionStreamId = 'collection:author-1:post-1' as PostStreamId;

    it('starts the initial load at offset 0, ignoring any cached timestamp cursor', async () => {
      vi.mocked(StreamPostsController.getCachedLastPostTimestamp).mockResolvedValue(9999);
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: ['c1', 'c2', 'c3'],
        nextCursor: 3,
      });

      const { result } = renderHook(() => useStreamPagination({ streamId: collectionStreamId }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(StreamPostsController.getOrFetchStreamSlice).toHaveBeenCalledWith(
        expect.objectContaining({
          streamId: collectionStreamId,
          streamTail: 0,
          lastPostId: undefined,
        }),
      );
    });

    it('paginates by the offset cursor returned from the previous page on loadMore', async () => {
      vi.mocked(StreamPostsController.getCachedLastPostTimestamp).mockResolvedValue(0);
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: ['c1', 'c2', 'c3'],
        nextCursor: 3,
      });

      const { result } = renderHook(() => useStreamPagination({ streamId: collectionStreamId }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
      expect(result.current.postIds).toEqual(['c1', 'c2', 'c3']);

      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockClear();
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: ['c4', 'c5'],
        nextCursor: 5,
      });

      await act(async () => {
        await result.current.loadMore();
      });

      expect(StreamPostsController.getOrFetchStreamSlice).toHaveBeenCalledWith(
        expect.objectContaining({
          streamId: collectionStreamId,
          streamTail: 3, // resume offset threaded from the previous page
        }),
      );
    });

    it('does not count optimistic membership posts in collection offset pagination', async () => {
      vi.mocked(StreamPostsController.getCachedLastPostTimestamp).mockResolvedValue(0);
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: ['c1', 'c2', 'c3'],
        nextCursor: 3,
      });

      const { result } = renderHook(() => useStreamPagination({ streamId: collectionStreamId }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.prependOptimisticPosts('optimistic-c0');
      });

      expect(result.current.postIds).toEqual(['optimistic-c0', 'c1', 'c2', 'c3']);

      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockClear();
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: ['c4', 'c5'],
        nextCursor: 5,
      });

      await act(async () => {
        await result.current.loadMore();
      });

      expect(StreamPostsController.getOrFetchStreamSlice).toHaveBeenCalledWith(
        expect.objectContaining({
          streamId: collectionStreamId,
          streamTail: 3,
        }),
      );
      expect(result.current.postIds).toEqual(['optimistic-c0', 'c1', 'c2', 'c3', 'c4', 'c5']);
    });

    it('counts optimistically hidden rows that were already consumed in the collection offset', async () => {
      vi.mocked(StreamPostsController.getCachedLastPostTimestamp).mockResolvedValue(0);
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: ['c1', 'c2', 'c3'],
        nextCursor: 3,
      });
      const { result } = renderHook(() => useStreamPagination({ streamId: collectionStreamId }));

      await waitFor(() => {
        expect(result.current.postIds).toEqual(['c1', 'c2', 'c3']);
      });
      act(() => {
        result.current.removePostsOptimistically('c2');
      });

      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockClear();
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: ['c4', 'c5'],
        nextCursor: 5,
      });
      await act(async () => {
        await result.current.loadMore();
      });

      expect(StreamPostsController.getOrFetchStreamSlice).toHaveBeenCalledWith(
        expect.objectContaining({
          streamId: collectionStreamId,
          streamTail: 3,
        }),
      );
      expect(result.current.postIds).toEqual(['c1', 'c3', 'c4', 'c5']);
    });

    it('preserves optimistic membership posts across collection refresh without changing the next offset', async () => {
      vi.mocked(StreamPostsController.getCachedLastPostTimestamp).mockResolvedValue(0);
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: ['c1', 'c2'],
        nextCursor: 2,
      });

      const { result } = renderHook(() => useStreamPagination({ streamId: collectionStreamId }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.prependOptimisticPosts('optimistic-c0');
      });

      expect(result.current.postIds).toEqual(['optimistic-c0', 'c1', 'c2']);

      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockClear();
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: ['c1', 'c2'],
        nextCursor: 2,
      });

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.postIds).toEqual(['optimistic-c0', 'c1', 'c2']);
      expect(StreamPostsController.getOrFetchStreamSlice).toHaveBeenCalledWith(
        expect.objectContaining({
          streamId: collectionStreamId,
          streamTail: 0,
          lastPostId: undefined,
        }),
      );

      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockClear();
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: ['c3'],
        nextCursor: 3,
      });

      await act(async () => {
        await result.current.loadMore();
      });

      expect(StreamPostsController.getOrFetchStreamSlice).toHaveBeenCalledWith(
        expect.objectContaining({
          streamId: collectionStreamId,
          streamTail: 2,
        }),
      );
      expect(result.current.postIds).toEqual(['optimistic-c0', 'c1', 'c2', 'c3']);
    });
  });

  describe('Stream Preparation on Initial Load', () => {
    it('should call prepareStreamForInitialLoad on initial load', async () => {
      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(StreamPostsController.prepareStreamForInitialLoad).toHaveBeenCalledWith({
        streamId: mockStreamId,
      });
    });

    it('should continue to fetch posts after stream preparation', async () => {
      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Stream preparation should have been called
      expect(StreamPostsController.prepareStreamForInitialLoad).toHaveBeenCalled();

      // Posts should still be fetched
      expect(StreamPostsController.getOrFetchStreamSlice).toHaveBeenCalled();
      expect(result.current.postIds).toEqual(mockPostIds);
    });

    it('should not call prepareStreamForInitialLoad on loadMore', async () => {
      const limit = 30;
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: Array(limit).fill('post'),
        nextCursor: Date.now(),
      });

      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
          limit,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Clear the mock calls from initial load
      vi.mocked(StreamPostsController.prepareStreamForInitialLoad).mockClear();

      // Load more
      await act(async () => {
        await result.current.loadMore();
      });

      // prepareStreamForInitialLoad should NOT be called on loadMore
      expect(StreamPostsController.prepareStreamForInitialLoad).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty results with reachedEnd true', async () => {
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: [],
        nextCursor: Date.now(),
        reachedEnd: true,
      });

      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.postIds).toEqual([]);
      expect(result.current.hasMore).toBe(false);
    });

    it('should handle empty results with reachedEnd false', async () => {
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: [],
        nextCursor: Date.now(),
        reachedEnd: false,
      });

      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.postIds).toEqual([]);
      expect(result.current.hasMore).toBe(true);
    });

    it('should expose refresh function', async () => {
      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.refresh).toBeDefined();
      expect(typeof result.current.refresh).toBe('function');
    });
  });

  describe('onError option', () => {
    it('invokes onError with the thrown value when initial fetch fails', async () => {
      const failure = new Error('network down');
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockRejectedValueOnce(failure);
      const onError = vi.fn();

      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
          onError,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(failure);
      // Internal state still reflects the failure.
      expect(result.current.error).toBeTruthy();
      expect(result.current.hasMore).toBe(false);
    });

    it('invokes onError on loadMore failures too', async () => {
      // First (initial) call succeeds, second (loadMore) call throws.
      vi.mocked(StreamPostsController.getOrFetchStreamSlice)
        .mockResolvedValueOnce({ nextPageIds: mockPostIds, nextCursor: Date.now() })
        .mockRejectedValueOnce(new Error('boom'));
      const onError = vi.fn();

      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
          onError,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
      expect(onError).not.toHaveBeenCalled();

      await act(async () => {
        await result.current.loadMore();
      });

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    });

    it('is not invoked on success', async () => {
      const onError = vi.fn();
      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
          onError,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('prependPosts', () => {
    it('should add single post to the beginning of the list', async () => {
      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const initialPostIds = result.current.postIds;
      const newPostId = 'new-post-1';

      await act(async () => {
        await result.current.prependPosts(newPostId);
      });

      expect(result.current.postIds[0]).toBe(newPostId);
      expect(result.current.postIds.length).toBe(initialPostIds.length + 1);
      expect(result.current.postIds.slice(1)).toEqual(initialPostIds);
    });

    it('should add multiple posts to the beginning of the list', async () => {
      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const initialPostIds = result.current.postIds;
      const newPostIds = ['new-post-1', 'new-post-2', 'new-post-3'];

      await act(async () => {
        await result.current.prependPosts(newPostIds);
      });

      expect(result.current.postIds.slice(0, 3)).toEqual(newPostIds);
      expect(result.current.postIds.length).toBe(initialPostIds.length + 3);
      expect(result.current.postIds.slice(3)).toEqual(initialPostIds);
    });

    it('should not add duplicate posts', async () => {
      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const initialPostIds = result.current.postIds;
      const duplicatePostId = initialPostIds[0];

      await act(async () => {
        await result.current.prependPosts(duplicatePostId);
      });

      // Should not have added duplicate
      expect(result.current.postIds.length).toBe(initialPostIds.length);
      expect(result.current.postIds[0]).toBe(duplicatePostId);
    });

    it('should handle empty array', async () => {
      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const initialPostIds = result.current.postIds;

      await act(async () => {
        await result.current.prependPosts([]);
      });

      expect(result.current.postIds).toEqual(initialPostIds);
    });

    it('should sort prepended posts by timestamp', async () => {
      // Mock sortPostIdsByTimestamp to return posts sorted by timestamp
      vi.mocked(sortPostIdsByTimestamp).mockImplementation(async (ids: string[]) => {
        const timestampMap: Record<string, number> = {
          'old-post': 1000, // oldest
          'new-post': 3000, // newest
          'middle-post': 2000, // middle
          post1: 500,
          post2: 400,
          post3: 300,
        };
        return [...ids].sort((a, b) => (timestampMap[b] || 0) - (timestampMap[a] || 0));
      });

      const { result } = renderHook(() => useStreamPagination({ streamId: mockStreamId }));
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Prepend in wrong order
      await act(async () => {
        await result.current.prependPosts(['old-post', 'new-post', 'middle-post']);
      });

      // Should be sorted: newest first
      expect(result.current.postIds[0]).toBe('new-post');
      expect(result.current.postIds[1]).toBe('middle-post');
      expect(result.current.postIds[2]).toBe('old-post');
    });

    it('should fallback to unsorted when sorting fails', async () => {
      // Mock sortPostIdsByTimestamp to throw an error
      vi.mocked(sortPostIdsByTimestamp).mockRejectedValue(new Error('IndexedDB error'));

      const { result } = renderHook(() => useStreamPagination({ streamId: mockStreamId }));
      await waitFor(() => expect(result.current.loading).toBe(false));

      const initialPostIds = result.current.postIds;
      const newPostIds = ['new-post-1', 'new-post-2'];

      await act(async () => {
        await result.current.prependPosts(newPostIds);
      });

      // Should fallback: new posts prepended without sorting
      expect(result.current.postIds.length).toBe(initialPostIds.length + 2);
      expect(result.current.postIds[0]).toBe('new-post-1');
      expect(result.current.postIds[1]).toBe('new-post-2');
    });
  });

  describe('prependOptimisticPosts', () => {
    it('adds membership posts to the top without timestamp sorting', async () => {
      vi.mocked(sortPostIdsByTimestamp).mockImplementation(async (ids: string[]) => {
        const timestampMap: Record<string, number> = {
          'old-membership-post': 100,
          post1: 3000,
          post2: 2000,
          post3: 1000,
        };
        return [...ids].sort((a, b) => (timestampMap[b] || 0) - (timestampMap[a] || 0));
      });

      const { result } = renderHook(() => useStreamPagination({ streamId: mockStreamId }));
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => {
        result.current.prependOptimisticPosts('old-membership-post');
      });

      expect(result.current.postIds).toEqual(['old-membership-post', 'post1', 'post2', 'post3']);
      expect(sortPostIdsByTimestamp).not.toHaveBeenCalledWith(
        expect.arrayContaining(['old-membership-post', 'post1', 'post2', 'post3']),
      );
    });

    it('dedupes optimistic posts against displayed posts', async () => {
      const { result } = renderHook(() => useStreamPagination({ streamId: mockStreamId }));
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => {
        result.current.prependOptimisticPosts(['optimistic-a', 'post1', 'optimistic-a']);
      });

      expect(result.current.postIds).toEqual(['optimistic-a', 'post1', 'post2', 'post3']);
    });
  });

  describe('removePosts', () => {
    it('should remove single post from the list', async () => {
      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const initialPostIds = result.current.postIds;
      const postToRemove = initialPostIds[1];

      act(() => {
        result.current.removePosts(postToRemove);
      });

      expect(result.current.postIds).not.toContain(postToRemove);
      expect(result.current.postIds.length).toBe(initialPostIds.length - 1);
    });

    it('should remove multiple posts from the list', async () => {
      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const initialPostIds = result.current.postIds;
      const postsToRemove = [initialPostIds[0], initialPostIds[2]];

      act(() => {
        result.current.removePosts(postsToRemove);
      });

      expect(result.current.postIds).not.toContain(postsToRemove[0]);
      expect(result.current.postIds).not.toContain(postsToRemove[1]);
      expect(result.current.postIds.length).toBe(initialPostIds.length - 2);
    });

    it('should handle removing non-existent post', async () => {
      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const initialPostIds = result.current.postIds;
      const nonExistentPost = 'non-existent-post';

      act(() => {
        result.current.removePosts(nonExistentPost);
      });

      expect(result.current.postIds).toEqual(initialPostIds);
    });

    it('should handle empty array', async () => {
      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const initialPostIds = result.current.postIds;

      act(() => {
        result.current.removePosts([]);
      });

      expect(result.current.postIds).toEqual(initialPostIds);
    });

    it('should maintain order after removal', async () => {
      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const initialPostIds = result.current.postIds;
      const postToRemove = initialPostIds[1];
      const expectedOrder = initialPostIds.filter((id) => id !== postToRemove);

      act(() => {
        result.current.removePosts(postToRemove);
      });

      expect(result.current.postIds).toEqual(expectedOrder);
    });

    it('should restore a removed post to its original position', async () => {
      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const initialPostIds = result.current.postIds;
      const postToRemove = initialPostIds[1];
      let rollback: (() => void) | undefined;

      act(() => {
        rollback = result.current.removePostsOptimistically(postToRemove).rollback;
      });
      act(() => rollback?.());

      expect(result.current.postIds).toEqual(initialPostIds);

      act(() => rollback?.());
      expect(result.current.postIds).toEqual(initialPostIds);
    });

    it('should preserve concurrent optimistic inserts when restoring a removed post', async () => {
      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const initialPostIds = result.current.postIds;
      const postToRemove = initialPostIds[1];
      let rollback: (() => void) | undefined;

      act(() => {
        rollback = result.current.removePostsOptimistically(postToRemove).rollback;
        result.current.prependOptimisticPosts('new-optimistic-post');
      });
      act(() => rollback?.());

      expect(result.current.postIds).toEqual(['new-optimistic-post', ...initialPostIds]);
    });

    it('should restore an optimistically inserted post', async () => {
      const { result } = renderHook(() => useStreamPagination({ streamId: mockStreamId }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
      act(() => {
        result.current.prependOptimisticPosts('optimistic-post');
      });

      let rollback: (() => void) | undefined;
      act(() => {
        rollback = result.current.removePostsOptimistically('optimistic-post').rollback;
      });
      expect(result.current.postIds).not.toContain('optimistic-post');

      act(() => rollback?.());
      expect(result.current.postIds).toEqual(['optimistic-post', ...mockPostIds]);
    });

    it('should keep an optimistic removal hidden across refresh', async () => {
      const { result } = renderHook(() => useStreamPagination({ streamId: mockStreamId }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let rollback: (() => void) | undefined;
      act(() => {
        rollback = result.current.removePostsOptimistically(mockPostIds[1]).rollback;
      });
      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.postIds).toEqual(['post1', 'post3']);

      act(() => rollback?.());
      expect(result.current.postIds).toEqual(mockPostIds);
    });

    it('should preserve order when concurrent removals roll back', async () => {
      const { result } = renderHook(() =>
        useStreamPagination({
          streamId: mockStreamId,
        }),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const initialPostIds = result.current.postIds;
      let rollbackSecond: (() => void) | undefined;
      let rollbackThird: (() => void) | undefined;

      act(() => {
        rollbackSecond = result.current.removePostsOptimistically(initialPostIds[1]).rollback;
        rollbackThird = result.current.removePostsOptimistically(initialPostIds[2]).rollback;
      });
      act(() => rollbackSecond?.());
      act(() => rollbackThird?.());

      expect(result.current.postIds).toEqual(initialPostIds);
    });

    it('should ignore a rollback after the active stream changes', async () => {
      const nextStreamId = 'timeline:following:all' as PostStreamId;
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockImplementation(async ({ streamId }) => ({
        nextPageIds: streamId === mockStreamId ? mockPostIds : ['next-stream-post'],
        nextCursor: Date.now(),
      }));
      const { result, rerender } = renderHook(
        ({ streamId }) =>
          useStreamPagination({
            streamId,
          }),
        { initialProps: { streamId: mockStreamId } },
      );

      await waitFor(() => {
        expect(result.current.postIds).toEqual(mockPostIds);
      });

      let rollback: (() => void) | undefined;
      act(() => {
        rollback = result.current.removePostsOptimistically(mockPostIds[1]).rollback;
      });
      rerender({ streamId: nextStreamId });

      await waitFor(() => {
        expect(result.current.postIds).toEqual(['next-stream-post']);
      });
      act(() => rollback?.());

      expect(result.current.postIds).toEqual(['next-stream-post']);
    });

    it('should keep a removed post hidden after commit and ignore a late rollback', async () => {
      const { result } = renderHook(() => useStreamPagination({ streamId: mockStreamId }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let commit: (() => void) | undefined;
      let rollback: (() => void) | undefined;
      act(() => {
        const removal = result.current.removePostsOptimistically(mockPostIds[1]);
        commit = removal?.commit;
        rollback = removal?.rollback;
      });
      act(() => commit?.());

      expect(result.current.postIds).toEqual(['post1', 'post3']);

      act(() => rollback?.());
      expect(result.current.postIds).toEqual(['post1', 'post3']);
    });

    it('should decrement the collection skip offset when a committed removal shrinks the stream', async () => {
      const collectionStreamId = 'collection:author-1:post-1' as PostStreamId;
      vi.mocked(StreamPostsController.getCachedLastPostTimestamp).mockResolvedValue(0);
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: ['c1', 'c2', 'c3'],
        nextCursor: 3,
      });
      const { result } = renderHook(() => useStreamPagination({ streamId: collectionStreamId }));

      await waitFor(() => {
        expect(result.current.postIds).toEqual(['c1', 'c2', 'c3']);
      });

      let commit: (() => void) | undefined;
      act(() => {
        commit = result.current.removePostsOptimistically('c2').commit;
      });
      act(() => commit?.());

      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockClear();
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: ['c4', 'c5'],
        nextCursor: 4,
      });
      await act(async () => {
        await result.current.loadMore();
      });

      // The committed removal shrank the backend collection by one already
      // consumed row, so the next page resumes one offset earlier — otherwise
      // the row that shifted into the removed slot is skipped after Nexus
      // reindexes the edited collection.
      expect(StreamPostsController.getOrFetchStreamSlice).toHaveBeenCalledWith(
        expect.objectContaining({
          streamId: collectionStreamId,
          streamTail: 2,
        }),
      );
      expect(result.current.postIds).toEqual(['c1', 'c3', 'c4', 'c5']);
    });

    it('should keep the collection skip offset counting rows restored by a rollback', async () => {
      const collectionStreamId = 'collection:author-1:post-1' as PostStreamId;
      vi.mocked(StreamPostsController.getCachedLastPostTimestamp).mockResolvedValue(0);
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: ['c1', 'c2', 'c3'],
        nextCursor: 3,
      });
      const { result } = renderHook(() => useStreamPagination({ streamId: collectionStreamId }));

      await waitFor(() => {
        expect(result.current.postIds).toEqual(['c1', 'c2', 'c3']);
      });

      let rollback: (() => void) | undefined;
      act(() => {
        rollback = result.current.removePostsOptimistically('c2').rollback;
      });
      act(() => rollback?.());

      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockClear();
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: ['c4', 'c5'],
        nextCursor: 5,
      });
      await act(async () => {
        await result.current.loadMore();
      });

      // A rolled-back removal never shrank the backend list, so the consumed
      // offset must stay intact.
      expect(StreamPostsController.getOrFetchStreamSlice).toHaveBeenCalledWith(
        expect.objectContaining({
          streamId: collectionStreamId,
          streamTail: 3,
        }),
      );
      expect(result.current.postIds).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
    });

    it('should not shift the timestamp cursor when a removal commits on a score-paginated stream', async () => {
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: mockPostIds,
        nextCursor: 1111,
      });
      const { result } = renderHook(() => useStreamPagination({ streamId: mockStreamId }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let commit: (() => void) | undefined;
      act(() => {
        commit = result.current.removePostsOptimistically(mockPostIds[1]).commit;
      });
      act(() => commit?.());

      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockClear();
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: ['post4'],
        nextCursor: 999,
      });
      await act(async () => {
        await result.current.loadMore();
      });

      // Timestamp cursors are positions, not row counts — removing a row must
      // not rewind them.
      expect(StreamPostsController.getOrFetchStreamSlice).toHaveBeenCalledWith(
        expect.objectContaining({
          streamId: mockStreamId,
          streamTail: 1111,
        }),
      );
    });

    it('should re-apply a commit landing mid-fetch to the skip offset the fetch writes back', async () => {
      const collectionStreamId = 'collection:author-1:post-1' as PostStreamId;
      vi.mocked(StreamPostsController.getCachedLastPostTimestamp).mockResolvedValue(0);
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: ['c1', 'c2', 'c3'],
        nextCursor: 3,
      });
      const { result } = renderHook(() => useStreamPagination({ streamId: collectionStreamId }));

      await waitFor(() => {
        expect(result.current.postIds).toEqual(['c1', 'c2', 'c3']);
      });

      let resolveSlice: ((value: { nextPageIds: string[]; nextCursor: number }) => void) | undefined;
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockReturnValue(
        new Promise((resolve) => {
          resolveSlice = resolve;
        }),
      );
      let loadMorePromise: Promise<void> | undefined;
      act(() => {
        loadMorePromise = result.current.loadMore();
      });

      let commit: (() => void) | undefined;
      act(() => {
        commit = result.current.removePostsOptimistically('c2').commit;
      });
      act(() => commit?.());

      await act(async () => {
        resolveSlice?.({ nextPageIds: ['c4', 'c5'], nextCursor: 5 });
        await loadMorePromise;
      });

      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockClear();
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: ['c6'],
        nextCursor: 5,
      });
      await act(async () => {
        await result.current.loadMore();
      });

      // The in-flight page derived nextCursor 5 from the offset captured
      // before the commit, so its absolute write must re-apply the commit's
      // decrement instead of silently discarding it.
      expect(StreamPostsController.getOrFetchStreamSlice).toHaveBeenCalledWith(
        expect.objectContaining({
          streamId: collectionStreamId,
          streamTail: 4,
        }),
      );
      expect(result.current.postIds).toEqual(['c1', 'c3', 'c4', 'c5', 'c6']);
    });

    it('should not double-apply a commit that settled before the next fetch started', async () => {
      const collectionStreamId = 'collection:author-1:post-1' as PostStreamId;
      vi.mocked(StreamPostsController.getCachedLastPostTimestamp).mockResolvedValue(0);
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: ['c1', 'c2', 'c3'],
        nextCursor: 3,
      });
      const { result } = renderHook(() => useStreamPagination({ streamId: collectionStreamId }));

      await waitFor(() => {
        expect(result.current.postIds).toEqual(['c1', 'c2', 'c3']);
      });

      let commit: (() => void) | undefined;
      act(() => {
        commit = result.current.removePostsOptimistically('c2').commit;
      });
      act(() => commit?.());

      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockClear();
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: ['c4', 'c5'],
        nextCursor: 4,
      });
      await act(async () => {
        await result.current.loadMore();
      });

      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockClear();
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: ['c6'],
        nextCursor: 5,
      });
      await act(async () => {
        await result.current.loadMore();
      });

      // The commit was already folded into the offset the second fetch sent
      // (streamTail 2 → nextCursor 4); re-subtracting it here would refetch
      // and dedupe-drop a row on every subsequent page.
      expect(StreamPostsController.getOrFetchStreamSlice).toHaveBeenCalledWith(
        expect.objectContaining({
          streamId: collectionStreamId,
          streamTail: 4,
        }),
      );
    });

    it('should keep the timestamp cursor from an in-flight fetch when a removal commits mid-flight', async () => {
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: mockPostIds,
        nextCursor: 1111,
      });
      const { result } = renderHook(() => useStreamPagination({ streamId: mockStreamId }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let resolveSlice: ((value: { nextPageIds: string[]; nextCursor: number }) => void) | undefined;
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockReturnValue(
        new Promise((resolve) => {
          resolveSlice = resolve;
        }),
      );
      let loadMorePromise: Promise<void> | undefined;
      act(() => {
        loadMorePromise = result.current.loadMore();
      });

      let commit: (() => void) | undefined;
      act(() => {
        commit = result.current.removePostsOptimistically(mockPostIds[1]).commit;
      });
      act(() => commit?.());

      await act(async () => {
        resolveSlice?.({ nextPageIds: ['post4'], nextCursor: 2222 });
        await loadMorePromise;
      });

      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockClear();
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockResolvedValue({
        nextPageIds: ['post5'],
        nextCursor: 3333,
      });
      await act(async () => {
        await result.current.loadMore();
      });

      // Score cursors are timestamps, not row counts — a mid-flight commit
      // must not subtract anything from them.
      expect(StreamPostsController.getOrFetchStreamSlice).toHaveBeenCalledWith(
        expect.objectContaining({
          streamId: mockStreamId,
          streamTail: 2222,
        }),
      );
    });

    it('should reveal a committed post again when it is re-added optimistically', async () => {
      const { result } = renderHook(() => useStreamPagination({ streamId: mockStreamId }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let commit: (() => void) | undefined;
      act(() => {
        commit = result.current.removePostsOptimistically(mockPostIds[1]).commit;
      });
      act(() => commit?.());
      expect(result.current.postIds).toEqual(['post1', 'post3']);

      // A stale hidden count left behind by commit would suppress the post
      // forever; re-adding it must show it again.
      act(() => {
        result.current.prependOptimisticPosts(mockPostIds[1]);
      });
      expect(result.current.postIds).toEqual(['post2', 'post1', 'post3']);
    });

    it('should resolve overlapping removals of the same post independently', async () => {
      const { result } = renderHook(() => useStreamPagination({ streamId: mockStreamId }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let rollbackFirst: (() => void) | undefined;
      let commitSecond: (() => void) | undefined;
      act(() => {
        rollbackFirst = result.current.removePostsOptimistically(mockPostIds[1]).rollback;
        commitSecond = result.current.removePostsOptimistically(mockPostIds[1]).commit;
      });

      // One of the two overlapping removals rolling back keeps the post hidden
      // while the other is still pending.
      act(() => rollbackFirst?.());
      expect(result.current.postIds).toEqual(['post1', 'post3']);

      act(() => commitSecond?.());
      expect(result.current.postIds).toEqual(['post1', 'post3']);
    });

    it('should keep a pending removal hidden when an in-flight loadMore resolves', async () => {
      const { result } = renderHook(() => useStreamPagination({ streamId: mockStreamId }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let resolveFetch: ((value: { nextPageIds: string[]; nextCursor: number }) => void) | undefined;
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      );

      let loadMorePromise: Promise<void> | undefined;
      act(() => {
        loadMorePromise = result.current.loadMore();
      });
      act(() => {
        result.current.removePostsOptimistically(mockPostIds[1]);
      });
      expect(result.current.postIds).toEqual(['post1', 'post3']);

      await act(async () => {
        resolveFetch?.({ nextPageIds: ['post4'], nextCursor: 200 });
        await loadMorePromise;
      });

      expect(result.current.postIds).toEqual(['post1', 'post3', 'post4']);
    });

    it('should ignore a commit after the active stream changes', async () => {
      const nextStreamId = 'timeline:following:all' as PostStreamId;
      vi.mocked(StreamPostsController.getOrFetchStreamSlice).mockImplementation(async ({ streamId }) => ({
        nextPageIds: streamId === mockStreamId ? mockPostIds : ['next-stream-post'],
        nextCursor: Date.now(),
      }));
      const { result, rerender } = renderHook(
        ({ streamId }) =>
          useStreamPagination({
            streamId,
          }),
        { initialProps: { streamId: mockStreamId } },
      );

      await waitFor(() => {
        expect(result.current.postIds).toEqual(mockPostIds);
      });

      let commit: (() => void) | undefined;
      act(() => {
        commit = result.current.removePostsOptimistically(mockPostIds[1]).commit;
      });
      rerender({ streamId: nextStreamId });

      await waitFor(() => {
        expect(result.current.postIds).toEqual(['next-stream-post']);
      });
      act(() => commit?.());

      expect(result.current.postIds).toEqual(['next-stream-post']);
    });
  });
});
