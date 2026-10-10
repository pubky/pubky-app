import { act, renderHook, waitFor } from '@testing-library/react';
import { postUriBuilder } from 'pubky-app-specs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postStreamQueue } from '@/application/stream/posts/muting/post-stream-queue';
import { PostController } from '@/controllers/post/post';
import { TtlController } from '@/controllers/ttl/ttl';
import { useStreamPagination } from '@/hooks/useStreamPagination/useStreamPagination';
import type { UseStreamPaginationResult } from '@/hooks/useStreamPagination/useStreamPagination.types';
import { AppError } from '@/libs/error/error';
import { DatabaseErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { parseCompositeId } from '@/models/models.utils';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import { PostTtlModel } from '@/models/post/ttl/postTtl';
import type { PostStreamId } from '@/models/stream/post/postStream.types';
import { buildCollectionItemsStreamId } from '@/models/stream/post/postStream.types';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { NexusPostStreamService } from '@/services/nexus/stream/posts/postStream';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useCollectionStreamMembership } from './useCollectionStreamMembership';

const AUTHOR = 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy' as Pubky;
const STREAM = buildCollectionItemsStreamId(AUTHOR, 'collection-a');

// The collection feed composes the real Nexus paginator with the membership projection.
function useCollectionFeed({
  streamId,
  members,
  limit,
}: {
  streamId: PostStreamId;
  members?: string[];
  limit?: number;
}) {
  const pagination = useStreamPagination({ streamId, ...(limit ? { limit } : {}) });
  return useCollectionStreamMembership({
    enabled: true,
    streamId,
    collectionId: undefined,
    membershipPostIds: members,
    pagination,
    hydrationCapped: false,
  });
}

function settledPagination(overrides: Partial<UseStreamPaginationResult> = {}): UseStreamPaginationResult {
  return {
    postIds: [],
    loading: false,
    loadingMore: false,
    error: null,
    hasMore: false,
    loadMore: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    prependPosts: vi.fn(async () => {}),
    prependOptimisticPosts: vi.fn(),
    removePosts: vi.fn(),
    removePostsOptimistically: vi.fn(() => ({ commit: vi.fn(), rollback: vi.fn() })),
    ...overrides,
  };
}

