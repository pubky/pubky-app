import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import type { PostStreamId } from '@/models/stream/post/postStream.types';
import { useUnreadPosts } from './useUnreadPosts';

// Hoist mock data
const { mockUnreadStream, setMockUnreadStream } = vi.hoisted(() => {
  const stream = { current: null as { stream: string[] } | null };
  return {
    mockUnreadStream: stream,
    setMockUnreadStream: (value: { stream: string[] } | null) => {
      stream.current = value;
    },
  };
});

// Mock dexie-react-hooks
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn((queryFn: () => Promise<{ stream: string[] } | null>) => {
    // Execute the query function to trigger it
    queryFn();
    // Return the resolved value directly (not a Promise)
    return mockUnreadStream.current;
  }),
}));

// Mock dependencies
vi.mock('@/controllers/stream/posts/posts', () => ({
  StreamPostsController: {
    getUnreadStream: vi.fn(() => Promise.resolve(mockUnreadStream.current)),
    filterStreamPosts: vi.fn(({ postIds }: { postIds: string[] }) => Promise.resolve(postIds)),
  },
}));

describe('useUnreadPosts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMockUnreadStream(null);
    vi.mocked(StreamPostsController.filterStreamPosts).mockImplementation(({ postIds }) => Promise.resolve(postIds));
  });

  it('should return empty arrays when streamId is null', () => {
    const { result } = renderHook(() => useUnreadPosts({ streamId: null }));

    expect(result.current.unreadPostIds).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  it('should return empty arrays when no unread stream exists', () => {
    setMockUnreadStream(null);

    const { result } = renderHook(() => useUnreadPosts({ streamId: 'timeline:all:all' as PostStreamId }));

    expect(result.current.unreadPostIds).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  it('should return unread post IDs when stream exists', () => {
    const mockPostIds = ['post-1', 'post-2', 'post-3'];
    setMockUnreadStream({ stream: mockPostIds });

    const { result } = renderHook(() => useUnreadPosts({ streamId: 'timeline:all:all' as PostStreamId }));

    expect(result.current.unreadPostIds).toEqual(mockPostIds);
    expect(result.current.unreadCount).toBe(3);
  });

  it('filters unread post IDs through the stream filter', async () => {
    const mockPostIds = ['post-1', 'collection-1'];
    const streamId = 'timeline:all:all' as PostStreamId;
    setMockUnreadStream({ stream: mockPostIds });

    renderHook(() => useUnreadPosts({ streamId }));

    await waitFor(() => {
      expect(StreamPostsController.filterStreamPosts).toHaveBeenCalledWith({ streamId, postIds: mockPostIds });
    });
  });

  it('should return correct count for single post', () => {
    setMockUnreadStream({ stream: ['post-1'] });

    const { result } = renderHook(() => useUnreadPosts({ streamId: 'timeline:all:all' as PostStreamId }));

    expect(result.current.unreadCount).toBe(1);
  });

  it('should return correct count for many posts', () => {
    const manyPosts = Array.from({ length: 100 }, (_, i) => `post-${i}`);
    setMockUnreadStream({ stream: manyPosts });

    const { result } = renderHook(() => useUnreadPosts({ streamId: 'timeline:all:all' as PostStreamId }));

    expect(result.current.unreadCount).toBe(100);
  });

  it('should handle empty stream array', () => {
    setMockUnreadStream({ stream: [] });

    const { result } = renderHook(() => useUnreadPosts({ streamId: 'timeline:all:all' as PostStreamId }));

    expect(result.current.unreadPostIds).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  it('should handle streamId change and update results', () => {
    setMockUnreadStream({ stream: ['post-1', 'post-2'] });

    const { result, rerender } = renderHook(
      ({ streamId }: { streamId: PostStreamId | null }) => useUnreadPosts({ streamId }),
      {
        initialProps: { streamId: 'timeline:all:all' as PostStreamId },
      },
    );

    expect(result.current.unreadPostIds).toEqual(['post-1', 'post-2']);
    expect(result.current.unreadCount).toBe(2);

    // Change streamId to a different stream
    setMockUnreadStream({ stream: ['post-3'] });
    rerender({ streamId: 'timeline:following:all' as PostStreamId });

    expect(result.current.unreadPostIds).toEqual(['post-3']);
    expect(result.current.unreadCount).toBe(1);
  });

  it('should handle streamId changing to null', () => {
    setMockUnreadStream({ stream: ['post-1', 'post-2'] });

    type HookProps = { streamId: PostStreamId | null };
    const { result, rerender } = renderHook((props: HookProps) => useUnreadPosts(props), {
      initialProps: { streamId: 'timeline:all:all' as PostStreamId } as HookProps,
    });

    expect(result.current.unreadPostIds).toEqual(['post-1', 'post-2']);

    // Change streamId to null
    setMockUnreadStream(null);
    rerender({ streamId: null });

    expect(result.current.unreadPostIds).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  it('should handle streamId changing from null to valid stream', () => {
    setMockUnreadStream(null);

    const { result, rerender } = renderHook(
      ({ streamId }: { streamId: PostStreamId | null }) => useUnreadPosts({ streamId }),
      {
        initialProps: { streamId: null as PostStreamId | null },
      },
    );

    expect(result.current.unreadPostIds).toEqual([]);
    expect(result.current.unreadCount).toBe(0);

    // Change streamId to valid stream
    setMockUnreadStream({ stream: ['post-1'] });
    rerender({ streamId: 'timeline:all:all' as PostStreamId });

    expect(result.current.unreadPostIds).toEqual(['post-1']);
    expect(result.current.unreadCount).toBe(1);
  });

  it('should handle very large stream arrays', () => {
    const largeStream = Array.from({ length: 10000 }, (_, i) => `post-${i}`);
    setMockUnreadStream({ stream: largeStream });

    const { result } = renderHook(() => useUnreadPosts({ streamId: 'timeline:all:all' as PostStreamId }));

    expect(result.current.unreadPostIds).toHaveLength(10000);
    expect(result.current.unreadCount).toBe(10000);
    expect(result.current.unreadPostIds[0]).toBe('post-0');
    expect(result.current.unreadPostIds[9999]).toBe('post-9999');
  });

  it('should handle stream with duplicate post IDs', () => {
    // Note: This tests the hook's behavior, not the data model
    // In practice, streams shouldn't have duplicates, but the hook should handle it gracefully
    setMockUnreadStream({ stream: ['post-1', 'post-1', 'post-2'] });

    const { result } = renderHook(() => useUnreadPosts({ streamId: 'timeline:all:all' as PostStreamId }));

    expect(result.current.unreadPostIds).toEqual(['post-1', 'post-1', 'post-2']);
    expect(result.current.unreadCount).toBe(3);
  });
});
