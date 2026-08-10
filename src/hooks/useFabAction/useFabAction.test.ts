import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFeedOptimisticStore } from '@/stores/feedOptimistic/feedOptimistic.store';
import { useFabAction } from './useFabAction';

const ME = 'me-pubky';

const mocks = vi.hoisted(() => ({
  pathname: '/home',
  currentUserPubky: 'me-pubky' as string | null,
  commitUpdateCollectionItem: vi.fn(),
  commitCreate: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
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
    commitCreate: (...args: unknown[]) => mocks.commitCreate(...args),
  },
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));
vi.mock('@/libs/logger/logger', async () => {
  const actual = await vi.importActual<typeof import('@/libs/logger/logger')>('@/libs/logger/logger');
  return {
    ...actual,
    Logger: { ...actual.Logger, error: vi.fn() },
  };
});

describe('useFabAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = '/home';
    mocks.currentUserPubky = ME;
    mocks.commitUpdateCollectionItem.mockResolvedValue(undefined);
    mocks.commitCreate.mockResolvedValue(undefined);
    useFeedOptimisticStore.setState({ pendingByKey: {} });
  });

  describe('action resolution', () => {
    it('creates a collection on the collections overview route', () => {
      mocks.pathname = '/collections';
      const { result } = renderHook(() => useFabAction());
      expect(result.current).toEqual({ kind: 'createCollection', ariaLabel: 'New collection' });
    });

    it('defaults to a plain new post on unrelated routes', () => {
      mocks.pathname = '/home';
      const { result } = renderHook(() => useFabAction());
      expect(result.current).toMatchObject({ kind: 'createPost', ariaLabel: 'New post' });
      if (result.current.kind === 'createPost') {
        expect(result.current.onPostCreated).toBeUndefined();
      }
    });

    it('targets the bookmarks feed on the bookmarks route', () => {
      mocks.pathname = '/collections/bookmarks';
      const { result } = renderHook(() => useFabAction());
      expect(result.current).toMatchObject({ kind: 'createPost', ariaLabel: 'New bookmark' });
      if (result.current.kind === 'createPost') {
        expect(result.current.onPostCreated).toBeTypeOf('function');
      }
    });

    it('targets the collection on an owned single-collection route', () => {
      mocks.pathname = `/collections/${ME}/post1`;
      const { result } = renderHook(() => useFabAction());
      expect(result.current).toMatchObject({ kind: 'createPost', ariaLabel: 'New post in collection' });
      if (result.current.kind === 'createPost') {
        expect(result.current.onPostCreated).toBeTypeOf('function');
      }
    });

    it('falls back to a plain post on a non-owned collection route', () => {
      mocks.pathname = '/collections/other-pubky/post1';
      const { result } = renderHook(() => useFabAction());
      expect(result.current).toMatchObject({ kind: 'createPost', ariaLabel: 'New post' });
      if (result.current.kind === 'createPost') {
        expect(result.current.onPostCreated).toBeUndefined();
      }
    });

    it('falls back to a plain post on an owned route when signed out', () => {
      mocks.currentUserPubky = null;
      mocks.pathname = `/collections/${ME}/post1`;
      const { result } = renderHook(() => useFabAction());
      expect(result.current).toMatchObject({ kind: 'createPost', ariaLabel: 'New post' });
    });
  });

  describe('onPostCreated', () => {
    it('adds the created post to the collection, enqueues it, and toasts success', async () => {
      mocks.pathname = `/collections/${ME}/post1`;
      const { result } = renderHook(() => useFabAction());
      const action = result.current;
      if (action.kind !== 'createPost' || !action.onPostCreated) throw new Error('expected a createPost save handler');
      const onPostCreated = action.onPostCreated;

      await act(async () => {
        await onPostCreated('author:newpost');
      });

      expect(mocks.commitUpdateCollectionItem).toHaveBeenCalledWith({
        collectionId: `${ME}:post1`,
        postId: 'author:newpost',
        shouldAdd: true,
      });
      expect(useFeedOptimisticStore.getState().pendingByKey[`collection:${ME}:post1`]).toEqual(['author:newpost']);
      expect(mocks.toast).toHaveBeenCalledWith({ title: 'Success', description: 'Post added to collection.' });
    });

    it('bookmarks the created post, enqueues it, and toasts', async () => {
      mocks.pathname = '/collections/bookmarks';
      const { result } = renderHook(() => useFabAction());
      const action = result.current;
      if (action.kind !== 'createPost' || !action.onPostCreated) throw new Error('expected a createPost save handler');
      const onPostCreated = action.onPostCreated;

      await act(async () => {
        await onPostCreated('author:bp');
      });

      expect(mocks.commitCreate).toHaveBeenCalledWith({ postId: 'author:bp', userId: ME });
      expect(useFeedOptimisticStore.getState().pendingByKey.bookmarks).toEqual(['author:bp']);
      expect(mocks.toast).toHaveBeenCalledWith({ title: 'Post saved to bookmarks' });
    });

    it('surfaces an error and skips bookmarking when the pubky is missing', async () => {
      // Bookmarks still binds onPostCreated when signed out, so the handler must
      // guard against a missing pubky (e.g. sign-out racing the create).
      mocks.currentUserPubky = null;
      mocks.pathname = '/collections/bookmarks';
      const { result } = renderHook(() => useFabAction());
      const action = result.current;
      if (action.kind !== 'createPost' || !action.onPostCreated) throw new Error('expected a createPost save handler');
      const onPostCreated = action.onPostCreated;

      await act(async () => {
        await onPostCreated('author:bp');
      });

      expect(mocks.commitCreate).not.toHaveBeenCalled();
      expect(useFeedOptimisticStore.getState().pendingByKey.bookmarks).toBeUndefined();
      expect(mocks.toast).toHaveBeenCalledWith({ variant: 'error', description: 'Sign in to bookmark posts' });
    });

    it('shows an error toast and does not enqueue when the collection save fails', async () => {
      mocks.commitUpdateCollectionItem.mockRejectedValue(new Error('boom'));
      mocks.pathname = `/collections/${ME}/post1`;
      const { result } = renderHook(() => useFabAction());
      const action = result.current;
      if (action.kind !== 'createPost' || !action.onPostCreated) throw new Error('expected a createPost save handler');
      const onPostCreated = action.onPostCreated;

      await act(async () => {
        await onPostCreated('author:x');
      });

      expect(mocks.toast).toHaveBeenCalledWith({ variant: 'error', description: 'Failed to update collection.' });
      expect(useFeedOptimisticStore.getState().pendingByKey[`collection:${ME}:post1`]).toBeUndefined();
    });
  });
});
