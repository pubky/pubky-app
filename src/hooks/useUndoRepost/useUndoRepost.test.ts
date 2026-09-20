import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostController } from '@/controllers/post/post';
import { toast } from '@/molecules/Toaster/toast';
import { useUndoRepost } from './useUndoRepost';

// Exercise the real useDeletePost so the assertions cover the resulting action,
// pending state and toast, rather than only its configuration arguments.
vi.mock('@/controllers/post/post', () => ({
  PostController: { commitDelete: vi.fn(), getDetails: vi.fn() },
}));
vi.mock('@/molecules/Toaster/toast', () => ({ toast: vi.fn() }));
vi.mock('@/organisms/Timeline/Feed/TimelineFeed/TimelineFeedContext', () => ({
  useTimelineFeedContext: () => undefined,
}));
vi.mock('@/stores/localFiles/localFiles.store', () => ({
  useLocalFilesStore: { getState: () => ({ setPostAttachments: vi.fn() }) },
}));

describe('useUndoRepost', () => {
  const repostId = 'viewer:repost';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(PostController.commitDelete).mockResolvedValue(undefined);
    vi.mocked(PostController.getDetails).mockResolvedValue(null);
  });

  it.each([
    { isCollectionShare: undefined, title: 'Repost removed' },
    { isCollectionShare: false, title: 'Repost removed' },
    { isCollectionShare: true, title: 'Share removed' },
  ])(
    'removes the supplied repost and shows "$title" (collection: $isCollectionShare)',
    async ({ isCollectionShare, title }) => {
      const { result } = renderHook(() => useUndoRepost(isCollectionShare));

      await act(async () => {
        await result.current.undoRepost(repostId);
      });

      expect(PostController.commitDelete).toHaveBeenCalledExactlyOnceWith({ compositePostId: repostId });
      expect(toast).toHaveBeenCalledExactlyOnceWith({ title, dismissButton: true });
      expect(result.current.isUndoing).toBe(false);
    },
  );

  it.each([
    { isCollectionShare: false, description: 'Could not remove repost. Try again.' },
    { isCollectionShare: true, description: 'Could not remove share. Try again.' },
  ])('reports "$description" and clears the pending state on failure', async ({ isCollectionShare, description }) => {
    vi.mocked(PostController.commitDelete).mockRejectedValueOnce({ message: 'Delete failed' });
    const { result } = renderHook(() => useUndoRepost(isCollectionShare));

    await act(async () => {
      await result.current.undoRepost(repostId);
    });

    expect(toast).toHaveBeenCalledExactlyOnceWith({ variant: 'error', description });
    expect(result.current.isUndoing).toBe(false);
  });

  it('exposes the pending state until deletion settles', async () => {
    const deletion = Promise.withResolvers<void>();
    vi.mocked(PostController.commitDelete).mockReturnValueOnce(deletion.promise);
    const { result } = renderHook(() => useUndoRepost());
    let undo: Promise<void>;

    act(() => {
      undo = result.current.undoRepost(repostId);
    });
    expect(result.current.isUndoing).toBe(true);
    expect(toast).not.toHaveBeenCalled();

    await act(async () => {
      deletion.resolve();
      await undo;
    });
    expect(result.current.isUndoing).toBe(false);
    expect(toast).toHaveBeenCalledExactlyOnceWith({ title: 'Repost removed', dismissButton: true });
  });
});
