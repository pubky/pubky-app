import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COLLECTION_LAYOUT } from '@/config/collections';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { toast } from '@/molecules/Toaster/toast';
import { usePostSaveTargets } from './usePostSaveTargets';

const mocks = vi.hoisted(() => ({
  commitUpdateCollectionItem: vi.fn(),
  commitCreateCollection: vi.fn(),
  toggleBookmark: vi.fn(),
  loadMoreCollections: vi.fn(),
  paginationEnabled: null as boolean | null,
  collection1Saved: true,
  completionReadPending: false,
}));
vi.mock('@/controllers/post/post', () => ({
  PostController: {
    commitUpdateCollectionItem: (...args: unknown[]) => mocks.commitUpdateCollectionItem(...args),
    commitCreateCollection: (...args: unknown[]) => mocks.commitCreateCollection(...args),
  },
}));

vi.mock('@/hooks/useBookmark/useBookmark', () => ({
  useBookmark: () => ({
    isBookmarked: true,
    isLoading: false,
    isToggling: false,
    toggle: mocks.toggleBookmark,
  }),
}));

vi.mock('@/hooks/useAuthoredCollections/useAuthoredCollections', () => ({
  useAuthoredCollectionsPagination: ({ enabled }: { enabled?: boolean }) => {
    mocks.paginationEnabled = enabled ?? null;
    return {
      hasMore: true,
      isLoading: false,
      isLoadingMore: false,
      loadMore: mocks.loadMoreCollections,
    };
  },
  useAuthoredCollections: (_enabled: boolean, version: number) => ({
    collections: [
      {
        details: { id: 'author:collection1' },
        content: {
          name: 'Proof of Work',
          description: 'Bitcoin writing',
          items: mocks.collection1Saved ? ['pubky://author/pub/pubky.app/posts/post1'] : [],
        },
      },
      {
        details: { id: 'author:collection2' },
        content: {
          name: 'AI Papers',
          description: '',
          items: [],
        },
      },
    ],
    isLoading: version > 0 && mocks.completionReadPending,
    // A pending forced read still shows the rows of the previous version.
    readVersion: version > 0 && mocks.completionReadPending ? version - 1 : version,
  }),
}));

