import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStreamPagination } from './useStreamPagination';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import type { PostStreamId } from '@/models/stream/post/postStream.types';
import { sortPostIdsByTimestamp } from '@/utils/sorting';
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
      timestamp: Date.now(),
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
        timestamp: Date.now(),
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
        timestamp: Date.now(),
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
        timestamp: Date.now(),
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
        timestamp: Date.now(),
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
        timestamp: undefined, // Engagement streams don't use timestamp
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
        timestamp: Date.now(),
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
        timestamp: Date.now(),
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
        timestamp: Date.now(),
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
  });
});
