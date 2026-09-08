import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { PostController } from '@/controllers/post/post';
import { PostStreamTypes } from '@/models/stream/post/postStream.types';
import { toast } from '@/molecules/Toaster/toast';
import { useTimelineFeedContext } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeedContext';
import { useDeletePost } from './useDeletePost';

// Mock dependencies
const mockDelete = vi.fn();
const mockGetPostDetails = vi.fn();
vi.mock('@/controllers/post/post', () => ({
  PostController: {
    commitDelete: vi.fn(),
    getDetails: vi.fn(),
  },
}));

// Mock molecules (toast)
vi.mock('@/molecules/Toaster/toast');

// Mock useLocalFilesStore
const mockSetPostAttachments = vi.fn();
vi.mock('@/stores/localFiles/localFiles.store', () => ({
  useLocalFilesStore: {
    getState: vi.fn(() => ({
      setPostAttachments: mockSetPostAttachments,
    })),
  },
}));

// Mock organisms (useTimelineFeedContext)
const mockRemovePosts = vi.fn();
const mockPrependPosts = vi.fn();
const mockPrependOptimisticPosts = vi.fn();
const mockTimelineFeed = {
  variant: TIMELINE_FEED_VARIANT.HOME,
  streamId: PostStreamTypes.TIMELINE_ALL_ALL,
  removePosts: mockRemovePosts,
  prependPosts: mockPrependPosts,
  prependOptimisticPosts: mockPrependOptimisticPosts,
};

vi.mock('@/organisms/Timeline/Feed/TimelineFeed/TimelineFeedContext', () => {
  return {
    useTimelineFeedContext: vi.fn(),
  };
});

