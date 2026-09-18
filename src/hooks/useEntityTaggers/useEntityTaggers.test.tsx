import { useEffect } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TagKind } from '@/application/tag/tag.types';
import { PostController } from '@/controllers/post/post';
import { TagController } from '@/controllers/tag/tag';
import { UserController } from '@/controllers/user/user';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import type { ViewerTagMutation } from '@/services/local/tag/tag.types';
import type { NexusTaggers } from '@/services/nexus/nexus.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { mergeTaggerIds, useEntityTaggers } from './useEntityTaggers';

vi.mock('@/controllers/post/post', () => ({
  PostController: {
    fetchTaggers: vi.fn(),
  },
}));

vi.mock('@/controllers/user/user', () => ({
  UserController: {
    fetchTaggers: vi.fn(),
  },
}));

const observed = vi.hoisted(
  (): { entries: Map<string, ViewerTagMutation> | null; loading: boolean; listeners: Set<() => void> } => ({
    entries: new Map(),
    loading: false,
    listeners: new Set(),
  }),
);
vi.mock('dexie-react-hooks', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useLiveQuery: vi.fn(function useLiveQuery(_query: unknown, [id, kind, viewer]: string[]) {
      const entries = useSyncExternalStore(
        (listener) => {
          observed.listeners.add(listener);
          return () => {
            observed.listeners.delete(listener);
          };
        },
        () => observed.entries,
      );
      return observed.loading ? undefined : { key: `${kind}:${id}:${viewer}`, entries };
    }),
  };
});
vi.mock('@/controllers/tag/tag', () => ({ TagController: { getViewerMutations: vi.fn() } }));
const publishMutation = ({
  label,
  op,
  taggersCount = 0,
}: {
  pubky: string;
  taggedId: string;
  label: string;
  op: HttpMethod;
  taggersCount?: number;
}) => {
  observed.entries = new Map(observed.entries).set(label.toLowerCase(), {
    id: crypto.randomUUID(),
    relationship: op === HttpMethod.PUT,
    expiresAt: Date.now() + 300_000,
    taggersCount,
  });
  observed.listeners.forEach((listener) => listener());
};

const TAGGERS_PAGE_SIZE = 50;
const TAGGERS_MAX_SKIP = 10_000;

const page = (users: string[]): NexusTaggers => ({ users, relationship: false });
const fullPage = (prefix: string) => Array.from({ length: TAGGERS_PAGE_SIZE }, (_, index) => `${prefix}-${index}`);

