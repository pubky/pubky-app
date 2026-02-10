import { act, renderHook } from '@testing-library/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Core from '@/core';
import { usePostCounts } from '@/hooks/usePostCounts';
import { useNestedReplies } from './useNestedReplies';

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

describe('useNestedReplies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('computes adjusted nested reply count and hasMoreReplies', () => {
    vi.mocked(usePostCounts).mockReturnValue({
      postCounts: { replies: 5 },
    } as ReturnType<typeof usePostCounts>);

    vi.mocked(useLiveQuery).mockReturnValueOnce(['author:nested-1', 'author:nested-2']).mockReturnValueOnce(1);

    const { result } = renderHook(() => useNestedReplies('author:reply-1'));

    expect(result.current.nestedReplyIds).toEqual(['author:nested-1', 'author:nested-2']);
    expect(result.current.replyCount).toBe(4);
    expect(result.current.hasNestedReplies).toBe(true);
    expect(result.current.hasMoreReplies).toBe(true);
  });

  it('passes null postId to usePostCounts when depth reached maxDepth', () => {
    vi.mocked(usePostCounts).mockReturnValue({
      postCounts: { replies: 0 },
    } as ReturnType<typeof usePostCounts>);
    vi.mocked(useLiveQuery).mockReturnValueOnce([]).mockReturnValueOnce(0);

    renderHook(() => useNestedReplies('author:reply-1', { depth: 1, maxDepth: 1 }));

    expect(usePostCounts).toHaveBeenCalledWith(null);
  });

  it('expandAll paginates until reachedEnd and marks stream as exhausted', async () => {
    vi.mocked(usePostCounts).mockReturnValue({
      postCounts: { replies: 2 },
    } as ReturnType<typeof usePostCounts>);

    let liveQueryCall = 0;
    vi.mocked(useLiveQuery).mockImplementation(() => {
      const index = liveQueryCall % 2;
      liveQueryCall += 1;
      if (index === 0) return ['author:nested-1', 'author:nested-2'];
      return 0;
    });

    vi.spyOn(Core, 'buildPostReplyStreamId').mockReturnValue('stream:author:reply-1');
    const getOrFetchSpy = vi
      .spyOn(Core.StreamPostsController, 'getOrFetchStreamSlice')
      .mockResolvedValueOnce({
        nextPageIds: Array.from({ length: 10 }, (_, index) => `author:nested-${index + 3}`),
        timestamp: 11,
        reachedEnd: false,
      })
      .mockResolvedValueOnce({
        nextPageIds: ['author:nested-13'],
        timestamp: 12,
        reachedEnd: true,
      });

    const { result } = renderHook(() => useNestedReplies('author:reply-1'));

    await act(async () => {
      await result.current.expandAll();
    });

    expect(getOrFetchSpy).toHaveBeenCalledTimes(2);
    expect(result.current.showAll).toBe(true);
    expect(result.current.hasMoreReplies).toBe(false);
  });
});
