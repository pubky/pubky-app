import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TagKind } from '@/application/tag/tag.types';
import { PostController } from '@/controllers/post/post';
import { UserController } from '@/controllers/user/user';
import { HttpMethod } from '@/libs/http/http.types';
import { ViewerTagMarkerStorage } from '@/services/local/tag/viewerTagMarkerStorage';
import type { NexusTaggers } from '@/services/nexus/nexus.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useEntityTaggers } from './useEntityTaggers';
import { TAGGERS_MAX_SKIP, TAGGERS_PAGE_SIZE } from './useEntityTaggers.constants';
import { mergeTaggerIds } from './useEntityTaggers.utils';

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

const page = (users: string[]): NexusTaggers => ({ users, relationship: false });
const fullPage = (prefix: string) => Array.from({ length: TAGGERS_PAGE_SIZE }, (_, index) => `${prefix}-${index}`);

describe('useEntityTaggers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ currentUserPubky: null });
    window.sessionStorage.clear();
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
      ViewerTagMarkerStorage.set({ pubky: viewerId, taggedId: 'profile', label: 'bitcoin', op: HttpMethod.DELETE });
    });
    // The marker-triggered refresh saw the old prefix; indexing removed the
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
      ViewerTagMarkerStorage.set({ pubky: viewerId, taggedId: 'profile', label: 'bitcoin', op: HttpMethod.DELETE });
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

  it('observes rollback markers even when a background refresh already restored the count', async () => {
    const viewerId = 'viewer';
    useAuthStore.setState({ currentUserPubky: viewerId });
    vi.mocked(UserController.fetchTaggers).mockResolvedValue(page(['peer']));
    const { result } = renderHook(() => useEntityTaggers('profile', TagKind.USER));
    await act(async () => {
      await result.current.loadTaggers('bitcoin', 1);
    });
    await act(async () => {
      ViewerTagMarkerStorage.set({ pubky: viewerId, taggedId: 'profile', label: 'bitcoin', op: HttpMethod.PUT });
    });
    await act(async () => {
      await result.current.loadTaggers('bitcoin', 2);
    });
    await act(async () => {
      await result.current.loadTaggers('bitcoin', 1);
    });
    expect(result.current.taggerStates.get('bitcoin')?.isViewerTagger).toBe(true);
    await act(async () => {
      ViewerTagMarkerStorage.set({ pubky: viewerId, taggedId: 'profile', label: 'bitcoin', op: HttpMethod.DELETE });
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
