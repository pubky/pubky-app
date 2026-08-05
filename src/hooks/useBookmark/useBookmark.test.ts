import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { mockAuthStore } from '@/test-utils/stores';
import { useBookmark } from './useBookmark';

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
vi.mock('@/molecules/Toaster/use-toast', () => {
  return {
    useToast: () => ({ toast: mockToast }),
  };
});

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
      title: 'Post saved to bookmarks',
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
      title: 'Post removed from bookmarks',
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
      variant: 'error',
      description: 'Sign in to bookmark posts',
    });
    expect(BookmarkController.commitCreate).not.toHaveBeenCalled();
  });

  describe('initialIsBookmarked option', () => {
    it('seeds isBookmarked to true before the async existence check resolves', async () => {
      let resolveExists!: (value: boolean) => void;
      vi.mocked(BookmarkController.exists).mockReturnValue(
        new Promise<boolean>((resolve) => {
          resolveExists = resolve;
        }),
      );

      const { result } = renderHook(() => useBookmark(mockPostId, { initialIsBookmarked: true }));

      // No `false` flash before the async check resolves.
      expect(result.current.isBookmarked).toBe(true);
      expect(result.current.isLoading).toBe(true);

      // Drain the pending promise inside `act` so React state updates from
      // the resolved effect are flushed cleanly (no "not wrapped in act" warning).
      await act(async () => {
        resolveExists(true);
      });
    });

    it('still runs the async existence check and reconciles with the resolved value', async () => {
      // Seed `true` but the real local state says `false` — verify reconciliation.
      vi.mocked(BookmarkController.exists).mockResolvedValue(false);

      const { result } = renderHook(() => useBookmark(mockPostId, { initialIsBookmarked: true }));

      expect(result.current.isBookmarked).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(BookmarkController.exists).toHaveBeenCalledWith(mockPostId);
      expect(result.current.isBookmarked).toBe(false);
    });

    it('defaults to false when initialIsBookmarked is omitted', () => {
      vi.mocked(BookmarkController.exists).mockReturnValue(new Promise(() => {}));

      const { result } = renderHook(() => useBookmark(mockPostId));

      expect(result.current.isBookmarked).toBe(false);
    });
  });

  describe('toastMessages option', () => {
    it('uses custom add-success toast copy when the bookmark is created', async () => {
      vi.mocked(BookmarkController.exists).mockResolvedValue(false);
      vi.mocked(BookmarkController.commitCreate).mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useBookmark(mockPostId, {
          toastMessages: {
            added: 'Collection followed',
            removed: 'Collection unfollowed',
          },
        }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.toggle();
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: 'Collection followed',
      });
    });

    it('uses custom remove-success toast copy when the bookmark is deleted', async () => {
      vi.mocked(BookmarkController.exists).mockResolvedValue(true);
      vi.mocked(BookmarkController.commitDelete).mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useBookmark(mockPostId, {
          toastMessages: {
            added: 'Collection followed',
            removed: 'Collection unfollowed',
          },
        }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.toggle();
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: 'Collection unfollowed',
      });
    });

    it('keeps the generic error toast even when toastMessages overrides are provided', async () => {
      // Failure-path copy intentionally stays with the i18n defaults — verify.
      vi.mocked(BookmarkController.exists).mockResolvedValue(false);
      vi.mocked(BookmarkController.commitCreate).mockRejectedValue(new Error('boom'));

      const { result } = renderHook(() =>
        useBookmark(mockPostId, {
          toastMessages: {
            added: 'Collection followed',
            removed: 'Collection unfollowed',
          },
        }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.toggle();
      });

      expect(mockToast).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Could not add bookmark',
      });
    });
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
      variant: 'error',
      description: 'Could not add bookmark',
    });
    // State should not change on error
    expect(result.current.isBookmarked).toBe(false);
  });

  describe('local-first failure reconciliation', () => {
    it('mirrors the committed local delete and warns when only the sync failed', async () => {
      // Local-first: the Dexie delete commits before the homeserver call, so
      // the bookmarks feed already shows the item gone — the button must not
      // keep claiming it is bookmarked.
      vi.mocked(BookmarkController.exists).mockResolvedValueOnce(true).mockResolvedValue(false);
      vi.mocked(BookmarkController.commitDelete).mockRejectedValue(new Error('Homeserver unavailable'));

      const { result } = renderHook(() => useBookmark(mockPostId));

      await waitFor(() => {
        expect(result.current.isBookmarked).toBe(true);
      });

      await act(async () => {
        await result.current.toggle();
      });

      expect(result.current.isBookmarked).toBe(false);
      expect(mockToast).toHaveBeenCalledWith({
        variant: 'warning',
        description: 'Removed from bookmarks on this device, but syncing failed.',
      });
    });

    it('keeps the bookmarked state and errors when the local delete never committed', async () => {
      vi.mocked(BookmarkController.exists).mockResolvedValue(true);
      vi.mocked(BookmarkController.commitDelete).mockRejectedValue(new Error('Database error'));

      const { result } = renderHook(() => useBookmark(mockPostId));

      await waitFor(() => {
        expect(result.current.isBookmarked).toBe(true);
      });

      await act(async () => {
        await result.current.toggle();
      });

      expect(result.current.isBookmarked).toBe(true);
      expect(mockToast).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Could not remove bookmark',
      });
    });

    it('mirrors the committed local create and warns when only the sync failed', async () => {
      vi.mocked(BookmarkController.exists).mockResolvedValueOnce(false).mockResolvedValue(true);
      vi.mocked(BookmarkController.commitCreate).mockRejectedValue(new Error('Homeserver unavailable'));

      const { result } = renderHook(() => useBookmark(mockPostId));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.toggle();
      });

      expect(result.current.isBookmarked).toBe(true);
      expect(mockToast).toHaveBeenCalledWith({
        variant: 'warning',
        description: 'Saved to bookmarks on this device, but syncing failed.',
      });
    });

    it('keeps the pre-toggle state and errors when local state cannot be verified', async () => {
      vi.mocked(BookmarkController.exists).mockResolvedValueOnce(true).mockRejectedValue(new Error('Database error'));
      vi.mocked(BookmarkController.commitDelete).mockRejectedValue(new Error('Homeserver unavailable'));

      const { result } = renderHook(() => useBookmark(mockPostId));

      await waitFor(() => {
        expect(result.current.isBookmarked).toBe(true);
      });

      await act(async () => {
        await result.current.toggle();
      });

      expect(result.current.isBookmarked).toBe(true);
      expect(mockToast).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Could not remove bookmark',
      });
    });
  });
});
