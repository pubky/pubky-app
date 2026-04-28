import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveQuery } from 'dexie-react-hooks';
import * as Core from '@/core';
import { usePostCounts } from '@/hooks/usePostCounts/usePostCounts';
import { useThreadReplies } from './useThreadReplies';

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(),
}));

vi.mock('@/hooks/useMutedUsers/useMutedUsers', () => ({
  useMutedUsers: vi.fn(() => ({
    mutedUserIdSet: new Set(),
  })),
}));

vi.mock('@/hooks/usePostCounts/usePostCounts', () => ({
  usePostCounts: vi.fn(),
}));

describe('useThreadReplies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('computes adjusted total and hasMore from live query values', () => {
    vi.mocked(usePostCounts).mockReturnValue({
      postCounts: { replies: 5 },
    } as ReturnType<typeof usePostCounts>);

    vi.mocked(useLiveQuery).mockReturnValueOnce({
      replyIds: ['author:reply-1', 'author:reply-2', 'author:reply-3'],
      mutedRepliesCount: 1,
      localTotalCount: 3,
    });

    const { result } = renderHook(() => useThreadReplies('author:post-1'));

    expect(result.current.replyIds).toEqual(['author:reply-1', 'author:reply-2', 'author:reply-3']);
    expect(result.current.totalCount).toBe(4);
    expect(result.current.hasMore).toBe(true);
  });

  it('expandAll paginates until reachedEnd and marks stream as exhausted', async () => {
    vi.mocked(usePostCounts).mockReturnValue({
      postCounts: { replies: 2 },
    } as ReturnType<typeof usePostCounts>);

    vi.mocked(useLiveQuery).mockReturnValue({
      replyIds: ['author:reply-1', 'author:reply-2', 'author:reply-3'],
      mutedRepliesCount: 0,
      localTotalCount: 3,
    });

    vi.spyOn(Core, 'buildPostReplyStreamId').mockReturnValue('post_replies:author:post-1');
    const getOrFetchSpy = vi
      .spyOn(Core.StreamPostsController, 'getOrFetchStreamSlice')
      .mockResolvedValueOnce({
        nextPageIds: Array.from({ length: 10 }, (_, index) => `author:reply-${index + 3}`),
        timestamp: 11,
        reachedEnd: false,
      })
      .mockResolvedValueOnce({
        nextPageIds: ['author:reply-4'],
        timestamp: 12,
        reachedEnd: true,
      });

    const { result } = renderHook(() => useThreadReplies('author:post-1'));

    await act(async () => {
      await result.current.expandAll();
    });

    expect(getOrFetchSpy).toHaveBeenCalledTimes(2);
    expect(result.current.showAll).toBe(true);
    expect(result.current.hasMore).toBe(false);
  });

  it('marks stream exhausted when pagination cursor does not advance', async () => {
    vi.mocked(usePostCounts).mockReturnValue({
      postCounts: { replies: 20 },
    } as ReturnType<typeof usePostCounts>);

    vi.mocked(useLiveQuery).mockReturnValue({
      replyIds: ['author:reply-1', 'author:reply-2'],
      mutedRepliesCount: 0,
      localTotalCount: 2,
    });

    vi.spyOn(Core, 'buildPostReplyStreamId').mockReturnValue('post_replies:author:post-1');
    const getOrFetchSpy = vi.spyOn(Core.StreamPostsController, 'getOrFetchStreamSlice').mockResolvedValue({
      nextPageIds: Array.from({ length: 10 }, (_, index) => `author:reply-${index + 3}`),
      timestamp: 0,
      reachedEnd: false,
    });

    const { result } = renderHook(() => useThreadReplies('author:post-1'));

    await act(async () => {
      await result.current.expandAll();
    });

    expect(getOrFetchSpy).toHaveBeenCalled();
    expect(result.current.showAll).toBe(true);
    expect(result.current.hasMore).toBe(false);
  });
});