// Real pagination, controllers, normalizers, and IndexedDB. Only remote IO is replaced.
describe('useCollectionStreamMembership', () => {
  beforeEach(async () => {
    await UserDetailsModel.upsert({
      id: AUTHOR,
      name: 'Author',
      bio: '',
      links: [],
      status: null,
      image: null,
      indexed_at: 1,
    });
    postStreamQueue.clear();
    useAuthStore.setState({ currentUserPubky: AUTHOR });
    vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);
    vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([]);
    vi.spyOn(NexusPostStreamService, 'fetch').mockResolvedValue({ post_keys: [], last_post_score: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    postStreamQueue.clear();
  });

  // Post ids are timestamps: creates in the same millisecond would share an id.
  const nextTimestamp = () => new Promise((resolve) => setTimeout(resolve, 2));
  const createPost = async () => {
    await nextTimestamp();
    return PostController.commitCreate({ authorId: AUTHOR, content: 'Saved from feed' });
  };
  const mount = (ids: string[] | undefined) =>
    renderHook(({ members, streamId }) => useCollectionFeed({ streamId, members }), {
      initialProps: { members: ids, streamId: STREAM },
    });

  it('shows a post saved to a newly created collection before Nexus indexes it (#2235)', async () => {
    const collectionId = await PostController.commitCreateCollection({ authorId: AUTHOR, name: 'New collection' });
    const postId = await createPost();
    await PostController.commitUpdateCollectionItem({ collectionId, postId, shouldAdd: true });
    const collection = await PostController.getDetails({ compositeId: collectionId });
    expect(JSON.parse(collection!.content).items).toHaveLength(1);
    const { id } = parseCompositeId(collectionId);
    const { result } = renderHook(() =>
      useCollectionFeed({ streamId: buildCollectionItemsStreamId(AUTHOR, id), members: [postId] }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.postIds).toEqual([postId]);
  });

  it('shows a cached save while initial hydration is pending and reports hydration until it settles', async () => {
    const id = await createPost();
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof NexusPostStreamService.fetch>>>();
    vi.mocked(NexusPostStreamService.fetch).mockReturnValueOnce(pending.promise);
    const { result } = mount([id]);
    await waitFor(() => expect(result.current.postIds).toEqual([id]));
    await waitFor(() => expect(NexusPostStreamService.fetch).toHaveBeenCalledTimes(1));
    expect(result.current.loading).toBe(true);
    // Every member is already shown, yet the feed must keep scroll-to-load disarmed.
    expect(result.current.isHydrating).toBe(true);
    expect(result.current.displayLoading).toBe(false);
    await act(async () => pending.resolve({ post_keys: [], last_post_score: null }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isHydrating).toBe(false);
    expect(result.current.postIds).toEqual([id]);
  });

  it('keeps membership on repeated refresh even after Nexus previously supplied the post', async () => {
    const id = await createPost();
    vi.mocked(NexusPostStreamService.fetch).mockResolvedValueOnce({ post_keys: [id], last_post_score: null });
    const { result } = mount([id]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    for (let round = 0; round < 2; round++) {
      await act(async () => {
        await result.current.refresh();
      });
      expect(result.current.postIds).toEqual([id]);
    }
  });

  it('drops a rolled-back addition without waiting for another stream request', async () => {
    const id = await createPost();
    const { result, rerender } = mount([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ members: [id], streamId: STREAM });
    expect(result.current.postIds).toEqual([id]);
    rerender({ members: [], streamId: STREAM });
    expect(result.current.postIds).toEqual([]);
    expect(NexusPostStreamService.fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps an unlisted card in its slot while retained, then removes it on release', async () => {
    const { result, rerender } = mount(['author:a', 'author:b', 'author:c']);
    await waitFor(() => expect(result.current.loading).toBe(false));
    let release = () => {};
    act(() => {
      release = result.current.retainPost!('author:b');
    });
    rerender({ members: ['author:c', 'author:a'], streamId: STREAM });
    expect(result.current.postIds).toEqual(['author:c', 'author:b', 'author:a']);
    act(() => release());
    expect(result.current.postIds).toEqual(['author:c', 'author:a']);
  });

  it('keeps a pending removal hidden across refresh and late membership, then restores on rollback', async () => {
    const id = await createPost();
    vi.mocked(NexusPostStreamService.fetch).mockResolvedValueOnce({ post_keys: [id], last_post_score: null });
    const { result, rerender } = mount(undefined);
    await waitFor(() => expect(result.current.postIds).toEqual([id]));
    let rollback = () => {};
    act(() => {
      rollback = result.current.removePostsOptimistically(id).rollback;
    });
    rerender({ members: [id], streamId: STREAM });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.postIds).toEqual([]);
    act(() => rollback());
    expect(result.current.postIds).toEqual([id]);
  });

  it('does not reinsert a committed removal until membership drops and re-adds it', async () => {
    const { result, rerender } = mount(['author:a']);
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.removePostsOptimistically('author:a').commit();
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.postIds).toEqual([]);
    rerender({ members: [], streamId: STREAM });
    rerender({ members: ['author:a'], streamId: STREAM });
    expect(result.current.postIds).toEqual(['author:a']);
  });

  it('preserves a committed removal when the first membership read resolves late', async () => {
    const id = await createPost();
    vi.mocked(NexusPostStreamService.fetch).mockResolvedValueOnce({ post_keys: [id], last_post_score: null });
    const { result, rerender } = mount(undefined);
    await waitFor(() => expect(result.current.postIds).toEqual([id]));
    act(() => result.current.removePostsOptimistically(id).commit());
    rerender({ members: [id], streamId: STREAM });
    expect(result.current.postIds).toEqual([]);
  });

  it('allows a re-add when local membership drops the id before removal commits', async () => {
    const { result, rerender } = mount(['author:a']);
    await waitFor(() => expect(result.current.loading).toBe(false));
    let commit = () => {};
    act(() => {
      commit = result.current.removePostsOptimistically('author:a').commit;
    });
    rerender({ members: [], streamId: STREAM });
    act(() => commit());
    rerender({ members: ['author:a'], streamId: STREAM });
    expect(result.current.postIds).toEqual(['author:a']);
  });

  it('keeps Nexus offsets independent of local members and their removals', async () => {
    const indexed = await createPost();
    const localOnly = await createPost();
    const explicitlyAdded = await createPost();
    vi.mocked(NexusPostStreamService.fetch).mockResolvedValueOnce({ post_keys: [indexed], last_post_score: null });
    const { result } = renderHook(() =>
      useCollectionFeed({ streamId: STREAM, limit: 1, members: [localOnly, indexed] }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.postIds).toEqual([localOnly, indexed]));
    await act(async () => {
      await result.current.prependPosts(explicitlyAdded);
    });
    act(() => result.current.removePostsOptimistically([localOnly, explicitlyAdded]).commit());
    await act(async () => {
      await result.current.loadMore();
    });
    expect(NexusPostStreamService.fetch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ skip: 1, limit: 1 }),
      }),
    );
    expect(result.current.postIds).toEqual([indexed]);
  });

  it.each([false, true])(
    'accounts for confirmed removals exactly once (next page already pending: %s)',
    async (pagePending) => {
      const indexedIds: string[] = [];
      for (let i = 0; i < 5; i++) indexedIds.push(await createPost());
      const localOnly = await createPost();
      const explicitlyAdded = await createPost();
      const members = [...indexedIds, localOnly];
      await nextTimestamp();
      const collectionId = await PostController.commitCreateCollection({
        authorId: AUTHOR,
        name: 'Paginated collection',
        items: members.map((postId) => {
          const { pubky, id } = parseCompositeId(postId);
          return postUriBuilder(pubky, id);
        }),
      });
      let indexed = [...indexedIds];
      vi.mocked(NexusPostStreamService.fetch).mockImplementation(async ({ params }) => {
        const skip = Number(params.skip ?? 0);
        return { post_keys: indexed.slice(skip, skip + Number(params.limit)), last_post_score: null };
      });
      const streamId = buildCollectionItemsStreamId(AUTHOR, parseCompositeId(collectionId).id);
      const { result, rerender } = renderHook(({ members }) => useCollectionFeed({ streamId, limit: 2, members }), {
        initialProps: { members },
      });
      await waitFor(() => expect(result.current.loading).toBe(false));
      await waitFor(() => expect(result.current.postIds).toEqual(members));
      await act(async () => result.current.prependPosts(explicitlyAdded));

      const pending = Promise.withResolvers<Awaited<ReturnType<typeof NexusPostStreamService.fetch>>>();
      let loadingPage: Promise<void> | undefined;
      if (pagePending) {
        vi.mocked(NexusPostStreamService.fetch).mockReturnValueOnce(pending.promise);
        act(() => {
          loadingPage = result.current.loadMore();
        });
        await waitFor(() => expect(NexusPostStreamService.fetch).toHaveBeenCalledTimes(2));
      }
      await act(async () => {
        await PostController.commitUpdateCollectionItem({ collectionId, postId: indexedIds[0], shouldAdd: false });
        await PostController.commitUpdateCollectionItem({ collectionId, postId: localOnly, shouldAdd: false });
      });
      indexed = indexedIds.slice(1);
      rerender({ members: indexed });
      act(() => {
        // The picker closes after persistence. Only the consumed Nexus row
        // contributes to the offset, even if this callback repeats.
        result.current.removePosts([indexedIds[0], localOnly, explicitlyAdded, indexedIds[0]]);
        result.current.removePosts(indexedIds[0]);
      });
      if (pagePending) {
        await act(async () => {
          // This response started against the old index, before the deletion.
          pending.resolve({ post_keys: indexedIds.slice(2, 4), last_post_score: null });
          await loadingPage;
        });
      }
      await act(async () => {
        await result.current.loadMore();
      });
      expect(NexusPostStreamService.fetch).toHaveBeenLastCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({ skip: pagePending ? 3 : 1, limit: 2 }),
        }),
      );
      const lastPage = await vi.mocked(NexusPostStreamService.fetch).mock.results.at(-1)!.value;
      expect(lastPage.post_keys).toEqual(pagePending ? indexedIds.slice(4) : indexedIds.slice(2, 4));
      expect(result.current.postIds).toEqual(indexed);
    },
  );

  it('deduplicates and orders members while excluding removed ids returned by a stale Nexus page', async () => {
    const id = await createPost();
    vi.mocked(NexusPostStreamService.fetch).mockResolvedValue({ post_keys: [id], last_post_score: null });
    const { result, rerender } = mount([id, 'author:other', id]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.postIds).toEqual([id, 'author:other']);
    rerender({ members: ['author:other'], streamId: STREAM });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.postIds).toEqual(['author:other']);
    rerender({ members: ['author:other', id], streamId: STREAM });
    expect(result.current.postIds).toEqual(['author:other', id]);
  });

  it('keeps overlapping removals hidden until both roll back, even on a retained card', async () => {
    const { result } = mount(['author:a']);
    await waitFor(() => expect(result.current.loading).toBe(false));
    let first = () => {};
    let second = () => {};
    act(() => {
      result.current.retainPost!('author:a');
      first = result.current.removePostsOptimistically('author:a').rollback;
      second = result.current.removePostsOptimistically('author:a').rollback;
    });
    act(() => first());
    expect(result.current.postIds).toEqual([]);
    act(() => second());
    expect(result.current.postIds).toEqual(['author:a']);
  });

  it('isolates removals and retention across collection switches, including a return to the first collection', async () => {
    const { result, rerender } = mount(['author:shared']);
    await waitFor(() => expect(result.current.loading).toBe(false));
    let commit = () => {};
    let release = () => {};
    act(() => {
      release = result.current.retainPost!('author:shared');
      commit = result.current.removePostsOptimistically('author:shared').commit;
    });
    rerender({ members: ['author:shared'], streamId: buildCollectionItemsStreamId(AUTHOR, 'collection-b') });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.postIds).toEqual(['author:shared']);
    rerender({ members: ['author:shared'], streamId: STREAM });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      commit();
      release();
    });
    expect(result.current.postIds).toEqual(['author:shared']);
  });

  it('keeps successful explicit inserts until the live membership read catches up', async () => {
    const { result, rerender } = mount([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.prependOptimisticPosts('saved'));
    expect(result.current.postIds).toEqual(['saved']);
    rerender({ members: ['saved'], streamId: STREAM });
    expect(result.current.postIds).toEqual(['saved']);
    rerender({ members: [], streamId: STREAM });
    expect(result.current.postIds).toEqual([]);
  });
  it('passes the pagination through untouched when disabled', () => {
    const pagination = settledPagination({ postIds: ['author:a'], loading: true });
    const { result } = renderHook(() =>
      useCollectionStreamMembership({
        enabled: false,
        streamId: STREAM,
        collectionId: undefined,
        membershipPostIds: ['author:b'],
        pagination,
        hydrationCapped: false,
      }),
    );
    expect(result.current.postIds).toBe(pagination.postIds);
    expect(result.current.removePosts).toBe(pagination.removePosts);
    expect(result.current.retainPost).toBeUndefined();
    expect(result.current.refresh).toBe(pagination.refresh);
    expect(result.current.displayLoading).toBe(true);
    expect(result.current.isHydrating).toBe(false);
  });

  const mountEnvelopeFeed = (collectionId: string, pagination: UseStreamPaginationResult) =>
    renderHook(() =>
      useCollectionStreamMembership({
        enabled: true,
        streamId: STREAM,
        collectionId,
        membershipPostIds: [],
        pagination,
        hydrationCapped: false,
      }),
    );

  it('refreshes the collection envelope together with the stream', async () => {
    const forceRefresh = vi.spyOn(TtlController, 'forceRefreshPostsByIds').mockResolvedValue(undefined);
    const pagination = settledPagination();
    const { result } = mountEnvelopeFeed(`${AUTHOR}:collection-a`, pagination);
    await act(async () => {
      await result.current.refresh();
    });
    expect(pagination.refresh).toHaveBeenCalledOnce();
    expect(forceRefresh).toHaveBeenCalledWith({ postIds: [`${AUTHOR}:collection-a`], viewerId: AUTHOR });
  });

  it('skips the owner’s envelope refresh right after a local write, so Nexus cannot revert an unindexed save', async () => {
    const forceRefresh = vi.spyOn(TtlController, 'forceRefreshPostsByIds').mockResolvedValue(undefined);
    const collectionId = await PostController.commitCreateCollection({ authorId: AUTHOR, name: 'Reading list' });
    const pagination = settledPagination();
    const { result } = mountEnvelopeFeed(collectionId, pagination);
    await act(async () => {
      await result.current.refresh();
    });
    expect(pagination.refresh).toHaveBeenCalledOnce();
    expect(forceRefresh).not.toHaveBeenCalled();
  });

  it('refreshes the owner’s envelope after a recent remote read with no local write', async () => {
    const forceRefresh = vi.spyOn(TtlController, 'forceRefreshPostsByIds').mockResolvedValue(undefined);
    await PostTtlModel.upsert({ id: `${AUTHOR}:collection-a`, lastUpdatedAt: Date.now() });
    const { result } = mountEnvelopeFeed(`${AUTHOR}:collection-a`, settledPagination());
    await act(async () => {
      await result.current.refresh();
    });
    expect(forceRefresh).toHaveBeenCalledWith({ postIds: [`${AUTHOR}:collection-a`], viewerId: AUTHOR });
  });

  it('does not extend the local-write window when a later read freshens TTL', async () => {
    const forceRefresh = vi.spyOn(TtlController, 'forceRefreshPostsByIds').mockResolvedValue(undefined);
    const collectionId = await PostController.commitCreateCollection({ authorId: AUTHOR, name: 'Reading list' });
    await PostDetailsModel.update(collectionId, { localUpdatedAt: Date.now() - 120_000 });
    await PostTtlModel.upsert({ id: collectionId, lastUpdatedAt: Date.now() });
    const { result } = mountEnvelopeFeed(collectionId, settledPagination());
    await act(async () => {
      await result.current.refresh();
    });
    expect(forceRefresh).toHaveBeenCalledWith({ postIds: [collectionId], viewerId: AUTHOR });
  });

  it('skips the owner’s envelope refresh when its freshness cannot be read', async () => {
    const logError = vi.spyOn(Logger, 'error').mockImplementation(() => {});
    const forceRefresh = vi.spyOn(TtlController, 'forceRefreshPostsByIds').mockResolvedValue(undefined);
    vi.spyOn(PostController, 'getDetailsByIds').mockRejectedValue(
      new AppError({
        category: ErrorCategory.Database,
        code: DatabaseErrorCode.QUERY_FAILED,
        message: 'Failed to read collection details',
        service: ErrorService.Local,
        operation: 'test-envelope-freshness',
      }),
    );
    const pagination = settledPagination();
    const { result } = mountEnvelopeFeed(`${AUTHOR}:collection-a`, pagination);
    await act(async () => {
      await expect(result.current.refresh()).resolves.toBeUndefined();
    });
    expect(pagination.refresh).toHaveBeenCalledOnce();
    expect(forceRefresh).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it('always refreshes another author’s envelope, which this viewer never writes', async () => {
    const forceRefresh = vi.spyOn(TtlController, 'forceRefreshPostsByIds').mockResolvedValue(undefined);
    await PostTtlModel.upsert({ id: 'curator:collection-b', lastUpdatedAt: Date.now() });
    const { result } = mountEnvelopeFeed('curator:collection-b', settledPagination());
    await act(async () => {
      await result.current.refresh();
    });
    expect(forceRefresh).toHaveBeenCalledWith({ postIds: ['curator:collection-b'], viewerId: AUTHOR });
  });

  it('still settles a refresh when the envelope refresh fails, logging only unreported errors', async () => {
    const logError = vi.spyOn(Logger, 'error').mockImplementation(() => {});
    const forceRefresh = vi
      .spyOn(TtlController, 'forceRefreshPostsByIds')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(
        new AppError({
          category: ErrorCategory.Server,
          code: ServerErrorCode.SERVICE_UNAVAILABLE,
          message: 'Nexus unavailable',
          service: ErrorService.Nexus,
          operation: 'test-envelope-refresh',
        }),
      );
    const pagination = settledPagination();
    const { result } = mountEnvelopeFeed('curator:collection-b', pagination);
    await act(async () => {
      await expect(result.current.refresh()).resolves.toBeUndefined();
    });
    expect(logError).toHaveBeenCalledOnce();
    await act(async () => {
      await expect(result.current.refresh()).resolves.toBeUndefined();
    });
    expect(forceRefresh).toHaveBeenCalledTimes(2);
    expect(logError).toHaveBeenCalledOnce();
    expect(pagination.refresh).toHaveBeenCalledTimes(2);
  });

  it('keeps the same postIds array across renders that change nothing visible', () => {
    const streamIds = ['author:a', 'author:b'];
    const actions = settledPagination();
    const { result, rerender } = renderHook(() =>
      useCollectionStreamMembership({
        enabled: true,
        streamId: STREAM,
        collectionId: undefined,
        membershipPostIds: ['author:b', 'author:a'],
        // A fresh result object per render, as the pagination hook returns.
        pagination: { ...actions, postIds: streamIds },
        hydrationCapped: false,
      }),
    );
    const shown = result.current.postIds;
    expect(shown).toEqual(['author:b', 'author:a']);
    rerender();
    expect(result.current.postIds).toBe(shown);
  });

  it('keeps members hydrating behind cached cards, then releases them once the stream settles', async () => {
    const cached = await createPost();
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof NexusPostStreamService.fetch>>>();
    vi.mocked(NexusPostStreamService.fetch).mockReturnValueOnce(pending.promise);
    const { result } = mount([cached, 'author:uncached']);
    await waitFor(() => expect(result.current.postIds).toEqual([cached]));
    expect(result.current.displayLoading).toBe(false);
    expect(result.current.isHydrating).toBe(true);
    await act(async () => pending.resolve({ post_keys: [], last_post_score: null }));
    await waitFor(() => expect(result.current.postIds).toEqual([cached, 'author:uncached']));
    expect(result.current.isHydrating).toBe(false);
  });

  it('keeps unhydrated members withheld after the stream fails, so they never mount as unavailable', async () => {
    const cached = await createPost();
    vi.mocked(NexusPostStreamService.fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result } = mount([cached, 'author:uncached']);
    await waitFor(() => expect(result.current.error).not.toBeNull());
    await waitFor(() => expect(result.current.postIds).toEqual([cached]));
    expect(result.current.displayLoading).toBe(false);
    expect(result.current.isHydrating).toBe(false);
  });

  it('shows the error state instead of placeholders when no member could be hydrated', async () => {
    vi.mocked(NexusPostStreamService.fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result } = mount(['author:uncached']);
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.postIds).toEqual([]);
    expect(result.current.displayLoading).toBe(false);
  });

  it('releases unhydrated members when the feed caps eager hydration', () => {
    const pagination = settledPagination({ hasMore: true });
    const { result, rerender } = renderHook(
      ({ hydrationCapped }) =>
        useCollectionStreamMembership({
          enabled: true,
          streamId: STREAM,
          collectionId: undefined,
          membershipPostIds: ['author:uncached'],
          pagination,
          hydrationCapped,
        }),
      { initialProps: { hydrationCapped: false } },
    );
    expect(result.current.postIds).toEqual([]);
    expect(result.current.displayLoading).toBe(true);
    rerender({ hydrationCapped: true });
    expect(result.current.postIds).toEqual(['author:uncached']);
    expect(result.current.displayLoading).toBe(false);
  });

  it('treats a failed cache check as not ready instead of throwing during render', async () => {
    const relationships = vi
      .spyOn(PostController, 'getRelationshipsByIds')
      .mockRejectedValue(new Error('Connection to Indexed Database server lost'));
    const { result } = renderHook(() =>
      useCollectionStreamMembership({
        enabled: true,
        streamId: STREAM,
        collectionId: undefined,
        membershipPostIds: ['author:uncached'],
        pagination: settledPagination({ hasMore: true }),
        hydrationCapped: false,
      }),
    );
    await waitFor(() => expect(relationships).toHaveBeenCalled());
    expect(result.current.postIds).toEqual([]);
    expect(result.current.displayLoading).toBe(true);
  });

  it('does not bring back a retained card after its removal commits', async () => {
    const { result, rerender } = mount(['author:a', 'author:b']);
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.retainPost!('author:a');
    });
    rerender({ members: ['author:b'], streamId: STREAM });
    expect(result.current.postIds).toEqual(['author:a', 'author:b']);
    act(() => result.current.removePostsOptimistically('author:a').commit());
    expect(result.current.postIds).toEqual(['author:b']);
  });

  it('drops a served row from the Nexus offset when the envelope removes its member', async () => {
    const indexed = await createPost();
    vi.mocked(NexusPostStreamService.fetch).mockResolvedValueOnce({ post_keys: [indexed], last_post_score: null });
    const { result, rerender } = renderHook(
      ({ members }) => useCollectionFeed({ streamId: STREAM, limit: 1, members }),
      {
        initialProps: { members: [indexed, 'author:other'] },
      },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ members: ['author:other'] });
    await act(async () => {
      await result.current.loadMore();
    });
    expect(NexusPostStreamService.fetch).toHaveBeenLastCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ skip: 0, limit: 1 }) }),
    );
    expect(result.current.postIds).toEqual(['author:other']);
  });
});
