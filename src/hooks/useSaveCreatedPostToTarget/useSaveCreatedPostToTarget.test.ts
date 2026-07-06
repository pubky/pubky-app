import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@/libs/logger/logger';
import type { FeedInsertTarget } from '@/stores/feedOptimistic/feedOptimistic.types';
import { useSaveCreatedPostToTarget } from './useSaveCreatedPostToTarget';

const mocks = vi.hoisted(() => ({
  currentUserPubky: 'viewer-pubky' as string | null,
  commitUpdateCollectionItem: vi.fn(),
  commitCreateBookmark: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: mocks.currentUserPubky }),
}));

vi.mock('@/controllers/post/post', () => ({
  PostController: {
    commitUpdateCollectionItem: (...args: unknown[]) => mocks.commitUpdateCollectionItem(...args),
  },
}));

vi.mock('@/controllers/bookmark/bookmark', () => ({
  BookmarkController: {
    commitCreate: (...args: unknown[]) => mocks.commitCreateBookmark(...args),
  },
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace: string) =>
    (key: string): string =>
      `${namespace}.${key}`,
}));

vi.mock('@/libs/logger/logger', async () => {
  const actual = await vi.importActual<typeof import('@/libs/logger/logger')>('@/libs/logger/logger');
  return {
    ...actual,
    Logger: { ...actual.Logger, error: vi.fn() },
  };
});

describe('useSaveCreatedPostToTarget', () => {
  const collectionTarget: FeedInsertTarget = { type: 'collection', collectionId: 'owner:collection-1' };
  const bookmarksTarget: FeedInsertTarget = { type: 'bookmarks' };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUserPubky = 'viewer-pubky';
    mocks.commitUpdateCollectionItem.mockResolvedValue(undefined);
    mocks.commitCreateBookmark.mockResolvedValue(undefined);
  });

  it('saves a created post to a collection, runs onSaved, and shows success toast', async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useSaveCreatedPostToTarget());

    await act(async () => {
      await result.current({ target: collectionTarget, createdPostId: 'author:post-1', onSaved });
    });

    expect(mocks.commitUpdateCollectionItem).toHaveBeenCalledWith({
      collectionId: 'owner:collection-1',
      postId: 'author:post-1',
      shouldAdd: true,
    });
    expect(mocks.commitCreateBookmark).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith('author:post-1', collectionTarget);
    expect(mocks.toast).toHaveBeenCalledWith({ title: 'toast.success', description: 'fab.addedToCollection' });
  });

  it('bookmarks a created post, runs onSaved, and shows bookmark toast', async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useSaveCreatedPostToTarget());

    await act(async () => {
      await result.current({ target: bookmarksTarget, createdPostId: 'author:post-2', onSaved });
    });

    expect(mocks.commitCreateBookmark).toHaveBeenCalledWith({ postId: 'author:post-2', userId: 'viewer-pubky' });
    expect(mocks.commitUpdateCollectionItem).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith('author:post-2', bookmarksTarget);
    expect(mocks.toast).toHaveBeenCalledWith({ title: 'toast.bookmark.added' });
  });

  it('shows login-required feedback and skips bookmarking when the current pubky is missing', async () => {
    const onSaved = vi.fn();
    mocks.currentUserPubky = null;
    const { result } = renderHook(() => useSaveCreatedPostToTarget());

    await act(async () => {
      await result.current({ target: bookmarksTarget, createdPostId: 'author:post-3', onSaved });
    });

    expect(mocks.commitCreateBookmark).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith({ variant: 'error', description: 'toast.bookmark.loginRequired' });
  });

  it('shows collection error feedback and skips onSaved when collection save fails', async () => {
    const error = new Error('collection failed');
    const onSaved = vi.fn();
    mocks.commitUpdateCollectionItem.mockRejectedValue(error);
    const { result } = renderHook(() => useSaveCreatedPostToTarget());

    await act(async () => {
      await result.current({ target: collectionTarget, createdPostId: 'author:post-4', onSaved });
    });

    expect(onSaved).not.toHaveBeenCalled();
    expect(Logger.error).toHaveBeenCalledWith('[useSaveCreatedPostToTarget] Failed to save created post', {
      error,
      target: collectionTarget,
      createdPostId: 'author:post-4',
    });
    expect(mocks.toast).toHaveBeenCalledWith({ variant: 'error', description: 'postSave.updateCollectionFailed' });
  });

  it('shows bookmark error feedback and skips onSaved when bookmark save fails', async () => {
    const error = new Error('bookmark failed');
    const onSaved = vi.fn();
    mocks.commitCreateBookmark.mockRejectedValue(error);
    const { result } = renderHook(() => useSaveCreatedPostToTarget());

    await act(async () => {
      await result.current({ target: bookmarksTarget, createdPostId: 'author:post-5', onSaved });
    });

    expect(onSaved).not.toHaveBeenCalled();
    expect(Logger.error).toHaveBeenCalledWith('[useSaveCreatedPostToTarget] Failed to save created post', {
      error,
      target: bookmarksTarget,
      createdPostId: 'author:post-5',
    });
    expect(mocks.toast).toHaveBeenCalledWith({ variant: 'error', description: 'toast.bookmark.addFailed' });
  });

  it('awaits onSaved and routes its failure through the target error feedback', async () => {
    const error = new Error('optimistic insert failed');
    const onSaved = vi.fn().mockRejectedValue(error);
    const { result } = renderHook(() => useSaveCreatedPostToTarget());

    await act(async () => {
      await result.current({ target: collectionTarget, createdPostId: 'author:post-6', onSaved });
    });

    expect(onSaved).toHaveBeenCalledWith('author:post-6', collectionTarget);
    expect(Logger.error).toHaveBeenCalledWith('[useSaveCreatedPostToTarget] Failed to save created post', {
      error,
      target: collectionTarget,
      createdPostId: 'author:post-6',
    });
    expect(mocks.toast).toHaveBeenCalledWith({ variant: 'error', description: 'postSave.updateCollectionFailed' });
  });
});
