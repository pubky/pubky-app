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
  postCollectionsEnabled: null as boolean | null,
  postCollectionIds: [] as string[],
  loadMoreOtherCollections: vi.fn(),
  recordCuratorRemoval: vi.fn(),
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
  useAuthoredCollections: () => ({
    collections: [
      {
        details: { id: 'author:collection1' },
        content: {
          name: 'Proof of Work',
          description: 'Bitcoin writing',
          items: ['pubky://author/pub/pubky.app/posts/post1'],
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
    isLoading: false,
  }),
}));

vi.mock('@/hooks/usePostCollections/usePostCollections', () => ({
  usePostCollections: (_postId: string, { enabled }: { enabled?: boolean }) => {
    mocks.postCollectionsEnabled = enabled ?? null;
    return {
      collectionIds: mocks.postCollectionIds,
      isLoading: false,
      hasMore: true,
      isLoadingMore: false,
      loadMore: mocks.loadMoreOtherCollections,
      recordRemoval: mocks.recordCuratorRemoval,
    };
  },
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
    mocks.postCollectionsEnabled = null;
    mocks.postCollectionIds = [];
  });

  it("lists other users' curating collections only while the picker is open, without the viewer's own", async () => {
    // A malformed key from Nexus is dropped instead of throwing out of the render.
    mocks.postCollectionIds = [
      'other-user:collection9',
      'current-user:collection1',
      'malformed',
      'another-user:collection3',
    ];

    const open = renderHook(() => usePostSaveTargets('author:post1', { isPickerOpen: true }));

    expect(mocks.postCollectionsEnabled).toBe(true);
    expect(open.result.current.otherCollectionIds).toEqual(['other-user:collection9', 'another-user:collection3']);
    expect(open.result.current.hasMoreOtherCollections).toBe(true);

    await act(async () => {
      await open.result.current.loadMoreOtherCollections();
    });
    expect(mocks.loadMoreOtherCollections).toHaveBeenCalledTimes(1);
    expect(mocks.loadMoreCollections).not.toHaveBeenCalled();

    renderHook(() => usePostSaveTargets('author:post1', { isPickerOpen: false }));
    expect(mocks.postCollectionsEnabled).toBe(false);
  });

  it('keeps Load more reachable after a page that filtered down to nothing', () => {
    // A page of muted or own collections can leave no visible row while the stream still
    // has more; the settled `hasMore` from the paginator is what the picker must follow.
    mocks.postCollectionIds = ['current-user:collection1'];

    const { result } = renderHook(() => usePostSaveTargets('author:post1', { isPickerOpen: true }));

    expect(result.current.otherCollectionIds).toEqual([]);
    expect(result.current.hasMoreOtherCollections).toBe(true);
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
    // The curators list is told about the removal so its pages overlap the shifted list.
    expect(mocks.recordCuratorRemoval).toHaveBeenCalledTimes(1);
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
    // An addition lands at the top of the curators list; the offset needs no repair.
    expect(mocks.recordCuratorRemoval).not.toHaveBeenCalled();
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      title: 'Post added to collection.',
    });
  });

  it('leaves the curators list alone when a removal fails', async () => {
    mocks.commitUpdateCollectionItem.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => usePostSaveTargets('author:post1'));

    await act(async () => {
      await result.current.toggleCollection('author:collection1');
    });

    expect(mocks.recordCuratorRemoval).not.toHaveBeenCalled();
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
