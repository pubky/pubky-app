import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveQuery } from 'dexie-react-hooks';
import * as Core from '@/core';
import { usePostCounts } from '@/hooks/usePostCounts';
import { useReplyStream } from './useReplyStream';

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(),
}));

vi.mock('@/hooks/useMutedUsers', () => ({
  useMutedUsers: vi.fn(() => ({
    mutedUserIdSet: new Set(),
  })),
}));

vi.mock('@/hooks/usePostCounts', () => ({
  usePostCounts: vi.fn(),
}));

describe('useReplyStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns reply IDs and muted count from merged live query', () => {
    vi.mocked(usePostCounts).mockReturnValue({
      postCounts: { replies: 5 },
    } as ReturnType<typeof usePostCounts>);

    vi.mocked(useLiveQuery).mockReturnValueOnce({
      replyIds: ['author:reply-1', 'author:reply-2'],
      mutedRepliesCount: 1,
      localTotalCount: 2,
    });

    const { result } = renderHook(() => useReplyStream('author:post-1', { maxReplies: 3 }));

    expect(result.current.replyIds).toEqual(['author:reply-1', 'author:reply-2']);
    expect(result.current.adjustedTotalCount).toBe(4);
    expect(result.current.hasMore).toBe(true);
  });

  it('returns empty state when disabled', () => {
    vi.mocked(usePostCounts).mockReturnValue({
      postCounts: { replies: 0 },
    } as ReturnType<typeof usePostCounts>);

    vi.mocked(useLiveQuery).mockReturnValueOnce({
      replyIds: [],
      mutedRepliesCount: 0,
      localTotalCount: 0,
    });

    const { result } = renderHook(() => useReplyStream('author:post-1', { maxReplies: 3, enabled: false }));

    expect(result.current.replyIds).toEqual([]);
    expect(result.current.hasMore).toBe(false);
  });

  it('expandAll paginates until reachedEnd and sets streamExhausted', async () => {
    vi.mocked(usePostCounts).mockReturnValue({
      postCounts: { replies: 20 },
    } as ReturnType<typeof usePostCounts>);

    vi.mocked(useLiveQuery).mockReturnValue({
      replyIds: ['author:reply-1', 'author:reply-2'],
      mutedRepliesCount: 0,
      localTotalCount: 2,
    });

    vi.spyOn(Core, 'buildPostReplyStreamId').mockReturnValue('stream:author:post-1');
    const getOrFetchSpy = vi
      .spyOn(Core.StreamPostsController, 'getOrFetchStreamSlice')
      .mockResolvedValueOnce({
        nextPageIds: Array.from({ length: 10 }, (_, i) => `author:reply-${i + 3}`),
        timestamp: 11,
        reachedEnd: false,
      })
      .mockResolvedValueOnce({
        nextPageIds: ['author:reply-last'],
        timestamp: 12,
        reachedEnd: true,
      });

    const { result } = renderHook(() => useReplyStream('author:post-1', { maxReplies: 3 }));

    await act(async () => {
      await result.current.expandAll();
    });

    expect(getOrFetchSpy).toHaveBeenCalledTimes(2);
    expect(result.current.showAll).toBe(true);
    expect(result.current.hasMore).toBe(false);
  });

  it('expandAll deduplicates concurrent calls via isFetchingAllRef', async () => {
    vi.mocked(usePostCounts).mockReturnValue({
      postCounts: { replies: 20 },
    } as ReturnType<typeof usePostCounts>);

    // Return enough replies so initial fetch useEffect doesn't fire
    vi.mocked(useLiveQuery).mockReturnValue({
      replyIds: ['author:reply-1', 'author:reply-2', 'author:reply-3'],
      mutedRepliesCount: 0,
      localTotalCount: 3,
    });

    vi.spyOn(Core, 'buildPostReplyStreamId').mockReturnValue('stream:author:post-1');
    const getOrFetchSpy = vi.spyOn(Core.StreamPostsController, 'getOrFetchStreamSlice').mockResolvedValue({
      nextPageIds: ['author:reply-4'],
      timestamp: 1,
      reachedEnd: true,
    });

    const { result } = renderHook(() => useReplyStream('author:post-1', { maxReplies: 3 }));

    // Fire two concurrent expandAll calls
    await act(async () => {
      const p1 = result.current.expandAll();
      const p2 = result.current.expandAll();
      await Promise.all([p1, p2]);
    });

    // Only one should have actually fetched
    expect(getOrFetchSpy).toHaveBeenCalledTimes(1);
  });

  it('expandAll is a no-op when stream is already exhausted', async () => {
    vi.mocked(usePostCounts).mockReturnValue({
      postCounts: { replies: 5 },
    } as ReturnType<typeof usePostCounts>);

    // Return enough replies so initial fetch useEffect doesn't fire
    vi.mocked(useLiveQuery).mockReturnValue({
      replyIds: ['author:reply-1', 'author:reply-2', 'author:reply-3'],
      mutedRepliesCount: 0,
      localTotalCount: 3,
    });

    vi.spyOn(Core, 'buildPostReplyStreamId').mockReturnValue('stream:author:post-1');
    const getOrFetchSpy = vi.spyOn(Core.StreamPostsController, 'getOrFetchStreamSlice').mockResolvedValue({
      nextPageIds: [],
      timestamp: 1,
      reachedEnd: true,
    });

    const { result } = renderHook(() => useReplyStream('author:post-1', { maxReplies: 3 }));

    // First call exhausts the stream
    await act(async () => {
      await result.current.expandAll();
    });
    expect(getOrFetchSpy).toHaveBeenCalledTimes(1);

    // Second call should be a no-op
    await act(async () => {
      await result.current.expandAll();
    });
    expect(getOrFetchSpy).toHaveBeenCalledTimes(1);
  });

  it('expandAll stops at MAX_EXPAND_PAGES when stream never ends', async () => {
    vi.mocked(usePostCounts).mockReturnValue({
      postCounts: { replies: 500 },
    } as ReturnType<typeof usePostCounts>);

    // Return enough replies so initial fetch useEffect doesn't fire
    vi.mocked(useLiveQuery).mockReturnValue({
      replyIds: ['author:reply-1', 'author:reply-2', 'author:reply-3'],
      mutedRepliesCount: 0,
      localTotalCount: 3,
    });

    vi.spyOn(Core, 'buildPostReplyStreamId').mockReturnValue('stream:author:post-1');
    let callCount = 0;
    vi.spyOn(Core.StreamPostsController, 'getOrFetchStreamSlice').mockImplementation(async () => {
      callCount++;
      return {
        nextPageIds: Array.from({ length: 10 }, (_, i) => `author:reply-${callCount * 10 + i}`),
        timestamp: callCount * 10,
        reachedEnd: false,
      };
    });

    const { result } = renderHook(() => useReplyStream('author:post-1', { maxReplies: 3 }));

    await act(async () => {
      await result.current.expandAll();
    });

    // MAX_EXPAND_PAGES = 20
    expect(callCount).toBe(20);
    expect(result.current.showAll).toBe(true);
  });
});
