import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COLLECTION_LAYOUT } from '@/config/collections';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { usePostSaveTargets } from './usePostSaveTargets';

const mocks = vi.hoisted(() => ({
  commitUpdateCollectionItem: vi.fn(),
  commitCreateCollection: vi.fn(),
  toggleBookmark: vi.fn(),
  toast: vi.fn(),
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

vi.mock('@/molecules/Toaster/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: 'current-user' }),
}));
describe('usePostSaveTargets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(mocks.toast).toHaveBeenCalledWith({
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
    expect(mocks.toast).toHaveBeenCalledWith({
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

    expect(mocks.toast).toHaveBeenCalledWith({
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
      layout: COLLECTION_LAYOUT.GRID,
    });
  });
});
