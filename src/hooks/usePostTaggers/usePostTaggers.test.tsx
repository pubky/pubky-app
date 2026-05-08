import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostController } from '@/controllers/post/post';
import { usePostTaggers } from './usePostTaggers';

vi.mock('@/controllers/post/post', () => ({
  PostController: {
    fetchTaggers: vi.fn(),
  },
}));

describe('usePostTaggers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty maps when postId is missing', () => {
    const { result } = renderHook(() => usePostTaggers(null));

    expect(result.current.taggersByLabel.size).toBe(0);
    expect(result.current.taggerStates.size).toBe(0);
  });

  it('keeps fetchAllTaggers callback stable across rerenders for the same postId', () => {
    const { result, rerender } = renderHook(({ postId }: { postId: string }) => usePostTaggers(postId), {
      initialProps: { postId: 'author:post123' },
    });

    const firstCallback = result.current.fetchAllTaggers;
    rerender({ postId: 'author:post123' });

    expect(result.current.fetchAllTaggers).toBe(firstCallback);
  });

  it('fetches all taggers across pages', async () => {
    const fetchTaggers = vi.mocked(PostController.fetchTaggers);

    fetchTaggers
      .mockResolvedValueOnce({ users: ['a', 'b'], relationship: false })
      .mockResolvedValueOnce({ users: ['c', 'd'], relationship: false })
      .mockResolvedValueOnce({ users: [], relationship: false });

    const { result } = renderHook(() => usePostTaggers('author:post123'));

    await act(async () => {
      await result.current.fetchAllTaggers('test', [], 4);
    });

    await waitFor(() => {
      const taggers = result.current.taggersByLabel.get('test');
      expect(taggers).toEqual(['a', 'b', 'c', 'd']);
    });
  });
});