describe('useDeletePost', () => {
  const mockPostId = 'author:post-123';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(PostController.commitDelete).mockImplementation(mockDelete);
    vi.mocked(PostController.getDetails).mockImplementation(mockGetPostDetails);
    vi.mocked(useTimelineFeedContext).mockReturnValue(mockTimelineFeed);
    // Default: post exists (for tests that expect restoration)
    mockGetPostDetails.mockResolvedValue({ id: mockPostId, content: 'Test post' });
  });

  it('returns isDeleting false initially', () => {
    const { result } = renderHook(() => useDeletePost());
    expect(result.current.isDeleting).toBe(false);
  });

  it('returns deletePost function', () => {
    const { result } = renderHook(() => useDeletePost());
    expect(typeof result.current.deletePost).toBe('function');
  });

  it('optimistically removes post from timeline feed', async () => {
    mockDelete.mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeletePost());

    await act(async () => {
      await result.current.deletePost(mockPostId);
    });

    expect(mockRemovePosts).toHaveBeenCalledWith(mockPostId);
    expect(mockRemovePosts).toHaveBeenCalledBefore(mockDelete);
  });

  it('calls PostController.commitDelete with correct postId', async () => {
    mockDelete.mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeletePost());

    await act(async () => {
      await result.current.deletePost(mockPostId);
    });

    expect(PostController.commitDelete).toHaveBeenCalledWith({
      compositePostId: mockPostId,
    });
  });

  it('clears the local attachment cache after successful deletion', async () => {
    mockDelete.mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeletePost());

    await act(async () => {
      await result.current.deletePost(mockPostId);
    });

    expect(mockSetPostAttachments).toHaveBeenCalledWith(mockPostId, []);
    // The cache is only cleared once the delete actually committed
    expect(mockDelete).toHaveBeenCalledBefore(mockSetPostAttachments);
  });

  it('does not clear the local attachment cache when the post is restored to the timeline', async () => {
    mockDelete.mockRejectedValue(new Error('Deletion failed'));
    // Row exists with live content → local write never committed → restore
    mockGetPostDetails.mockResolvedValue({ id: mockPostId, content: 'Test post' });

    const { result } = renderHook(() => useDeletePost());

    await act(async () => {
      await result.current.deletePost(mockPostId);
    });

    expect(mockPrependPosts).toHaveBeenCalledWith(mockPostId);
    expect(mockSetPostAttachments).not.toHaveBeenCalled();
  });

  it('clears the local attachment cache when the local write committed as a tombstone but sync failed', async () => {
    mockDelete.mockRejectedValue(new Error('homeserver sync failed'));
    // Row exists but is tombstoned → local write committed → keep removal, clear cache
    mockGetPostDetails.mockResolvedValue({ id: mockPostId, content: '[DELETED]' });

    const { result } = renderHook(() => useDeletePost());

    await act(async () => {
      await result.current.deletePost(mockPostId);
    });

    expect(mockPrependPosts).not.toHaveBeenCalled();
    expect(mockSetPostAttachments).toHaveBeenCalledWith(mockPostId, []);
  });

  it('clears the local attachment cache when the local row is gone but sync failed', async () => {
    mockDelete.mockRejectedValue(new Error('homeserver sync failed'));
    // Row removed → local write committed → keep removal, clear cache
    mockGetPostDetails.mockResolvedValue(null);

    const { result } = renderHook(() => useDeletePost());

    await act(async () => {
      await result.current.deletePost(mockPostId);
    });

    expect(mockPrependPosts).not.toHaveBeenCalled();
    expect(mockSetPostAttachments).toHaveBeenCalledWith(mockPostId, []);
  });

  it('does not clear the local attachment cache when the existence check itself fails', async () => {
    mockDelete.mockRejectedValue(new Error('Deletion failed'));
    // Couldn't verify → restore optimistically, keep the cache
    mockGetPostDetails.mockRejectedValue(new Error('db unavailable'));

    const { result } = renderHook(() => useDeletePost());

    await act(async () => {
      await result.current.deletePost(mockPostId);
    });

    expect(mockPrependPosts).toHaveBeenCalledWith(mockPostId);
    expect(mockSetPostAttachments).not.toHaveBeenCalled();
  });

  it('shows success toast on successful deletion', async () => {
    mockDelete.mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeletePost());

    await act(async () => {
      await result.current.deletePost(mockPostId);
    });

    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      title: 'Post deleted',
      dismissButton: true,
    });
  });

  it('sets isDeleting to true during deletion', async () => {
    let resolveDelete: () => void;
    const deletePromise = new Promise<void>((resolve) => {
      resolveDelete = resolve;
    });
    mockDelete.mockReturnValue(deletePromise);

    const { result } = renderHook(() => useDeletePost());

    act(() => {
      result.current.deletePost(mockPostId);
    });

    await waitFor(() => {
      expect(result.current.isDeleting).toBe(true);
    });

    await act(async () => {
      resolveDelete!();
      await deletePromise;
    });

    await waitFor(() => {
      expect(result.current.isDeleting).toBe(false);
    });
  });

  it('restores post to timeline feed on deletion failure when post still exists', async () => {
    const error = new Error('Deletion failed');
    mockDelete.mockRejectedValue(error);
    // Post still exists in DB
    mockGetPostDetails.mockResolvedValue({ id: mockPostId, content: 'Test post' });

    const { result } = renderHook(() => useDeletePost());

    await act(async () => {
      await result.current.deletePost(mockPostId);
    });

    expect(mockGetPostDetails).toHaveBeenCalledWith({ compositeId: mockPostId });
    expect(mockPrependPosts).toHaveBeenCalledWith(mockPostId);
  });

  it('does not restore post to timeline feed when post already deleted from DB', async () => {
    const error = new Error('Deletion failed');
    mockDelete.mockRejectedValue(error);
    // Post already deleted from DB (local-first write succeeded)
    mockGetPostDetails.mockResolvedValue(null);

    const { result } = renderHook(() => useDeletePost());

    await act(async () => {
      await result.current.deletePost(mockPostId);
    });

    expect(mockGetPostDetails).toHaveBeenCalledWith({ compositeId: mockPostId });
    expect(mockPrependPosts).not.toHaveBeenCalled();
  });

  it('does not restore when the row exists but is tombstoned (content === [DELETED])', async () => {
    // After the `LocalPostService.delete` tombstone refactor, a successful
    // local-first write leaves a row with `content === '[DELETED]'` instead
    // of removing it. Without the content-aware check the hook would
    // restore — bringing back a `PostUnavailable` molecule where the user's
    // post used to be. Verify the tombstone is treated as "local write
    // committed" and the optimistic removal stays in place.
    mockDelete.mockRejectedValue(new Error('homeserver sync failed'));
    mockGetPostDetails.mockResolvedValue({ id: mockPostId, content: '[DELETED]' });

    const { result } = renderHook(() => useDeletePost());

    await act(async () => {
      await result.current.deletePost(mockPostId);
    });

    expect(mockGetPostDetails).toHaveBeenCalledWith({ compositeId: mockPostId });
    expect(mockPrependPosts).not.toHaveBeenCalled();
  });

  it('shows error toast on deletion failure', async () => {
    const error = new Error('Deletion failed');
    mockDelete.mockRejectedValue(error);

    const { result } = renderHook(() => useDeletePost());

    await act(async () => {
      await result.current.deletePost(mockPostId);
    });

    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Could not delete post. Try again.',
    });
  });

  it('sets isDeleting to false after deletion failure', async () => {
    const error = new Error('Deletion failed');
    mockDelete.mockRejectedValue(error);

    const { result } = renderHook(() => useDeletePost());

    await act(async () => {
      await result.current.deletePost(mockPostId);
    });

    expect(result.current.isDeleting).toBe(false);
  });

  it('does not remove post if already deleting', async () => {
    let resolveDelete: () => void;
    const deletePromise = new Promise<void>((resolve) => {
      resolveDelete = resolve;
    });
    mockDelete.mockReturnValue(deletePromise);

    const { result } = renderHook(() => useDeletePost());

    // Start first deletion
    act(() => {
      result.current.deletePost(mockPostId);
    });

    // Try to delete again while first is in progress
    await act(async () => {
      await result.current.deletePost(mockPostId);
    });

    // Should only remove once
    expect(mockRemovePosts).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveDelete!();
      await deletePromise;
    });
  });

  it('works without timeline feed context', async () => {
    vi.mocked(useTimelineFeedContext).mockReturnValue(null);
    mockDelete.mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeletePost());

    await act(async () => {
      await result.current.deletePost(mockPostId);
    });

    expect(mockRemovePosts).not.toHaveBeenCalled();
    expect(mockPrependPosts).not.toHaveBeenCalled();
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      title: 'Post deleted',
      dismissButton: true,
    });
  });

  describe('transactional removal (feeds exposing removePostsOptimistically)', () => {
    // These feeds route deletes through the commit/rollback transaction so the
    // skip-stream cursor decrement (owned by useStreamPagination) is applied on
    // commit. The suite above keeps covering the legacy removePosts fallback.
    const mockCommit = vi.fn();
    const mockRollback = vi.fn();
    const mockRemovePostsOptimistically = vi.fn(() => ({ commit: mockCommit, rollback: mockRollback }));
    const transactionalFeed = {
      ...mockTimelineFeed,
      removePostsOptimistically: mockRemovePostsOptimistically,
    };

    beforeEach(() => {
      vi.mocked(useTimelineFeedContext).mockReturnValue(transactionalFeed);
    });

    it('opens the removal before the delete and commits it on success', async () => {
      mockDelete.mockResolvedValue(undefined);

      const { result } = renderHook(() => useDeletePost());
      await act(async () => {
        await result.current.deletePost(mockPostId);
      });

      expect(mockRemovePostsOptimistically).toHaveBeenCalledWith(mockPostId);
      expect(mockRemovePostsOptimistically).toHaveBeenCalledBefore(mockDelete);
      expect(mockCommit).toHaveBeenCalledTimes(1);
      expect(mockRollback).not.toHaveBeenCalled();
      // The transactional path replaces the plain removal entirely.
      expect(mockRemovePosts).not.toHaveBeenCalled();
    });

    it('commits the removal when the sync fails but the local row is tombstoned', async () => {
      mockDelete.mockRejectedValue(new Error('homeserver sync failed'));
      mockGetPostDetails.mockResolvedValue({ id: mockPostId, content: '[DELETED]' });

      const { result } = renderHook(() => useDeletePost());
      await act(async () => {
        await result.current.deletePost(mockPostId);
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      expect(mockRollback).not.toHaveBeenCalled();
    });

    it('commits the removal when the sync fails but the local row is gone (hard delete)', async () => {
      mockDelete.mockRejectedValue(new Error('homeserver sync failed'));
      mockGetPostDetails.mockResolvedValue(null);

      const { result } = renderHook(() => useDeletePost());
      await act(async () => {
        await result.current.deletePost(mockPostId);
      });

      expect(mockCommit).toHaveBeenCalledTimes(1);
      expect(mockRollback).not.toHaveBeenCalled();
    });

    it('rolls back the removal when the sync fails and the local row is still live', async () => {
      mockDelete.mockRejectedValue(new Error('deletion failed'));
      mockGetPostDetails.mockResolvedValue({ id: mockPostId, content: 'Test post' });

      const { result } = renderHook(() => useDeletePost());
      await act(async () => {
        await result.current.deletePost(mockPostId);
      });

      expect(mockRollback).toHaveBeenCalledTimes(1);
      expect(mockCommit).not.toHaveBeenCalled();
      // Rollback reveals the card in place; no prepend-based restore.
      expect(mockPrependPosts).not.toHaveBeenCalled();
    });

    it('rolls back the removal when the local state cannot be verified', async () => {
      mockDelete.mockRejectedValue(new Error('deletion failed'));
      mockGetPostDetails.mockRejectedValue(new Error('indexeddb unavailable'));

      const { result } = renderHook(() => useDeletePost());
      await act(async () => {
        await result.current.deletePost(mockPostId);
      });

      expect(mockRollback).toHaveBeenCalledTimes(1);
      expect(mockCommit).not.toHaveBeenCalled();
    });
  });

  describe('toastMessages override', () => {
    it('uses overridden success toast copy when provided', async () => {
      mockDelete.mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useDeletePost({
          toastMessages: {
            deleted: 'Collection deleted',
          },
        }),
      );

      await act(async () => {
        await result.current.deletePost(mockPostId);
      });

      expect(vi.mocked(toast)).toHaveBeenCalledWith({
        title: 'Collection deleted',
        dismissButton: true,
      });
    });

    it('uses overridden failure toast copy when provided', async () => {
      mockDelete.mockRejectedValue(new Error('boom'));

      const { result } = renderHook(() =>
        useDeletePost({
          toastMessages: {
            deleteFailed: 'Failed to delete collection. Please try again.',
          },
        }),
      );

      await act(async () => {
        await result.current.deletePost(mockPostId);
      });

      expect(vi.mocked(toast)).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Failed to delete collection. Please try again.',
      });
    });

    it('uses overridden title while falling back to generic copy for omitted fields', async () => {
      mockDelete.mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useDeletePost({
          toastMessages: { deleted: 'Collection deleted' },
        }),
      );

      await act(async () => {
        await result.current.deletePost(mockPostId);
      });

      expect(vi.mocked(toast)).toHaveBeenCalledWith({
        title: 'Collection deleted',
        dismissButton: true,
      });
    });
  });
});