describe('useEntityTaggers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ currentUserPubky: null });
    observed.entries = new Map();
    observed.loading = false;
  });

  it('waits for local viewer intent before loading an expanded list', async () => {
    useAuthStore.setState({ currentUserPubky: 'viewer' });
    observed.loading = true;
    vi.mocked(PostController.fetchTaggers).mockResolvedValue(page(['other']));
    const { result, rerender } = renderHook(() => {
      const hook = useEntityTaggers('author:post', TagKind.POST);
      const { loadTaggers } = hook;
      useEffect(() => {
        void loadTaggers('bitcoin', 2);
      }, [loadTaggers]);
      return hook;
    });
    expect(PostController.fetchTaggers).not.toHaveBeenCalled();
    observed.loading = false;
    observed.entries = new Map([
      [
        'bitcoin',
        {
          id: 'pending',
          relationship: true,
          expiresAt: Date.now() + 300_000,
          taggersCount: 2,
        },
      ],
    ]);
    rerender();
    await waitFor(() => expect(result.current.taggerStates.get('bitcoin')?.hasFetched).toBe(true));
    expect(result.current.taggerStates.get('bitcoin')?.isViewerTagger).toBe(true);
    expect(PostController.fetchTaggers).toHaveBeenCalledOnce();
  });

  it('opens the server fallback when the initial local mutation read fails', async () => {
    useAuthStore.setState({ currentUserPubky: 'viewer' });
    observed.loading = true;
    vi.mocked(TagController.getViewerMutations).mockRejectedValueOnce(
      Err.database(DatabaseErrorCode.QUERY_FAILED, 'Local mutations unavailable', {
        service: ErrorService.Local,
        operation: 'getViewerMutations',
      }),
    );
    vi.mocked(PostController.fetchTaggers).mockResolvedValue({ users: ['viewer'], relationship: true });
    const { result, rerender } = renderHook(() => {
      const hook = useEntityTaggers('author:post', TagKind.POST);
      const { loadTaggers } = hook;
      useEffect(() => {
        void loadTaggers('bitcoin', 1);
      }, [loadTaggers]);
      return hook;
    });
    expect(PostController.fetchTaggers).not.toHaveBeenCalled();

    const query = vi.mocked(useLiveQuery).mock.calls[0][0];
    await expect(query()).resolves.toEqual({ key: 'post:author:post:viewer', entries: null });
    expect(TagController.getViewerMutations).toHaveBeenCalledWith({
      taggedId: 'author:post',
      taggedKind: TagKind.POST,
      taggerId: 'viewer',
    });
    observed.loading = false;
    observed.entries = null;
    rerender();

    await waitFor(() => expect(result.current.taggerStates.get('bitcoin')?.hasFetched).toBe(true));
    expect(PostController.fetchTaggers).toHaveBeenCalledOnce();
    expect(result.current.taggerStates.get('bitcoin')).toMatchObject({
      ids: ['viewer'],
      isViewerTagger: true,
      isLoading: false,
      hasError: false,
    });
  });

  it('stays disabled without complete entity context', async () => {
    const { result } = renderHook(() => useEntityTaggers('profile-pubky', null));

    await act(async () => {
      await result.current.loadTaggers('bitcoin', 2);
      await result.current.loadMoreTaggers('bitcoin');
    });

    expect(result.current.taggerStates.size).toBe(0);
    expect(PostController.fetchTaggers).not.toHaveBeenCalled();
    expect(UserController.fetchTaggers).not.toHaveBeenCalled();
  });

  it('fetches the first page of post taggers from the post controller', async () => {
    vi.mocked(PostController.fetchTaggers).mockResolvedValue(page(['tagger-1', 'tagger-2']));
    const { result } = renderHook(() => useEntityTaggers('author:post-id', TagKind.POST));

    await act(async () => {
      await result.current.loadTaggers('Bitcoin', 2);
    });

    expect(PostController.fetchTaggers).toHaveBeenCalledWith({
      compositeId: 'author:post-id',
      label: 'Bitcoin',
      skip: 0,
      limit: TAGGERS_PAGE_SIZE,
    });
    expect(UserController.fetchTaggers).not.toHaveBeenCalled();
    expect(result.current.taggerStates.get('bitcoin')?.ids).toEqual(['tagger-1', 'tagger-2']);
    expect(result.current.taggerStates.get('bitcoin')).toMatchObject({
      skip: 2,
      isLoading: false,
      hasMore: false,
      hasFetched: true,
      totalCount: 2,
    });
  });

  it('fetches profile taggers from the user controller and pages on demand', async () => {
    const firstPage = fullPage('first');
    vi.mocked(UserController.fetchTaggers)
      .mockResolvedValueOnce(page(firstPage))
      .mockResolvedValueOnce(page(['last-1', 'last-2']));
    const { result } = renderHook(() => useEntityTaggers('profile-pubky', TagKind.USER));

    await act(async () => {
      await result.current.loadTaggers('Synonym', TAGGERS_PAGE_SIZE + 2);
    });

    expect(UserController.fetchTaggers).toHaveBeenNthCalledWith(1, {
      user_id: 'profile-pubky',
      label: 'Synonym',
      skip: 0,
      limit: TAGGERS_PAGE_SIZE,
    });
    expect(result.current.taggerStates.get('synonym')).toMatchObject({ hasMore: true, skip: TAGGERS_PAGE_SIZE });

    await act(async () => {
      await result.current.loadMoreTaggers('Synonym');
    });

    expect(UserController.fetchTaggers).toHaveBeenNthCalledWith(2, {
      user_id: 'profile-pubky',
      label: 'Synonym',
      skip: TAGGERS_PAGE_SIZE,
      limit: TAGGERS_PAGE_SIZE,
    });
    expect(PostController.fetchTaggers).not.toHaveBeenCalled();
    expect(result.current.taggerStates.get('synonym')?.ids).toEqual([...firstPage, 'last-1', 'last-2']);
    expect(result.current.taggerStates.get('synonym')).toMatchObject({ hasMore: false, hasFetched: true });
  });

  it('checks the endpoint for exhaustion even when a full page matches the cached count', async () => {
    vi.mocked(UserController.fetchTaggers)
      .mockResolvedValueOnce(page(fullPage('only')))
      .mockResolvedValueOnce(page([]));
    const { result } = renderHook(() => useEntityTaggers('profile-pubky', TagKind.USER));

    await act(async () => {
      await result.current.loadTaggers('bitcoin', TAGGERS_PAGE_SIZE);
    });
    await act(async () => {
      await result.current.loadMoreTaggers('bitcoin');
    });

    expect(UserController.fetchTaggers).toHaveBeenCalledTimes(2);
    expect(result.current.taggerStates.get('bitcoin')?.hasMore).toBe(false);
  });

  it('loads beyond an outdated count instead of hiding the remaining taggers', async () => {
    const users = [...fullPage('user'), 'last-user'];
    vi.mocked(UserController.fetchTaggers).mockImplementation(async ({ skip = 0, limit = 50 }) =>
      page(users.slice(skip, skip + limit)),
    );
    const { result } = renderHook(() => useEntityTaggers('profile', TagKind.USER));
    await act(async () => {
      await result.current.loadTaggers('bitcoin', 50);
    });
    await act(async () => {
      await result.current.loadMoreTaggers('bitcoin');
    });
    expect(result.current.taggerStates.get('bitcoin')?.ids).toEqual(users);
  });

  it('refreshes an exhausted list when its count changes', async () => {
    let users = ['first'];
    vi.mocked(UserController.fetchTaggers).mockImplementation(async ({ skip = 0, limit = 50 }) =>
      page(users.slice(skip, skip + limit)),
    );
    const { result } = renderHook(() => useEntityTaggers('profile', TagKind.USER));
    await act(async () => {
      await result.current.loadTaggers('bitcoin', 1);
    });
    users = ['first', 'second'];
    await act(async () => {
      await result.current.loadTaggers('bitcoin', 2);
    });
    expect(result.current.taggerStates.get('bitcoin')?.ids).toEqual(users);
  });

  it.each([TagKind.USER, TagKind.POST])('revalidates cached %s pages when the count changes', async (kind) => {
    let users = [...fullPage('user'), 'last-user'];
    const offsets: number[] = [];
    const fetchPage = async ({ skip = 0, limit = 50 }: { skip?: number; limit?: number }) => {
      offsets.push(skip);
      return page(users.slice(skip, skip + limit));
    };
    vi.mocked(PostController.fetchTaggers).mockImplementation(fetchPage);
    vi.mocked(UserController.fetchTaggers).mockImplementation(fetchPage);
    const { result } = renderHook(() => useEntityTaggers(kind === TagKind.POST ? 'author:post' : 'profile', kind));
    await act(async () => {
      await result.current.loadTaggers('bitcoin', 51);
    });
    await act(async () => {
      await result.current.loadMoreTaggers('bitcoin');
    });
    expect(result.current.taggerStates.get('bitcoin')?.ids).toEqual(users);

    users = [...users, 'new-user'];
    await act(async () => {
      await result.current.loadTaggers('bitcoin', 52);
    });

    expect(result.current.taggerStates.get('bitcoin')?.ids).toEqual(users);
    expect(offsets).toEqual([0, 50, 0, 50]);
  });

  it('uses server membership again after a local mutation expires', async () => {
    useAuthStore.setState({ currentUserPubky: 'viewer' });
    publishMutation({ pubky: 'viewer', taggedId: 'profile', label: 'bitcoin', op: HttpMethod.PUT });
    vi.mocked(UserController.fetchTaggers).mockResolvedValue(page(['other']));
    const { result } = renderHook(() => useEntityTaggers('profile', TagKind.USER));
    await act(async () => {
      await result.current.loadTaggers('bitcoin', 1);
    });
    expect(result.current.taggerStates.get('bitcoin')?.isViewerTagger).toBe(true);

    // The live query emits after expired intent is removed from the row.
    act(() => {
      observed.entries = new Map();
      observed.listeners.forEach((listener) => listener());
    });
    await act(async () => {
      await result.current.loadTaggers('bitcoin', 1);
    });
    expect(result.current.taggerStates.get('bitcoin')?.isViewerTagger).toBe(false);
  });

  describe.each([TagKind.USER, TagKind.POST])('local count notifications for %s', (kind) => {
    it.each(['create', 'delete', 'remote change', 'unchanged count rollback', 'failed page'] as const)(
      'does not repeat pages for the same local change: %s',
      async (scenario) => {
        useAuthStore.setState({ currentUserPubky: 'viewer' });
        const taggedId = kind === TagKind.POST ? 'author:post' : 'profile';
        const deleting = scenario === 'delete';
        let users = [...fullPage('user'), 'last-user'];
        if (deleting) users[10] = 'viewer';
        const offsets: number[] = [];
        let refreshing = false;
        let paused = false;
        let resume = () => {};
        const fetchPage = async ({ skip = 0 }: { skip?: number }): Promise<NexusTaggers> => {
          offsets.push(skip);
          if (refreshing && skip === 49 && !paused) {
            paused = true;
            await new Promise<void>((resolve) => {
              resume = resolve;
            });
            if (scenario === 'failed page') throw new Error('page unavailable');
          }
          return { users: users.slice(skip, skip + 50), relationship: users.includes('viewer') };
        };
        vi.mocked(UserController.fetchTaggers).mockImplementation(fetchPage);
        vi.mocked(PostController.fetchTaggers).mockImplementation(fetchPage);
        const { result, unmount } = renderHook(() => useEntityTaggers(taggedId, kind));
        try {
          await act(async () => {
            await result.current.loadTaggers('bitcoin', 51);
          });
          await act(async () => {
            await result.current.loadMoreTaggers('bitcoin');
          });
          offsets.length = 0;
          refreshing = true;
          users = deleting ? users.filter((id) => id !== 'viewer') : [...users, 'viewer'];
          const count = users.length;
          act(() => {
            publishMutation({
              pubky: 'viewer',
              taggedId,
              label: 'bitcoin',
              op: deleting ? HttpMethod.DELETE : HttpMethod.PUT,
              ...(scenario !== 'unchanged count rollback' && { taggersCount: count }),
            });
          });
          await waitFor(() => expect(paused).toBe(true));
          const observedCount = scenario === 'remote change' ? count + 1 : count;
          if (scenario === 'remote change') users = [...users, 'remote-user'];
          let update = Promise.resolve();
          act(() => {
            update = result.current.loadTaggers('bitcoin', observedCount);
          });
          await act(async () => {
            resume();
            await update;
          });
          await waitFor(() => expect(result.current.taggerStates.get('bitcoin')?.isLoading).toBe(false));
          const separateChange = scenario === 'remote change' || scenario === 'unchanged count rollback';
          expect(offsets).toEqual(separateChange ? [0, 49, 0, 49] : [0, 49]);
          // The completed/failed request must keep the newer count, so rerenders
          // neither restart a successful window nor automatically retry a failure.
          await act(async () => {
            await result.current.loadTaggers('bitcoin', observedCount);
          });
          expect(offsets).toHaveLength(separateChange ? 4 : 2);
          if (scenario === 'failed page') {
            expect(result.current.taggerStates.get('bitcoin')?.hasError).toBe(true);
            await act(async () => {
              await result.current.loadMoreTaggers('bitcoin');
            });
            expect(offsets).toEqual([0, 49, 0, 49]);
          }
          expect(result.current.taggerStates.get('bitcoin')?.ids).toEqual(users);
          expect(result.current.taggerStates.get('bitcoin')?.hasError).toBe(false);
        } finally {
          resume();
          unmount();
        }
      },
    );
  });

  it('does not skip a boundary tagger when membership shrinks between pages', async () => {
    let users = [...fullPage('user'), 'last-user'];
    vi.mocked(UserController.fetchTaggers).mockImplementation(async ({ skip = 0, limit = 50 }) =>
      page(users.slice(skip, skip + limit)),
    );
    const { result } = renderHook(() => useEntityTaggers('profile', TagKind.USER));
    await act(async () => {
      await result.current.loadTaggers('bitcoin', 51);
    });
    users = users.filter((id) => id !== 'user-10');
    await act(async () => {
      await result.current.loadTaggers('bitcoin', 50);
    });
    await act(async () => {
      await result.current.loadMoreTaggers('bitcoin');
    });
    expect(result.current.taggerStates.get('bitcoin')?.ids).toEqual(users);
  });

  it('loads the last allowed offset and stops before exceeding the Nexus skip limit', async () => {
    vi.mocked(UserController.fetchTaggers).mockResolvedValue(page(fullPage('any')));
    const { result } = renderHook(() => useEntityTaggers('profile-pubky', TagKind.USER));

    await act(async () => {
      await result.current.loadTaggers('bitcoin');
    });
    const pagesUntilLimit = TAGGERS_MAX_SKIP / TAGGERS_PAGE_SIZE + 1;
    for (let index = 1; index < pagesUntilLimit + 3; index += 1) {
      await act(async () => {
        await result.current.loadMoreTaggers('bitcoin');
      });
    }

    expect(UserController.fetchTaggers).toHaveBeenCalledTimes(pagesUntilLimit);
    expect(result.current.taggerStates.get('bitcoin')).toMatchObject({
      hasMore: false,
      skip: TAGGERS_MAX_SKIP + TAGGERS_PAGE_SIZE,
    });
  });

  it('deduplicates taggers across pages', async () => {
    vi.mocked(UserController.fetchTaggers)
      .mockResolvedValueOnce(page(fullPage('dup')))
      .mockResolvedValueOnce(page(['dup-0', 'dup-1', 'fresh']));
    const { result } = renderHook(() => useEntityTaggers('profile-pubky', TagKind.USER));

    await act(async () => {
      await result.current.loadTaggers('bitcoin');
    });
    await act(async () => {
      await result.current.loadMoreTaggers('bitcoin');
    });

    expect(result.current.taggerStates.get('bitcoin')?.ids).toEqual([...fullPage('dup'), 'fresh']);
  });

  it('reuses a fetched page for the same total count', async () => {
    vi.mocked(UserController.fetchTaggers).mockResolvedValue(page(['tagger-1']));
    const { result } = renderHook(() => useEntityTaggers('profile-pubky', TagKind.USER));

    await act(async () => {
      await result.current.loadTaggers('bitcoin', 1);
    });
    await act(async () => {
      await result.current.loadTaggers('bitcoin', 1);
    });

    expect(UserController.fetchTaggers).toHaveBeenCalledTimes(1);
  });

  it('retains all loaded rows while refreshing a changed count', async () => {
    const firstPage = fullPage('kept');
    let resolveRefresh: (value: NexusTaggers) => void = () => {};
    vi.mocked(UserController.fetchTaggers)
      .mockResolvedValueOnce(page(firstPage))
      .mockResolvedValueOnce(page(['last']))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve;
          }),
      )
      .mockResolvedValueOnce(page(['last', 'new']));
    const { result } = renderHook(() => useEntityTaggers('profile', TagKind.USER));
    await act(async () => {
      await result.current.loadTaggers('bitcoin', 51);
    });
    await act(async () => {
      await result.current.loadMoreTaggers('bitcoin');
    });
    let pending = Promise.resolve();
    act(() => {
      pending = result.current.loadTaggers('bitcoin', 52);
    });
    expect(result.current.taggerStates.get('bitcoin')?.ids).toEqual([...firstPage, 'last']);
    await act(async () => {
      resolveRefresh(page(firstPage));
      await pending;
    });
    expect(result.current.taggerStates.get('bitcoin')?.ids).toEqual([...firstPage, 'last', 'new']);
  });

  it('retries a failed refresh from zero without automatically looping', async () => {
    const firstPage = fullPage('kept');
    vi.mocked(UserController.fetchTaggers)
      .mockResolvedValueOnce(page(firstPage))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(page(firstPage));
    const { result } = renderHook(() => useEntityTaggers('profile', TagKind.USER));
    await act(async () => {
      await result.current.loadTaggers('bitcoin', 51);
    });
    await act(async () => {
      await result.current.loadTaggers('bitcoin', 52);
    });
    await act(async () => {
      await result.current.loadTaggers('bitcoin', 52);
    });
    expect(UserController.fetchTaggers).toHaveBeenCalledTimes(2);
    expect(result.current.taggerStates.get('bitcoin')?.ids).toEqual(firstPage);
    await act(async () => {
      await result.current.loadMoreTaggers('bitcoin');
    });
    expect(UserController.fetchTaggers).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 0 }));
    expect(result.current.taggerStates.get('bitcoin')?.hasError).toBe(false);
  });

  it('covers deletion indexed after the refreshed prefix without dropping the boundary user', async () => {
    const viewerId = 'user-10';
    useAuthStore.setState({ currentUserPubky: viewerId });
    let users = [...fullPage('user'), 'last'];
    let indexAfterThisRequest = false;
    vi.mocked(UserController.fetchTaggers).mockImplementation(async ({ skip = 0, limit = 50 }) => {
      const response = { users: users.slice(skip, skip + limit), relationship: users.includes(viewerId) };
      if (indexAfterThisRequest) {
        users = users.filter((id) => id !== viewerId);
        indexAfterThisRequest = false;
      }
      return response;
    });
    const { result } = renderHook(() => useEntityTaggers('profile', TagKind.USER));
    await act(async () => {
      await result.current.loadTaggers('bitcoin', 51);
    });
    indexAfterThisRequest = true;
    await act(async () => {
      publishMutation({ pubky: viewerId, taggedId: 'profile', label: 'bitcoin', op: HttpMethod.DELETE });
    });
    // The mutation-triggered refresh saw the old prefix; indexing removed the
    // viewer before the next request. Its boundary must overlap by one.
    await act(async () => {
      await result.current.loadMoreTaggers('bitcoin');
    });
    const state = result.current.taggerStates.get('bitcoin');
    const visible = mergeTaggerIds({
      fetchedIds: state?.ids,
      previewIds: [],
      viewerId,
      isViewerTagger: state?.isViewerTagger,
    });
    expect(visible).toEqual(users);
    expect(visible).toHaveLength(50);
    expect(UserController.fetchTaggers).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 49 }));
  });

  it('downloads each next page only once while indexing a local deletion is delayed', async () => {
    const viewerId = 'user-10';
    useAuthStore.setState({ currentUserPubky: viewerId });
    const users = Array.from({ length: 1000 }, (_, i) => `user-${i}`);
    vi.mocked(UserController.fetchTaggers).mockImplementation(async ({ skip = 0, limit = 50 }) => ({
      users: users.slice(skip, skip + limit),
      relationship: true,
    }));
    const { result } = renderHook(() => useEntityTaggers('profile', TagKind.USER));
    await act(async () => {
      await result.current.loadTaggers('bitcoin', 1000);
    });
    await act(async () => {
      publishMutation({ pubky: viewerId, taggedId: 'profile', label: 'bitcoin', op: HttpMethod.DELETE });
    });
    vi.mocked(UserController.fetchTaggers).mockClear();
    for (let i = 0; i < 30 && result.current.taggerStates.get('bitcoin')?.hasMore; i++) {
      await act(async () => {
        await result.current.loadMoreTaggers('bitcoin');
      });
    }
    const state = result.current.taggerStates.get('bitcoin');
    expect(state?.hasMore).toBe(false);
    expect(
      mergeTaggerIds({ fetchedIds: state?.ids, previewIds: [], viewerId, isViewerTagger: state?.isViewerTagger }),
    ).toEqual(users.filter((id) => id !== viewerId));
    expect(UserController.fetchTaggers).toHaveBeenCalledTimes(20);
    expect(vi.mocked(UserController.fetchTaggers).mock.calls.every(([params]) => params.skip! > 0)).toBe(true);
  });

  it('observes rollback intents even when a background refresh already restored the count', async () => {
    const viewerId = 'viewer';
    useAuthStore.setState({ currentUserPubky: viewerId });
    vi.mocked(UserController.fetchTaggers).mockResolvedValue(page(['peer']));
    const { result } = renderHook(() => useEntityTaggers('profile', TagKind.USER));
    await act(async () => {
      await result.current.loadTaggers('bitcoin', 1);
    });
    await act(async () => {
      publishMutation({ pubky: viewerId, taggedId: 'profile', label: 'bitcoin', op: HttpMethod.PUT });
    });
    await act(async () => {
      await result.current.loadTaggers('bitcoin', 2);
    });
    await act(async () => {
      await result.current.loadTaggers('bitcoin', 1);
    });
    expect(result.current.taggerStates.get('bitcoin')?.isViewerTagger).toBe(true);
    await act(async () => {
      publishMutation({ pubky: viewerId, taggedId: 'profile', label: 'bitcoin', op: HttpMethod.DELETE });
    });
    expect(result.current.taggerStates.get('bitcoin')?.isViewerTagger).toBe(false);
    expect(result.current.taggerStates.get('bitcoin')?.hasMore).toBe(false);
  });

  it('ignores an older request after a same-label count refresh', async () => {
    let resolveOld: (value: NexusTaggers) => void = () => {};
    vi.mocked(UserController.fetchTaggers)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce(page(['fresh', 'new']));
    const { result } = renderHook(() => useEntityTaggers('profile', TagKind.USER));
    let old = Promise.resolve();
    act(() => {
      old = result.current.loadTaggers('bitcoin', 1);
    });
    await act(async () => {
      await result.current.loadTaggers('bitcoin', 2);
    });
    await act(async () => {
      resolveOld(page(['stale']));
      await old;
    });
    expect(result.current.taggerStates.get('bitcoin')?.ids).toEqual(['fresh', 'new']);
  });

  it('keeps already fetched pages and stays retryable when a page fails', async () => {
    const firstPage = fullPage('kept');
    vi.mocked(UserController.fetchTaggers)
      .mockResolvedValueOnce(page(firstPage))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(page(['after-retry']));
    const { result } = renderHook(() => useEntityTaggers('profile-pubky', TagKind.USER));

    await act(async () => {
      await result.current.loadTaggers('bitcoin');
    });
    await act(async () => {
      await result.current.loadMoreTaggers('bitcoin');
    });

    expect(result.current.taggerStates.get('bitcoin')?.ids).toEqual(firstPage);
    expect(result.current.taggerStates.get('bitcoin')).toMatchObject({
      isLoading: false,
      hasMore: true,
      skip: TAGGERS_PAGE_SIZE,
    });

    await act(async () => {
      await result.current.loadMoreTaggers('bitcoin');
    });

    expect(UserController.fetchTaggers).toHaveBeenLastCalledWith(expect.objectContaining({ skip: TAGGERS_PAGE_SIZE }));
    expect(result.current.taggerStates.get('bitcoin')?.ids).toEqual([...firstPage, 'after-retry']);
  });

  it('ignores concurrent calls for a label that is already loading', async () => {
    let resolveRequest: (value: NexusTaggers) => void = () => {};
    vi.mocked(UserController.fetchTaggers).mockReturnValue(
      new Promise<NexusTaggers>((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const { result } = renderHook(() => useEntityTaggers('profile-pubky', TagKind.USER));

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.loadTaggers('bitcoin', 1);
    });
    await act(async () => {
      await result.current.loadTaggers('bitcoin', 1);
      await result.current.loadMoreTaggers('bitcoin');
    });
    await act(async () => {
      resolveRequest(page(['tagger-1']));
      await first;
    });

    expect(UserController.fetchTaggers).toHaveBeenCalledTimes(1);
  });

  it('does not let a stale response overwrite the next entity', async () => {
    let resolveStale: (value: NexusTaggers) => void = () => {};
    vi.mocked(UserController.fetchTaggers)
      .mockReturnValueOnce(
        new Promise<NexusTaggers>((resolve) => {
          resolveStale = resolve;
        }),
      )
      .mockResolvedValueOnce(page(['fresh-tagger']));

    const { result, rerender } = renderHook(
      ({ taggedId }: { taggedId: string }) => useEntityTaggers(taggedId, TagKind.USER),
      { initialProps: { taggedId: 'first-profile' } },
    );

    let staleRequest: Promise<void> = Promise.resolve();
    act(() => {
      staleRequest = result.current.loadTaggers('bitcoin', 1);
    });
    await waitFor(() => {
      expect(UserController.fetchTaggers).toHaveBeenCalledTimes(1);
    });

    rerender({ taggedId: 'second-profile' });
    expect(result.current.taggerStates.size).toBe(0);

    await act(async () => {
      await result.current.loadTaggers('bitcoin', 1);
    });
    await act(async () => {
      resolveStale(page(['stale-tagger']));
      await staleRequest;
    });

    expect(result.current.taggerStates.get('bitcoin')?.ids).toEqual(['fresh-tagger']);
    expect(result.current.taggerStates.get('bitcoin')?.isLoading).toBe(false);
  });

  it('starts a fresh request when returning to a profile before its old request resolves', async () => {
    let resolveStale: (value: NexusTaggers) => void = () => {};
    vi.mocked(UserController.fetchTaggers)
      .mockReturnValueOnce(
        new Promise<NexusTaggers>((resolve) => {
          resolveStale = resolve;
        }),
      )
      .mockResolvedValueOnce(page(['fresh']));
    const { result, rerender } = renderHook(({ id }) => useEntityTaggers(id, TagKind.USER), {
      initialProps: { id: 'first' },
    });
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.loadTaggers('bitcoin');
    });
    rerender({ id: 'second' });
    rerender({ id: 'first' });
    await act(async () => {
      await result.current.loadTaggers('bitcoin');
    });
    await act(async () => {
      resolveStale(page(['stale']));
      await pending;
    });
    expect(result.current.taggerStates.get('bitcoin')?.ids).toEqual(['fresh']);
  });
});

