import { act, renderHook, waitFor } from '@testing-library/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TagCacheController } from '@/controllers/tag/tag-cache';
import { NetworkErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { TagCollectionModelSchema } from '@/models/shared/tag/tag.schema';
import { toast } from '@/molecules/Toaster/toast';
import { useTagCache } from './useTagCache';

// Control database observations and pending I/O independently of React's lifecycle.
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: vi.fn() }));
vi.mock('@/controllers/tag/tag-cache', () => ({
  TagCacheController: { get: vi.fn(), getOrFetch: vi.fn(), getOrFetchNext: vi.fn() },
}));
vi.mock('@/molecules/Toaster/toast');

const cachedRecord = {
  id: 'profile',
  tags: [{ label: 'pubky', taggers: [], taggers_count: 1, relationship: false }],
  cache: { cursor: 1, exhausted: false, fetchedAt: 1, revision: 1, viewerId: 'viewer' },
} satisfies TagCollectionModelSchema<string>;

type HookParams = { kind: 'post' | 'user'; id: string; viewerId: string | null };
const initialParams: HookParams = { kind: 'user', id: 'profile', viewerId: 'viewer' };

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function offlineError() {
  return Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Network unavailable', {
    service: ErrorService.Nexus,
    operation: 'fetchTags',
  });
}

