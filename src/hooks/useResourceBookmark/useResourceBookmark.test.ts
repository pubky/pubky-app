import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import { invalidateResourceBookmarks } from '@/hooks/useResourceBookmarks/useResourceBookmarks';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useResourceBookmark } from './useResourceBookmark';

const mocks = vi.hoisted(() => ({ waitForAuth: vi.fn(), isAuthenticated: true }));

vi.mock('@/controllers/bookmark/bookmark', () => ({
  BookmarkController: {
    fetchResourceBookmarks: vi.fn(),
    commitCreateResource: vi.fn(),
    commitDeleteResource: vi.fn(),
  },
}));
vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({ waitForAuth: mocks.waitForAuth, isAuthenticated: mocks.isAuthenticated }),
}));
vi.mock('@/molecules/Toaster/toast');

const URI = 'https://open.spotify.com/track/5Z01UMMf7V1o0MzF86s6WJ';
const USER = 'viewer';

describe('useResourceBookmark', () => {
  // The homeserver's bookmarks listing, as the writes leave it.
  let listing: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    invalidateResourceBookmarks();
    mocks.isAuthenticated = true;
    mocks.waitForAuth.mockResolvedValue(true);
    useAuthStore.setState({ currentUserPubky: USER });
    listing = [];
    vi.mocked(BookmarkController.fetchResourceBookmarks).mockImplementation(async () => [...listing]);
    vi.mocked(BookmarkController.commitCreateResource).mockImplementation(async ({ uri }) => {
      listing.push(uri);
      return true;
    });
    vi.mocked(BookmarkController.commitDeleteResource).mockImplementation(async ({ uri }) => {
      listing = listing.filter((link) => link !== uri);
      return true;
    });
  });

  it('reads the viewer’s own bookmark state', async () => {
    listing = [URI];
    const { result } = renderHook(() => useResourceBookmark(URI));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isBookmarked).toBe(true));
    expect(BookmarkController.fetchResourceBookmarks).toHaveBeenCalledWith({ userId: USER });
  });

  it('reads nothing until active, then reads once', async () => {
    listing = [URI];
    const { result, rerender } = renderHook(({ active }) => useResourceBookmark(URI, { active }), {
      initialProps: { active: false },
    });

    expect(result.current).toMatchObject({ isBookmarked: false, isLoading: false });
    expect(BookmarkController.fetchResourceBookmarks).not.toHaveBeenCalled();

    rerender({ active: true });
    await waitFor(() => expect(result.current.isBookmarked).toBe(true));
    expect(BookmarkController.fetchResourceBookmarks).toHaveBeenCalledTimes(1);
  });

  it('reads one listing for every card of the viewer', async () => {
    listing = [URI];
    const first = renderHook(() => useResourceBookmark(URI));
    const second = renderHook(() => useResourceBookmark('https://example.com/other'));

    await waitFor(() => expect(first.result.current.isBookmarked).toBe(true));
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));
    expect(second.result.current.isBookmarked).toBe(false);
    expect(BookmarkController.fetchResourceBookmarks).toHaveBeenCalledTimes(1);
  });

  it('reads nothing as bookmarked while signed out', () => {
    mocks.isAuthenticated = false;
    useAuthStore.setState({ currentUserPubky: null });
    const { result } = renderHook(() => useResourceBookmark(URI));

    expect(result.current).toMatchObject({ isBookmarked: false, isLoading: false });
    expect(BookmarkController.fetchResourceBookmarks).not.toHaveBeenCalled();
  });

  it('bookmarks and un-bookmarks the link', async () => {
    const { result } = renderHook(() => useResourceBookmark(URI));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(result.current.toggle()).resolves.toBe(true);
    });
    expect(BookmarkController.commitCreateResource).toHaveBeenCalledWith({ uri: URI, userId: USER });
    expect(result.current.isBookmarked).toBe(true);
    expect(toast).toHaveBeenCalledWith({ title: 'Saved to bookmarks' });

    await act(async () => {
      await result.current.toggle();
    });
    expect(BookmarkController.commitDeleteResource).toHaveBeenCalledWith({ uri: URI, userId: USER });
    await waitFor(() => expect(result.current.isBookmarked).toBe(false));
  });

  it('flips back and announces nothing when the write was skipped for a changed account', async () => {
    vi.mocked(BookmarkController.commitCreateResource).mockResolvedValue(false);
    const { result } = renderHook(() => useResourceBookmark(URI));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(result.current.toggle()).resolves.toBe(false);
    });

    expect(result.current.isBookmarked).toBe(false);
    expect(toast).not.toHaveBeenCalled();
  });

  it('flips back with an error toast when the write fails', async () => {
    vi.mocked(BookmarkController.commitCreateResource).mockRejectedValue(new Error('refused'));
    const { result } = renderHook(() => useResourceBookmark(URI));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(result.current.toggle()).resolves.toBe(false);
    });

    expect(result.current.isBookmarked).toBe(false);
    expect(toast).toHaveBeenCalledWith({ variant: 'error', description: 'Could not add bookmark' });
  });

  describe('with other spellings of the link', () => {
    const SHARE = `${URI}?si=share`;

    it('reads as bookmarked when a spelling is, removes the bookmark on each, and bookmarks the link itself', async () => {
      listing = [SHARE];
      const { result } = renderHook(() => useResourceBookmark(URI, { spellings: [SHARE] }));
      await waitFor(() => expect(result.current.isBookmarked).toBe(true));

      await act(() => result.current.toggle());
      expect(BookmarkController.commitDeleteResource).toHaveBeenCalledTimes(1);
      expect(BookmarkController.commitDeleteResource).toHaveBeenCalledWith({ uri: SHARE, userId: USER });
      await waitFor(() => expect(result.current.isBookmarked).toBe(false));

      await act(() => result.current.toggle());
      expect(BookmarkController.commitCreateResource).toHaveBeenCalledWith({ uri: URI, userId: USER });
      await waitFor(() => expect(result.current.isBookmarked).toBe(true));
      // One listing a page, read again after each write: never one request per spelling.
      expect(BookmarkController.fetchResourceBookmarks).toHaveBeenCalledTimes(3);
    });

    it('stops at a removal skipped for a changed account and announces nothing', async () => {
      listing = [URI, SHARE];
      vi.mocked(BookmarkController.commitDeleteResource).mockResolvedValue(false);
      const { result } = renderHook(() => useResourceBookmark(URI, { spellings: [SHARE] }));
      await waitFor(() => expect(result.current.isBookmarked).toBe(true));

      await act(async () => {
        await expect(result.current.toggle()).resolves.toBe(false);
      });
      expect(BookmarkController.commitDeleteResource).toHaveBeenCalledTimes(1);
      expect(result.current.isBookmarked).toBe(true);
      expect(toast).not.toHaveBeenCalled();
    });

    it('keeps showing the bookmark when removing it from one spelling fails', async () => {
      listing = [URI, SHARE];
      vi.mocked(BookmarkController.commitDeleteResource)
        .mockImplementationOnce(async () => {
          listing = [SHARE];
          return true;
        })
        .mockRejectedValueOnce(new Error('down'));
      const { result } = renderHook(() => useResourceBookmark(URI, { spellings: [SHARE] }));
      await waitFor(() => expect(result.current.isBookmarked).toBe(true));

      await act(() => result.current.toggle());
      expect(BookmarkController.commitDeleteResource).toHaveBeenCalledTimes(2);
      expect(result.current.isBookmarked).toBe(true);
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
      // The listing read again holds the spelling still bookmarked.
      await waitFor(() => expect(BookmarkController.fetchResourceBookmarks).toHaveBeenCalledTimes(2));
      expect(result.current.isBookmarked).toBe(true);
    });
  });

  it('writes nothing when the viewer does not sign in', async () => {
    mocks.waitForAuth.mockResolvedValue(false);
    const { result } = renderHook(() => useResourceBookmark(URI));

    await act(async () => {
      await expect(result.current.toggle()).resolves.toBe(false);
    });
    expect(BookmarkController.commitCreateResource).not.toHaveBeenCalled();
  });
});