describe('mergeTaggerIds', () => {
  it('returns the preview before anything was fetched', () => {
    expect(mergeTaggerIds({ previewIds: ['a', 'b'] })).toEqual(['a', 'b']);
  });

  it('uses fresh server rows instead of resurrecting stale preview members', () => {
    expect(mergeTaggerIds({ fetchedIds: ['a', 'b', 'c'], previewIds: ['b', 'new'] })).toEqual(['a', 'b', 'c']);
  });

  it('adds the viewer when they tag the entity but are missing from both lists', () => {
    expect(mergeTaggerIds({ fetchedIds: ['a'], previewIds: ['a'], viewerId: 'viewer', isViewerTagger: true })).toEqual([
      'a',
      'viewer',
    ]);
  });

  it('removes the viewer from stale fetched ids when they no longer tag the entity', () => {
    expect(
      mergeTaggerIds({ fetchedIds: ['a', 'viewer'], previewIds: [], viewerId: 'viewer', isViewerTagger: false }),
    ).toEqual(['a']);
  });

  it('leaves the viewer alone when the relationship is unknown', () => {
    expect(mergeTaggerIds({ fetchedIds: ['viewer'], previewIds: [], viewerId: 'viewer' })).toEqual(['viewer']);
  });

  it('ignores the relationship without a viewer', () => {
    expect(mergeTaggerIds({ fetchedIds: ['a'], previewIds: [], viewerId: null, isViewerTagger: true })).toEqual(['a']);
  });
});