describe('useTagCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useLiveQuery).mockReset().mockReturnValue(null);
    vi.mocked(TagCacheController.getOrFetch).mockReset().mockResolvedValue(undefined);
    vi.mocked(TagCacheController.getOrFetchNext).mockReset().mockResolvedValue(undefined);
  });

  describe('initial loading', () => {
    it('projects unchanged and updated local observations', async () => {
      vi.mocked(useLiveQuery).mockReturnValue(cachedRecord);
      const { result, rerender } = renderHook(() => useTagCache('user', 'profile', 'viewer'));
      const tags = result.current.record?.tags;

      await act(async () => {});
      rerender();

      expect(result.current.record?.tags).toEqual(tags);

      vi.mocked(useLiveQuery).mockReturnValue({
        ...cachedRecord,
        tags: [{ ...cachedRecord.tags[0], taggers_count: 2 }],
      });
      rerender();

      expect(result.current.record?.tags[0].taggers_count).toBe(2);
      expect(result.current.record?.tags).not.toBe(tags);
    });

    it.each(['other-viewer', null])(
      'projects retained observations for the new viewer %s immediately',
      async (viewerId) => {
        vi.mocked(useLiveQuery).mockReturnValue({
          ...cachedRecord,
          tags: [{ ...cachedRecord.tags[0], taggers: ['viewer'], relationship: true }],
        });
        const { result, rerender } = renderHook((viewer: string | null) => useTagCache('user', 'profile', viewer), {
          initialProps: initialParams.viewerId,
        });
        await act(async () => {});
        expect(result.current.record?.tags[0].relationship).toBe(true);
        rerender(viewerId);
        expect(result.current.record?.tags[0].relationship).toBe(false);
        await act(async () => {});
      },
    );

    it.each([true, false])(
      'projects the current viewer pending intent (%s) without mutating shared data',
      async (relationship) => {
        const shared = {
          ...cachedRecord,
          mutations: {
            other: {
              id: 'other-viewer-operation',
              synced: true,
              label: 'pubky',
              viewerId: 'other-viewer',
              relationship,
              expiresAt: Date.now() + 60_000,
            },
          },
        };
        vi.mocked(useLiveQuery).mockReturnValue(shared);
        const { result } = renderHook(() => useTagCache('user', 'profile', 'other-viewer'));
        expect(result.current.record?.tags[0].relationship).toBe(relationship);
        expect(shared.tags[0].relationship).toBe(false);
        await act(async () => {});
      },
    );

    it('contains a local read failure so the query does not reject into React', async () => {
      vi.mocked(TagCacheController.get).mockRejectedValueOnce(offlineError());
      renderHook(() => useTagCache('user', 'profile', null));
      const query = vi.mocked(useLiveQuery).mock.calls[0][0];
      await expect(query()).resolves.toBeNull();
    });

    it('filters expired intent in the local observation without changing the persisted record', async () => {
      const active = {
        id: 'viewer-operation',
        synced: true,
        label: 'pubky',
        viewerId: 'viewer',
        relationship: true,
        expiresAt: Date.now() + 60_000,
      };
      const shared = { ...cachedRecord, mutations: { active, expired: { ...active, expiresAt: 0 } } };
      vi.mocked(TagCacheController.get).mockResolvedValueOnce(shared);
      renderHook(() => useTagCache('user', 'profile', 'viewer'));
      const query = vi.mocked(useLiveQuery).mock.calls[0][0];
      await expect(query()).resolves.toEqual({ ...shared, mutations: { active } });
      expect(shared.mutations.expired).toBeDefined();
      await act(async () => {});
    });

    it.each([null, undefined])('does not load or paginate without an ID (%s)', async (id) => {
      const { result } = renderHook(() => useTagCache('user', id, null));

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isLoadingMore).toBe(false);
      await act(() => result.current.loadMore());
      expect(TagCacheController.getOrFetch).not.toHaveBeenCalled();
      expect(TagCacheController.getOrFetchNext).not.toHaveBeenCalled();
    });

    it('remains loading until the first local query resolves', async () => {
      vi.mocked(useLiveQuery).mockReturnValue(undefined);
      const { result, rerender } = renderHook(() => useTagCache('user', 'profile', null));
      await act(async () => {});
      expect(result.current.isLoading).toBe(true);

      vi.mocked(useLiveQuery).mockReturnValue({ id: 'profile', tags: [] });
      rerender();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.record?.tags).toEqual([]);
    });

    it('keeps a missing collection loading until initialization settles', async () => {
      const request = deferred();
      vi.mocked(TagCacheController.getOrFetch).mockReturnValue(request.promise);
      const { result } = renderHook(() => useTagCache('user', 'profile', null));

      expect(result.current.isLoading).toBe(true);
      expect(TagCacheController.getOrFetch).toHaveBeenCalledWith({
        kind: 'user',
        id: 'profile',
        viewerId: undefined,
      });
      await act(async () => request.resolve());
      expect(result.current.isLoading).toBe(false);
    });

    it('keeps cached tags visible while initialization is pending', async () => {
      const request = deferred();
      vi.mocked(useLiveQuery).mockReturnValue(cachedRecord);
      vi.mocked(TagCacheController.getOrFetch).mockReturnValue(request.promise);
      const { result } = renderHook(() => useTagCache('user', 'profile', 'viewer'));

      expect(result.current.record).toEqual(cachedRecord);
      expect(result.current.isLoading).toBe(false);
      await act(async () => request.resolve());
    });

    it('hides the previous profile while the new local query is unresolved', async () => {
      vi.mocked(useLiveQuery).mockReturnValue({
        ...cachedRecord,
        cache: { ...cachedRecord.cache, exhausted: true },
      });
      const { result, rerender } = renderHook((id) => useTagCache('user', id, 'viewer'), {
        initialProps: 'profile',
      });
      await act(async () => {});
      // Dexie's observable retains its previous result until the new query emits.
      rerender('other-profile');
      expect(result.current.record).toBeUndefined();
      expect(result.current.isLoading).toBe(true);

      vi.mocked(useLiveQuery).mockReturnValue({ id: 'other-profile', tags: [] });
      rerender('other-profile');
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.record?.tags).toEqual([]);
    });

    it.each([
      { name: 'a cold cache', record: null },
      { name: 'cached tags', record: cachedRecord },
    ])('settles an initialization failure with $name', async ({ record }) => {
      vi.mocked(useLiveQuery).mockReturnValue(record);
      vi.mocked(TagCacheController.getOrFetch).mockRejectedValueOnce(offlineError());
      const { result } = renderHook(() => useTagCache('user', 'profile', 'viewer'));
      await act(async () => {});

      expect(result.current.isLoading).toBe(false);
      expect(result.current.record).toEqual(record);
      expect(toast).not.toHaveBeenCalled();
    });

    it.each<HookParams>([
      { ...initialParams, id: 'other-profile' },
      { ...initialParams, viewerId: 'other-viewer' },
      { kind: 'post', id: 'author:post', viewerId: 'viewer' },
    ])('ignores an old initialization after changing to $kind/$id/$viewerId', async (nextParams) => {
      const previous = deferred();
      const current = deferred();
      vi.mocked(TagCacheController.getOrFetch)
        .mockReturnValueOnce(previous.promise)
        .mockReturnValueOnce(current.promise);
      const { result, rerender } = renderHook(({ kind, id, viewerId }) => useTagCache(kind, id, viewerId), {
        initialProps: initialParams,
      });

      rerender(nextParams);
      expect(TagCacheController.getOrFetch).toHaveBeenLastCalledWith(nextParams);
      await act(async () => previous.resolve());
      expect(result.current.isLoading).toBe(true);
      await act(async () => current.resolve());
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('pagination', () => {
    beforeEach(() => vi.mocked(useLiveQuery).mockReturnValue(cachedRecord));

    it('deduplicates concurrent load-more calls and keeps loading until the request settles', async () => {
      const request = deferred();
      vi.mocked(TagCacheController.getOrFetchNext).mockReturnValue(request.promise);
      const { result } = renderHook(() => useTagCache('user', 'profile', 'viewer'));
      let first!: Promise<void>;
      act(() => {
        first = result.current.loadMore();
        void result.current.loadMore();
      });

      expect(result.current.isLoadingMore).toBe(true);
      expect(TagCacheController.getOrFetchNext).toHaveBeenCalledTimes(1);
      expect(TagCacheController.getOrFetchNext).toHaveBeenCalledWith(initialParams);
      await act(async () => {
        request.resolve();
        await first;
      });
      expect(result.current.isLoadingMore).toBe(false);
    });

    it('does not request another page from an exhausted collection', async () => {
      vi.mocked(useLiveQuery).mockReturnValue({
        ...cachedRecord,
        cache: { ...cachedRecord.cache, exhausted: true },
      });
      const { result } = renderHook(() => useTagCache('user', 'profile', 'viewer'));
      await act(() => result.current.loadMore());
      expect(TagCacheController.getOrFetchNext).not.toHaveBeenCalled();
      expect(result.current.isLoadingMore).toBe(false);
    });

    it('retains tags on failure, shows a generic error, and allows retry', async () => {
      vi.mocked(TagCacheController.getOrFetchNext).mockRejectedValueOnce(offlineError());
      const { result } = renderHook(() => useTagCache('user', 'profile', 'viewer'));
      await act(() => result.current.loadMore());

      expect(result.current.record).toEqual(cachedRecord);
      expect(result.current.isLoadingMore).toBe(false);
      expect(toast).toHaveBeenCalledExactlyOnceWith({ variant: 'error', description: 'Could not load more tags' });
      await act(() => result.current.loadMore());
      expect(TagCacheController.getOrFetchNext).toHaveBeenCalledTimes(2);
      expect(result.current.isLoadingMore).toBe(false);
    });

    it.each<HookParams>([
      { ...initialParams, id: 'other-profile' },
      { ...initialParams, viewerId: 'other-viewer' },
    ])('keeps the new page request active when the previous $id/$viewerId request fails', async (nextParams) => {
      const previous = deferred();
      const current = deferred();
      vi.mocked(TagCacheController.getOrFetchNext)
        .mockReturnValueOnce(previous.promise)
        .mockReturnValueOnce(current.promise);
      const { result, rerender } = renderHook(({ kind, id, viewerId }) => useTagCache(kind, id, viewerId), {
        initialProps: initialParams,
      });
      let previousPage!: Promise<void>;
      act(() => {
        previousPage = result.current.loadMore();
      });
      rerender(nextParams);
      expect(result.current.isLoadingMore).toBe(false);
      let currentPage!: Promise<void>;
      act(() => {
        currentPage = result.current.loadMore();
      });
      await act(async () => {
        previous.reject(offlineError());
        await previousPage;
      });

      expect(toast).not.toHaveBeenCalled();
      expect(result.current.isLoadingMore).toBe(true);
      await act(async () => {
        current.resolve();
        await currentPage;
      });
      expect(result.current.isLoadingMore).toBe(false);
    });

    it('does not show an error for a page request after unmount', async () => {
      const request = deferred();
      vi.mocked(TagCacheController.getOrFetchNext).mockReturnValue(request.promise);
      const { result, unmount } = renderHook(() => useTagCache('user', 'profile', 'viewer'));
      let page!: Promise<void>;
      act(() => {
        page = result.current.loadMore();
      });
      await waitFor(() => expect(result.current.isLoadingMore).toBe(true));
      unmount();
      await act(async () => {
        request.reject(offlineError());
        await page;
      });
      expect(toast).not.toHaveBeenCalled();
    });
  });
});
