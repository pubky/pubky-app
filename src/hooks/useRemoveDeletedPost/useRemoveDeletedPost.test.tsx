import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import { PostController } from '@/controllers/post/post';
import type { Pubky } from '@/models/models.types';
import { PostStreamTypes } from '@/models/stream/post/postStream.types';
import type { TimelineFeedContextValue } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed.types';
import { useTimelineFeedContext } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeedContext';
import { useAuthStore } from '@/stores/auth/auth.store';
import { mockAuthStore } from '@/test-utils/stores';
import { useRemoveDeletedPost } from './useRemoveDeletedPost';

vi.mock('@/controllers/bookmark/bookmark', () => ({
  BookmarkController: {
    exists: vi.fn(),
    commitDelete: vi.fn(),
  },
}));

vi.mock('@/controllers/post/post', () => ({
  PostController: {
    getDetails: vi.fn(),
    commitUpdateCollectionItem: vi.fn(),
  },
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('@/organisms/Timeline/Feed/TimelineFeed/TimelineFeedContext', () => ({
  useTimelineFeedContext: vi.fn(),
}));

const { mockToast } = vi.hoisted(() => ({ mockToast: vi.fn() }));
vi.mock('@/molecules/Toaster/use-toast', () => ({
  toast: mockToast,
}));

describe('useRemoveDeletedPost', () => {
  const currentUserPubky = 'current-user' as Pubky;
  const postId = 'post-author:deleted-post';
  const postUri = 'pubky://post-author/pub/pubky.app/posts/deleted-post';
  const collectionId = `${currentUserPubky}:collection-id`;
  const commitRemoval = vi.fn();
  const rollbackRemoval = vi.fn();
  const removePosts = vi.fn();
  const removePostsOptimistically = vi.fn(() => ({ commit: commitRemoval, rollback: rollbackRemoval }));
  const prependOptimisticPosts = vi.fn();
  const feedBase = {
    streamId: PostStreamTypes.TIMELINE_BOOKMARKS_ALL,
    prependPosts: vi.fn(),
    prependOptimisticPosts,
    removePosts,
    removePostsOptimistically,
  };
  const bookmarksFeed: TimelineFeedContextValue = {
    ...feedBase,
    variant: TIMELINE_FEED_VARIANT.BOOKMARKS,
  };
  const collectionFeed: TimelineFeedContextValue = {
    ...feedBase,
    variant: TIMELINE_FEED_VARIANT.COLLECTION,
    collectionId,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthStore).mockImplementation((selector) =>
      selector(mockAuthStore({ currentUserPubky: currentUserPubky })),
    );
    vi.mocked(useTimelineFeedContext).mockReturnValue(bookmarksFeed);
    vi.mocked(BookmarkController.exists).mockResolvedValue(true);
    vi.mocked(PostController.getDetails).mockResolvedValue({
      content: JSON.stringify({ name: 'Collection', description: '', items: [postUri] }),
    } as never);
  });

  it('allows removal from the signed-in user bookmarks', () => {
    const { result } = renderHook(() => useRemoveDeletedPost(postId));

    expect(result.current.canRemove).toBe(true);
    expect(result.current.isRemoving).toBe(false);
  });

  it('optimistically removes a bookmark before persistence resolves', async () => {
    let resolveDelete: (() => void) | undefined;
    const deletePromise = new Promise<void>((resolve) => {
      resolveDelete = resolve;
    });
    vi.mocked(BookmarkController.commitDelete).mockReturnValue(deletePromise);

    const { result } = renderHook(() => useRemoveDeletedPost(postId));
    let removePromise: Promise<boolean> | undefined;

    act(() => {
      removePromise = result.current.remove();
    });

    expect(removePostsOptimistically).toHaveBeenCalledWith(postId);
    expect(removePostsOptimistically.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(BookmarkController.commitDelete).mock.invocationCallOrder[0],
    );
    expect(rollbackRemoval).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.isRemoving).toBe(true));

    await act(async () => {
      resolveDelete?.();
      await removePromise;
    });

    expect(rollbackRemoval).not.toHaveBeenCalled();
    expect(commitRemoval).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith({ title: 'Post removed from bookmarks' });
  });

  it('removes a deleted post from an owned collection', async () => {
    vi.mocked(useTimelineFeedContext).mockReturnValue(collectionFeed);
    vi.mocked(PostController.commitUpdateCollectionItem).mockResolvedValue(undefined);

    const { result } = renderHook(() => useRemoveDeletedPost(postId));

    await act(async () => {
      await result.current.remove();
    });

    expect(removePostsOptimistically).toHaveBeenCalledWith(postId);
    expect(commitRemoval).toHaveBeenCalledTimes(1);
    expect(PostController.commitUpdateCollectionItem).toHaveBeenCalledWith({
      collectionId,
      postId,
      shouldAdd: false,
    });
    expect(mockToast).toHaveBeenCalledWith({ title: 'Post removed from collection.' });
  });

  it('restores the bookmark card when persistence fails', async () => {
    vi.mocked(BookmarkController.commitDelete).mockRejectedValue(new Error('Homeserver unavailable'));

    const { result } = renderHook(() => useRemoveDeletedPost(postId));

    await act(async () => {
      expect(await result.current.remove()).toBe(false);
    });

    expect(removePostsOptimistically).toHaveBeenCalledWith(postId);
    expect(rollbackRemoval).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Could not remove bookmark',
    });
  });

  it('keeps the bookmark card removed when the local deletion committed before a sync failure', async () => {
    vi.mocked(BookmarkController.commitDelete).mockRejectedValue(new Error('Homeserver unavailable'));
    vi.mocked(BookmarkController.exists).mockResolvedValue(false);

    const { result } = renderHook(() => useRemoveDeletedPost(postId));

    await act(async () => {
      expect(await result.current.remove()).toBe(false);
    });

    expect(BookmarkController.exists).toHaveBeenCalledWith(postId);
    expect(rollbackRemoval).not.toHaveBeenCalled();
    expect(commitRemoval).toHaveBeenCalledTimes(1);
    // The card stays removed (local delete committed), so the toast must not
    // claim the removal failed outright — only that the sync did.
    expect(mockToast).toHaveBeenCalledWith({
      variant: 'warning',
      description: 'Removed from bookmarks on this device, but syncing failed.',
    });
  });

  it('restores the collection card when persistence fails', async () => {
    vi.mocked(useTimelineFeedContext).mockReturnValue(collectionFeed);
    vi.mocked(PostController.commitUpdateCollectionItem).mockRejectedValue(new Error('Homeserver unavailable'));

    const { result } = renderHook(() => useRemoveDeletedPost(postId));

    await act(async () => {
      expect(await result.current.remove()).toBe(false);
    });

    expect(rollbackRemoval).toHaveBeenCalledWith();
    expect(mockToast).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Failed to update collection.',
    });
  });

  it('keeps the collection card removed when the local update committed before a sync failure', async () => {
    vi.mocked(useTimelineFeedContext).mockReturnValue(collectionFeed);
    vi.mocked(PostController.commitUpdateCollectionItem).mockRejectedValue(new Error('Homeserver unavailable'));
    vi.mocked(PostController.getDetails).mockResolvedValue({
      content: JSON.stringify({ name: 'Collection', description: '', items: [] }),
    } as never);

    const { result } = renderHook(() => useRemoveDeletedPost(postId));

    await act(async () => {
      expect(await result.current.remove()).toBe(false);
    });

    expect(PostController.getDetails).toHaveBeenCalledWith({ compositeId: collectionId });
    expect(rollbackRemoval).not.toHaveBeenCalled();
    expect(commitRemoval).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith({
      variant: 'warning',
      description: 'Removed from the collection on this device, but syncing failed.',
    });
  });

  it('restores the card when the update failed because the collection is missing', async () => {
    // commitUpdateCollectionItem throws NOT_FOUND for a missing collection
    // BEFORE writing anything — "post not in collection" here must not be
    // misread as a committed removal.
    vi.mocked(useTimelineFeedContext).mockReturnValue(collectionFeed);
    vi.mocked(PostController.commitUpdateCollectionItem).mockRejectedValue(new Error('Collection not found'));
    vi.mocked(PostController.getDetails).mockResolvedValue(null);

    const { result } = renderHook(() => useRemoveDeletedPost(postId));

    await act(async () => {
      expect(await result.current.remove()).toBe(false);
    });

    expect(rollbackRemoval).toHaveBeenCalledTimes(1);
    expect(commitRemoval).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Failed to update collection.',
    });
  });

  it('restores the card when the update failed because the collection is tombstoned', async () => {
    vi.mocked(useTimelineFeedContext).mockReturnValue(collectionFeed);
    vi.mocked(PostController.commitUpdateCollectionItem).mockRejectedValue(new Error('Collection not found'));
    vi.mocked(PostController.getDetails).mockResolvedValue({ content: '[DELETED]' } as never);

    const { result } = renderHook(() => useRemoveDeletedPost(postId));

    await act(async () => {
      expect(await result.current.remove()).toBe(false);
    });

    expect(rollbackRemoval).toHaveBeenCalledTimes(1);
    expect(commitRemoval).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Failed to update collection.',
    });
  });

  it('prevents duplicate removal requests while one is pending', async () => {
    let resolveDelete: (() => void) | undefined;
    const deletePromise = new Promise<void>((resolve) => {
      resolveDelete = resolve;
    });
    vi.mocked(BookmarkController.commitDelete).mockReturnValue(deletePromise);

    const { result } = renderHook(() => useRemoveDeletedPost(postId));

    act(() => {
      void result.current.remove();
      void result.current.remove();
    });

    expect(removePostsOptimistically).toHaveBeenCalledTimes(1);
    expect(BookmarkController.commitDelete).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveDelete?.();
      await deletePromise;
    });
  });

  it('does not allow a non-owner to remove from a collection', async () => {
    vi.mocked(useTimelineFeedContext).mockReturnValue({
      ...collectionFeed,
      collectionId: 'another-user:collection-id',
    });

    const { result } = renderHook(() => useRemoveDeletedPost(postId));

    expect(result.current.canRemove).toBe(false);
    await act(async () => {
      expect(await result.current.remove()).toBe(false);
    });
    expect(removePostsOptimistically).not.toHaveBeenCalled();
    expect(PostController.commitUpdateCollectionItem).not.toHaveBeenCalled();
  });

  it('does not allow removal outside bookmarks and collection feeds', () => {
    vi.mocked(useTimelineFeedContext).mockReturnValue({
      ...feedBase,
      variant: TIMELINE_FEED_VARIANT.HOME,
    });

    const { result } = renderHook(() => useRemoveDeletedPost(postId));

    expect(result.current.canRemove).toBe(false);
  });

  it('does not allow removal without an authenticated user', () => {
    vi.mocked(useAuthStore).mockImplementation((selector) => selector(mockAuthStore({ currentUserPubky: null })));

    const { result } = renderHook(() => useRemoveDeletedPost(postId));

    expect(result.current.canRemove).toBe(false);
  });
});
