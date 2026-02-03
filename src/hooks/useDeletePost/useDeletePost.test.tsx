import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDeletePost } from './useDeletePost';
import * as Core from '@/core';
import * as Organisms from '@/organisms';

// Mock Core
const mockDelete = vi.fn();
const mockGetPostDetails = vi.fn();
vi.mock('@/core', () => ({
  PostController: {
    commitDelete: vi.fn(),
    getDetails: vi.fn(),
  },
}));

// Mock molecules (useToast)
const mockToast = vi.fn();
vi.mock('@/molecules', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

// Mock organisms (useTimelineFeedContext)
const mockRemovePosts = vi.fn();
const mockPrependPosts = vi.fn();
const mockTimelineFeed = {
  removePosts: mockRemovePosts,
  prependPosts: mockPrependPosts,
};

vi.mock('@/organisms', () => ({
  useTimelineFeedContext: vi.fn(),
}));

describe('useDeletePost', () => {
  const mockPostId = 'author:post-123';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Core.PostController.commitDelete).mockImplementation(mockDelete);
    vi.mocked(Core.PostController.getDetails).mockImplementation(mockGetPostDetails);
    vi.mocked(Organisms.useTimelineFeedContext).mockReturnValue(mockTimelineFeed);
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

    expect(Core.PostController.commitDelete).toHaveBeenCalledWith({
      compositePostId: mockPostId,
    });
  });

  it('shows success toast on successful deletion', async () => {
    mockDelete.mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeletePost());

    await act(async () => {
      await result.current.deletePost(mockPostId);
    });

    expect(mockToast).toHaveBeenCalledWith({
      title: 'Post deleted',
      description: 'Your post has been deleted',
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

  it('shows error toast on deletion failure', async () => {
    const error = new Error('Deletion failed');
    mockDelete.mockRejectedValue(error);

    const { result } = renderHook(() => useDeletePost());

    await act(async () => {
      await result.current.deletePost(mockPostId);
    });

    expect(mockToast).toHaveBeenCalledWith({
      title: 'Error',
      description: 'Failed to delete post. Please try again.',
      className: 'destructive border-destructive bg-destructive text-destructive-foreground',
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
    vi.mocked(Organisms.useTimelineFeedContext).mockReturnValue(null);
    mockDelete.mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeletePost());

    await act(async () => {
      await result.current.deletePost(mockPostId);
    });

    expect(mockRemovePosts).not.toHaveBeenCalled();
    expect(mockPrependPosts).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith({
      title: 'Post deleted',
      description: 'Your post has been deleted',
    });
  });
});
