import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useResourceBookmark } from './useResourceBookmark';

const mocks = vi.hoisted(() => ({ waitForAuth: vi.fn(), isAuthenticated: true }));

vi.mock('@/controllers/bookmark/bookmark', () => ({
  BookmarkController: {
    fetchResourceBookmarked: vi.fn(),
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAuthenticated = true;
    mocks.waitForAuth.mockResolvedValue(true);
    useAuthStore.setState({ currentUserPubky: USER });
    vi.mocked(BookmarkController.fetchResourceBookmarked).mockResolvedValue(false);
    vi.mocked(BookmarkController.commitCreateResource).mockResolvedValue(true);
    vi.mocked(BookmarkController.commitDeleteResource).mockResolvedValue(true);
  });

  it('reads the viewer’s own bookmark state', async () => {
    vi.mocked(BookmarkController.fetchResourceBookmarked).mockResolvedValue(true);
    const { result } = renderHook(() => useResourceBookmark(URI));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isBookmarked).toBe(true));
    expect(BookmarkController.fetchResourceBookmarked).toHaveBeenCalledWith({ uri: URI, userId: USER });
  });

  it('reads nothing until active, then reads once', async () => {
    vi.mocked(BookmarkController.fetchResourceBookmarked).mockResolvedValue(true);
    const { result, rerender } = renderHook(({ active }) => useResourceBookmark(URI, { active }), {
      initialProps: { active: false },
    });

    expect(result.current).toMatchObject({ isBookmarked: false, isLoading: false });
    expect(BookmarkController.fetchResourceBookmarked).not.toHaveBeenCalled();

    rerender({ active: true });
    await waitFor(() => expect(result.current.isBookmarked).toBe(true));
    expect(BookmarkController.fetchResourceBookmarked).toHaveBeenCalledTimes(1);
  });

  it('reads nothing while signed out', () => {
    mocks.isAuthenticated = false;
    useAuthStore.setState({ currentUserPubky: null });
    const { result } = renderHook(() => useResourceBookmark(URI));

    expect(result.current).toMatchObject({ isBookmarked: false, isLoading: false });
    expect(BookmarkController.fetchResourceBookmarked).not.toHaveBeenCalled();
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
    expect(result.current.isBookmarked).toBe(false);
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

  it('writes nothing when the viewer does not sign in', async () => {
    mocks.waitForAuth.mockResolvedValue(false);
    const { result } = renderHook(() => useResourceBookmark(URI));

    await act(async () => {
      await expect(result.current.toggle()).resolves.toBe(false);
    });
    expect(BookmarkController.commitCreateResource).not.toHaveBeenCalled();
  });
});
