import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useBookmark } from './useBookmark';
import { mockAuthStore } from '@/test-utils/stores';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
// Mock dependencies
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn(),
}));
vi.mock('@/controllers/bookmark/bookmark', () => ({
  BookmarkController: {
    exists: vi.fn(),
    commitCreate: vi.fn(),
    commitDelete: vi.fn(),
  },
}));

// Mock molecules (useToast)
const mockToast = vi.fn();
vi.mock('@/molecules', () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe('useBookmark', () => {
  const mockUserId = 'user-123' as Pubky;
  const mockPostId = 'author:post-456';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthStore).mockImplementation((selector) => selector(mockAuthStore({ currentUserPubky: mockUserId })));
  });

  it('returns isBookmarked false when post is not bookmarked', async () => {
    vi.mocked(BookmarkController.exists).mockResolvedValue(false);

    const { result } = renderHook(() => useBookmark(mockPostId));

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    // Wait for effect to complete
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isBookmarked).toBe(false);
  });

  it('returns isBookmarked true when post is bookmarked', async () => {
    vi.mocked(BookmarkController.exists).mockResolvedValue(true);

    const { result } = renderHook(() => useBookmark(mockPostId));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isBookmarked).toBe(true);
  });

  it('returns isLoading true initially', () => {
    vi.mocked(BookmarkController.exists).mockResolvedValue(false);

    const { result } = renderHook(() => useBookmark(mockPostId));

    expect(result.current.isLoading).toBe(true);
  });

  it('returns isToggling false initially', async () => {
    vi.mocked(BookmarkController.exists).mockResolvedValue(false);

    const { result } = renderHook(() => useBookmark(mockPostId));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isToggling).toBe(false);
  });

  it('creates bookmark when toggle is called and not bookmarked', async () => {
    vi.mocked(BookmarkController.exists).mockResolvedValue(false);
    vi.mocked(BookmarkController.commitCreate).mockResolvedValue(undefined);

    const { result } = renderHook(() => useBookmark(mockPostId));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.toggle();
    });

    expect(BookmarkController.commitCreate).toHaveBeenCalledWith({
      postId: mockPostId,
      userId: mockUserId,
    });
    expect(result.current.isBookmarked).toBe(true);
    expect(mockToast).toHaveBeenCalledWith({
      title: 'Bookmark added',
      description: 'Post saved to your bookmarks',
    });
  });

  it('deletes bookmark when toggle is called and is bookmarked', async () => {
    vi.mocked(BookmarkController.exists).mockResolvedValue(true);
    vi.mocked(BookmarkController.commitDelete).mockResolvedValue(undefined);

    const { result } = renderHook(() => useBookmark(mockPostId));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.toggle();
    });

    expect(BookmarkController.commitDelete).toHaveBeenCalledWith({
      postId: mockPostId,
      userId: mockUserId,
    });
    expect(result.current.isBookmarked).toBe(false);
    expect(mockToast).toHaveBeenCalledWith({
      title: 'Bookmark removed',
      description: 'Post removed from your bookmarks',
    });
  });

  it('shows error toast when user is not logged in', async () => {
    vi.mocked(useAuthStore).mockImplementation((selector) => selector(mockAuthStore({ currentUserPubky: null })));
    vi.mocked(BookmarkController.exists).mockResolvedValue(false);

    const { result } = renderHook(() => useBookmark(mockPostId));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.toggle();
    });

    expect(mockToast).toHaveBeenCalledWith({
      title: 'Error',
      description: 'You must be logged in to bookmark posts',
    });
    expect(BookmarkController.commitCreate).not.toHaveBeenCalled();
  });

  it('shows error toast when bookmark operation fails', async () => {
    vi.mocked(BookmarkController.exists).mockResolvedValue(false);
    vi.mocked(BookmarkController.commitCreate).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useBookmark(mockPostId));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.toggle();
    });

    expect(mockToast).toHaveBeenCalledWith({
      title: 'Error',
      description: 'Failed to add bookmark',
    });
    // State should not change on error
    expect(result.current.isBookmarked).toBe(false);
  });
});
