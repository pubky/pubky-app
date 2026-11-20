import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import { useAuthStore } from '@/stores/auth/auth.store';
import { invalidateResourceBookmarks, useResourceBookmarks } from './useResourceBookmarks';

vi.mock('@/controllers/bookmark/bookmark', () => ({ BookmarkController: { fetchResourceBookmarks: vi.fn() } }));

const LINK = 'https://www.openstreetmap.org/node/240109189';

describe('useResourceBookmarks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateResourceBookmarks();
    useAuthStore.setState({ currentUserPubky: 'viewer' });
    vi.mocked(BookmarkController.fetchResourceBookmarks).mockResolvedValue([LINK]);
  });

  it('lists the viewer’s bookmarked links once for every reader', async () => {
    const first = renderHook(() => useResourceBookmarks());
    const second = renderHook(() => useResourceBookmarks());

    await waitFor(() => expect(first.result.current).toEqual([LINK]));
    expect(second.result.current).toEqual([LINK]);
    expect(BookmarkController.fetchResourceBookmarks).toHaveBeenCalledTimes(1);
    expect(BookmarkController.fetchResourceBookmarks).toHaveBeenCalledWith({ userId: 'viewer' });
  });

  it('lists them again after a bookmark of a link changed', async () => {
    const { result } = renderHook(() => useResourceBookmarks());
    await waitFor(() => expect(result.current).toEqual([LINK]));
    vi.mocked(BookmarkController.fetchResourceBookmarks).mockResolvedValue([]);

    act(() => invalidateResourceBookmarks());

    await waitFor(() => expect(result.current).toEqual([]));
  });

  it('asks again after a failed listing, and keeps a newer listing a late failure would drop', async () => {
    let fail: (error: Error) => void = () => {};
    vi.mocked(BookmarkController.fetchResourceBookmarks).mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    const first = renderHook(() => useResourceBookmarks());
    act(() => invalidateResourceBookmarks());
    await waitFor(() => expect(first.result.current).toEqual([LINK]));
    await act(async () => fail(new Error('offline')));

    renderHook(() => useResourceBookmarks());
    // The newer listing stays shared: no third request.
    expect(BookmarkController.fetchResourceBookmarks).toHaveBeenCalledTimes(2);
  });

  it('reads nothing signed out', () => {
    useAuthStore.setState({ currentUserPubky: null });
    const { result } = renderHook(() => useResourceBookmarks());

    expect(result.current).toBeUndefined();
    expect(BookmarkController.fetchResourceBookmarks).not.toHaveBeenCalled();
  });
});