vi.mock('@/molecules/Toaster/toast');

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: 'current-user' }),
}));
describe('usePostSaveTargets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.paginationEnabled = null;
    mocks.collection1Saved = true;
    mocks.completionReadPending = false;
    mocks.commitUpdateCollectionItem.mockReset().mockResolvedValue(undefined);
  });

  it('paginates authored collections only while the picker is open', async () => {
    const open = renderHook(() => usePostSaveTargets('author:post1', { isPickerOpen: true }));

    expect(mocks.paginationEnabled).toBe(true);
    expect(open.result.current.hasMoreCollections).toBe(true);
    expect(open.result.current.isCollectionsLoadingMore).toBe(false);

    await act(async () => {
      await open.result.current.loadMoreCollections();
    });
    expect(mocks.loadMoreCollections).toHaveBeenCalledTimes(1);

    renderHook(() => usePostSaveTargets('author:post1', { isPickerOpen: false }));
    expect(mocks.paginationEnabled).toBe(false);
  });

  it('combines bookmark state and collection membership', () => {
    const { result } = renderHook(() => usePostSaveTargets('author:post1'));

    expect(result.current.isBookmarked).toBe(true);
    expect(result.current.collections).toEqual([
      expect.objectContaining({ id: 'author:collection1', name: 'Proof of Work', isSaved: true }),
      expect.objectContaining({ id: 'author:collection2', name: 'AI Papers', isSaved: false }),
    ]);
  });

  it('toggles collection membership separately from bookmarks', async () => {
    const { result } = renderHook(() => usePostSaveTargets('author:post1'));

    await act(async () => {
      await result.current.toggleCollection('author:collection1');
    });

    expect(mocks.commitUpdateCollectionItem).toHaveBeenCalledWith({
      collectionId: 'author:collection1',
      postId: 'author:post1',
      shouldAdd: false,
    });
    expect(mocks.toggleBookmark).not.toHaveBeenCalled();
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      title: 'Post removed from collection.',
    });
  });

  it('shows a generic toast when adding a post to a collection', async () => {
    const { result } = renderHook(() => usePostSaveTargets('author:post1'));

    await act(async () => {
      await result.current.toggleCollection('author:collection2');
    });

    expect(mocks.commitUpdateCollectionItem).toHaveBeenCalledWith({
      collectionId: 'author:collection2',
      postId: 'author:post1',
      shouldAdd: true,
    });
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      title: 'Post added to collection.',
    });
  });

  it('forwards the backend error message when updating a collection fails', async () => {
    mocks.commitUpdateCollectionItem.mockRejectedValue(
      new AppError({
        category: ErrorCategory.Validation,
        code: ValidationErrorCode.INVALID_INPUT,
        message: 'Collection has too many items',
        service: ErrorService.Local,
        operation: 'validateCollectionContent',
      }),
    );
    const { result } = renderHook(() => usePostSaveTargets('author:post1'));

    await act(async () => {
      await result.current.toggleCollection('author:collection2');
    });

    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Collection has too many items',
    });
  });

  it('stays busy until the live query acknowledges a rollback, then accepts subsequent membership changes', async () => {
    const pending = Promise.withResolvers<void>();
    mocks.commitUpdateCollectionItem.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(() => usePostSaveTargets('author:post1'));
    let update: Promise<void>;
    act(() => {
      update = result.current.toggleCollection('author:collection1');
    });
    mocks.collection1Saved = false;
    rerender();
    expect(result.current.collections[0]).toMatchObject({ isSaved: false, isUpdating: true });
    mocks.completionReadPending = true;
    await act(async () => {
      pending.reject(
        new AppError({
          category: ErrorCategory.Validation,
          code: ValidationErrorCode.INVALID_INPUT,
          message: 'Save rejected',
          service: ErrorService.Local,
          operation: 'test-rollback',
        }),
      );
      await update;
    });
    expect(result.current.collections[0].isUpdating).toBe(true);
    expect(result.current.collections[1].isUpdating).toBe(false);
    mocks.collection1Saved = true;
    mocks.completionReadPending = false;
    rerender();
    expect(result.current.collections[0]).toMatchObject({ isSaved: true, isUpdating: false });
    mocks.collection1Saved = false;
    rerender();
    expect(result.current.collections[0]).toMatchObject({ isSaved: false, isUpdating: false });
  });

  it('keeps the other collections interactive while a completed toggle waits for its fresh read', async () => {
    const { result, rerender } = renderHook(() => usePostSaveTargets('author:post1'));
    mocks.completionReadPending = true;
    await act(async () => {
      await result.current.toggleCollection('author:collection1');
    });
    expect(result.current.collections.map((collection) => collection.isUpdating)).toEqual([true, false]);

    await act(async () => {
      await result.current.toggleCollection('author:collection2');
    });
    expect(mocks.commitUpdateCollectionItem).toHaveBeenLastCalledWith({
      collectionId: 'author:collection2',
      postId: 'author:post1',
      shouldAdd: true,
    });
    // The mocked list now reflects the first toggle's read; only the second waits.
    expect(result.current.collections.map((collection) => collection.isUpdating)).toEqual([false, true]);
    mocks.completionReadPending = false;
    rerender();
    expect(result.current.collections.map((collection) => collection.isUpdating)).toEqual([false, false]);
  });

  it('creates a collection with the current post URI as first item', async () => {
    const { result } = renderHook(() => usePostSaveTargets('author:post1'));

    await act(async () => {
      await result.current.createCollectionWithPost('New collection');
    });

    expect(mocks.commitCreateCollection).toHaveBeenCalledWith({
      authorId: 'current-user',
      name: 'New collection',
      items: ['pubky://author/pub/pubky.app/posts/post1'],
      layout: COLLECTION_LAYOUT.CARDS,
    });
  });
});
