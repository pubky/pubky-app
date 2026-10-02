import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postStreamQueue } from '@/application/stream/posts/muting/post-stream-queue';
import { PostController } from '@/controllers/post/post';
import type { Pubky } from '@/models/models.types';
import { parseCompositeId } from '@/models/models.utils';
import { buildCollectionItemsStreamId } from '@/models/stream/post/postStream.types';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { NexusPostStreamService } from '@/services/nexus/stream/posts/postStream';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useStreamPagination } from './useStreamPagination';

const AUTHOR = 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy' as Pubky;
const STREAM = buildCollectionItemsStreamId(AUTHOR, 'collection-a');

// Real pagination, controllers, normalizers, and IndexedDB. Only remote IO is replaced.
describe('useStreamPagination collection membership', () => {
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

  const createPost = () => PostController.commitCreate({ authorId: AUTHOR, content: 'Saved from feed' });
  const mount = (ids: string[] | undefined) =>
    renderHook(
      ({ members, streamId, viewerId }) =>
        useStreamPagination({ streamId, collectionMembership: { postIds: members, viewerId } }),
      { initialProps: { members: ids, streamId: STREAM, viewerId: AUTHOR as string | null } },
    );

  it('shows a post saved to a newly created collection before Nexus indexes it (#2235)', async () => {
    const collectionId = await PostController.commitCreateCollection({ authorId: AUTHOR, name: 'New collection' });
    const postId = await createPost();
    await PostController.commitUpdateCollectionItem({ collectionId, postId, shouldAdd: true });
    const collection = await PostController.getDetails({ compositeId: collectionId });
    expect(JSON.parse(collection!.content).items).toHaveLength(1);
    const { id } = parseCompositeId(collectionId);
    const { result } = renderHook(() =>
      useStreamPagination({
        streamId: buildCollectionItemsStreamId(AUTHOR, id),
        collectionMembership: { postIds: [postId], viewerId: AUTHOR },
      }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.postIds).toEqual([postId]);
  });

  it('shows a cached save while initial hydration is pending without starting a second page load', async () => {
    const id = await createPost();
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof NexusPostStreamService.fetch>>>();
    vi.mocked(NexusPostStreamService.fetch).mockReturnValueOnce(pending.promise);
    const { result } = mount([id]);
    await waitFor(() => expect(result.current.postIds).toEqual([id]));
    await waitFor(() => expect(NexusPostStreamService.fetch).toHaveBeenCalledTimes(1));
    expect(result.current.loading).toBe(true);
    await act(async () => {
      await result.current.loadMore();
    });
    expect(NexusPostStreamService.fetch).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ post_keys: [], last_post_score: null }));
    await waitFor(() => expect(result.current.loading).toBe(false));
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
    rerender({ members: [id], streamId: STREAM, viewerId: AUTHOR });
    expect(result.current.postIds).toEqual([id]);
    rerender({ members: [], streamId: STREAM, viewerId: AUTHOR });
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
    rerender({ members: ['author:c', 'author:a'], streamId: STREAM, viewerId: AUTHOR });
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
    rerender({ members: [id], streamId: STREAM, viewerId: AUTHOR });
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
    rerender({ members: [], streamId: STREAM, viewerId: AUTHOR });
    rerender({ members: ['author:a'], streamId: STREAM, viewerId: AUTHOR });
    expect(result.current.postIds).toEqual(['author:a']);
  });

  it('preserves a committed removal when the first membership read resolves late', async () => {
    const id = await createPost();
    vi.mocked(NexusPostStreamService.fetch).mockResolvedValueOnce({ post_keys: [id], last_post_score: null });
    const { result, rerender } = mount(undefined);
    await waitFor(() => expect(result.current.postIds).toEqual([id]));
    act(() => result.current.removePostsOptimistically(id).commit());
    rerender({ members: [id], streamId: STREAM, viewerId: AUTHOR });
    expect(result.current.postIds).toEqual([]);
  });

  it('allows a re-add when local membership drops the id before removal commits', async () => {
    const { result, rerender } = mount(['author:a']);
    await waitFor(() => expect(result.current.loading).toBe(false));
    let commit = () => {};
    act(() => {
      commit = result.current.removePostsOptimistically('author:a').commit;
    });
    rerender({ members: [], streamId: STREAM, viewerId: AUTHOR });
    act(() => commit());
    rerender({ members: ['author:a'], streamId: STREAM, viewerId: AUTHOR });
    expect(result.current.postIds).toEqual(['author:a']);
  });

  it('keeps Nexus offsets independent of local members and their removals', async () => {
    const indexed = await createPost();
    const localOnly = await createPost();
    const explicitlyAdded = await createPost();
    vi.mocked(NexusPostStreamService.fetch).mockResolvedValueOnce({ post_keys: [indexed], last_post_score: null });
    const { result } = renderHook(() =>
      useStreamPagination({
        streamId: STREAM,
        limit: 1,
        collectionMembership: { postIds: [localOnly, indexed], viewerId: AUTHOR },
      }),
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

  it('deduplicates and orders members while excluding removed ids returned by a stale Nexus page', async () => {
    const id = await createPost();
    vi.mocked(NexusPostStreamService.fetch).mockResolvedValue({ post_keys: [id], last_post_score: null });
    const { result, rerender } = mount([id, 'author:other', id]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.postIds).toEqual([id, 'author:other']);
    rerender({ members: ['author:other'], streamId: STREAM, viewerId: AUTHOR });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.postIds).toEqual(['author:other']);
    rerender({ members: ['author:other', id], streamId: STREAM, viewerId: AUTHOR });
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
    rerender({
      members: ['author:shared'],
      streamId: buildCollectionItemsStreamId(AUTHOR, 'collection-b'),
      viewerId: AUTHOR,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.postIds).toEqual(['author:shared']);
    rerender({ members: ['author:shared'], streamId: STREAM, viewerId: AUTHOR });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      commit();
      release();
    });
    expect(result.current.postIds).toEqual(['author:shared']);
  });

  it('resets local interaction state when the viewer changes on the same collection', async () => {
    const { result, rerender } = mount(['author:shared']);
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.removePosts('author:shared'));
    expect(result.current.postIds).toEqual([]);
    rerender({ members: ['author:shared'], streamId: STREAM, viewerId: null });
    expect(result.current.postIds).toEqual(['author:shared']);
  });

  it('keeps successful explicit inserts until the live membership read catches up', async () => {
    const { result, rerender } = mount([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.prependOptimisticPosts('saved'));
    expect(result.current.postIds).toEqual(['saved']);
    rerender({ members: ['saved'], streamId: STREAM, viewerId: AUTHOR });
    expect(result.current.postIds).toEqual(['saved']);
    rerender({ members: [], streamId: STREAM, viewerId: AUTHOR });
    expect(result.current.postIds).toEqual([]);
  });
});
