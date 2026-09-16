import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PostController } from '@/controllers/post/post';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import { buildCompositeId } from '@/models/models.utils';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import { DELETED } from '@/models/post/details/postDetails.constants';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import {
  buildCollectionItemsStreamId,
  type PostStreamId,
  PostStreamTypes,
} from '@/models/stream/post/postStream.types';
import { UnreadPostStreamModel } from '@/models/stream/post/tables/postStream.unread';
import { useUnreadPosts } from './useUnreadPosts';

const streamId = PostStreamTypes.TIMELINE_ALL_ALL;

function postDetails(id: string, overrides: Partial<PostDetailsModelSchema> = {}): PostDetailsModelSchema {
  return {
    id: buildCompositeId({ pubky: 'author', id }),
    content: 'New post',
    kind: 'short',
    indexed_at: 1_000,
    uri: `pubky://author/pub/pubky.app/posts/${id}`,
    attachments: null,
    ...overrides,
  };
}

function setUnreadStream(streamId: PostStreamId, postIds: string[]) {
  return UnreadPostStreamModel.upsert(streamId, postIds);
}

describe('useUnreadPosts', () => {
  afterEach(() => vi.restoreAllMocks());

  it('starts empty and reacts when an unread stream is created and cleared', async () => {
    const ready = postDetails('ready');
    await PostDetailsModel.create(ready);
    const { result } = renderHook(() => useUnreadPosts({ streamId }));
    expect(result.current).toEqual({ unreadPostIds: [], unreadCount: 0 });

    await act(async () => {
      await setUnreadStream(streamId, [ready.id]);
    });
    await waitFor(() => expect(result.current.unreadPostIds).toEqual([ready.id]));

    await act(async () => {
      await setUnreadStream(streamId, []);
    });
    await waitFor(() => expect(result.current).toEqual({ unreadPostIds: [], unreadCount: 0 }));
  });

  it('counts eligible posts as their details arrive without another unread-stream write', async () => {
    const ready = postDetails('ready');
    const pending = postDetails('pending');
    const missing = postDetails('missing');
    await PostDetailsModel.create(ready);
    await setUnreadStream(streamId, [missing.id, pending.id, ready.id]);
    const { result } = renderHook(() => useUnreadPosts({ streamId }));
    await waitFor(() => expect(result.current.unreadPostIds).toEqual([ready.id]));

    await act(async () => {
      await PostDetailsModel.create(pending);
    });
    await waitFor(() => expect(result.current.unreadPostIds).toEqual([pending.id, ready.id]));
    expect(result.current.unreadCount).toBe(2);
  });

  it('clears the previous count immediately when switching or disabling streams', async () => {
    const short = postDetails('short');
    const collection = postDetails('collection', { kind: 'collection', content: '{"name":"Collection"}' });
    await PostDetailsModel.create(short);
    await PostDetailsModel.create(collection);
    await setUnreadStream(streamId, [short.id]);
    await setUnreadStream(PostStreamTypes.TIMELINE_ALL_COLLECTION, [collection.id]);

    const initialProps: { streamId: PostStreamId | null } = { streamId };
    const { result, rerender } = renderHook(
      ({ streamId }: { streamId: PostStreamId | null }) => useUnreadPosts({ streamId }),
      { initialProps },
    );
    await waitFor(() => expect(result.current.unreadPostIds).toEqual([short.id]));

    rerender({ streamId: PostStreamTypes.TIMELINE_ALL_COLLECTION });
    expect(result.current).toEqual({ unreadPostIds: [], unreadCount: 0 });
    await waitFor(() => expect(result.current.unreadPostIds).toEqual([collection.id]));

    rerender({ streamId: null });
    expect(result.current).toEqual({ unreadPostIds: [], unreadCount: 0 });
  });

  it.each<PostStreamId>([PostStreamTypes.TIMELINE_ALL_IMAGE, 'timeline:wot_domain:2:image:bitcoin'])(
    'counts only the content kind selected by %s',
    async (imageStreamId) => {
      const image = postDetails('image', { kind: 'image' });
      const short = postDetails('short');
      await PostDetailsModel.create(image);
      await PostDetailsModel.create(short);
      await setUnreadStream(imageStreamId, [short.id, image.id]);

      const { result } = renderHook(() => useUnreadPosts({ streamId: imageStreamId }));

      await waitFor(() => expect(result.current.unreadPostIds).toEqual([image.id]));
      expect(result.current.unreadCount).toBe(1);
    },
  );

  it.each([
    ['collection', { kind: 'collection', content: '{"name":"Collection"}' }],
    ['tombstone', { kind: 'short', content: DELETED }],
  ])('never counts a %s while its unread ID is waiting for details', async (_name, overrides) => {
    const ready = postDetails('ready');
    const filtered = postDetails('filtered', overrides);
    await PostDetailsModel.create(ready);
    await setUnreadStream(streamId, [filtered.id, ready.id]);

    const counts: number[] = [];
    const { result } = renderHook(() => {
      const unread = useUnreadPosts({ streamId });
      counts.push(unread.unreadCount);
      return unread;
    });

    // A known post proves the live query settled; the initial empty render cannot pass this assertion.
    await waitFor(() => expect(result.current.unreadPostIds).toEqual([ready.id]));
    const rendersBeforeHydration = counts.length;

    await act(async () => {
      await PostDetailsModel.create(filtered);
    });

    await waitFor(() => expect(counts.length).toBeGreaterThan(rendersBeforeHydration));
    expect(result.current.unreadPostIds).toEqual([ready.id]);
    expect(counts).not.toContain(2);
  });

  it('counts a collection after hydration when the Collections filter is selected', async () => {
    const first = postDetails('first', { kind: 'collection', content: '{"name":"First"}' });
    const pending = postDetails('pending', { kind: 'collection', content: '{"name":"Pending"}' });
    await PostDetailsModel.create(first);
    await setUnreadStream(PostStreamTypes.TIMELINE_ALL_COLLECTION, [pending.id, first.id]);
    const { result } = renderHook(() => useUnreadPosts({ streamId: PostStreamTypes.TIMELINE_ALL_COLLECTION }));
    await waitFor(() => expect(result.current.unreadPostIds).toEqual([first.id]));

    await act(async () => {
      await PostDetailsModel.create(pending);
    });
    await waitFor(() => expect(result.current.unreadPostIds).toEqual([pending.id, first.id]));
    expect(result.current.unreadCount).toBe(2);
  });

  it.each<PostStreamId>([
    PostStreamTypes.TIMELINE_BOOKMARKS_ALL,
    buildCollectionItemsStreamId('owner', 'collection-post'),
  ])('retains deleted posts on %s', async (retainingStreamId) => {
    const deleted = postDetails('deleted', { content: DELETED });
    await PostDetailsModel.create(deleted);
    await setUnreadStream(retainingStreamId, [deleted.id]);
    const { result } = renderHook(() => useUnreadPosts({ streamId: retainingStreamId }));

    await waitFor(() => expect(result.current.unreadPostIds).toEqual([deleted.id]));
    expect(result.current.unreadCount).toBe(1);
  });

  it('clears the count on a details-read failure and recovers on the next local update', async () => {
    vi.spyOn(Logger, 'error').mockImplementation(() => {});
    const ready = postDetails('ready');
    await PostDetailsModel.create(ready);
    await setUnreadStream(streamId, [ready.id]);
    const { result } = renderHook(() => useUnreadPosts({ streamId }));
    await waitFor(() => expect(result.current.unreadCount).toBe(1));

    vi.spyOn(PostController, 'getDetailsByIds').mockRejectedValueOnce(
      Err.database(DatabaseErrorCode.QUERY_FAILED, 'Could not read post details', {
        service: ErrorService.Local,
        operation: 'readDetailsByIds',
      }),
    );
    await act(async () => {
      await setUnreadStream(streamId, [ready.id]);
    });
    await waitFor(() => expect(result.current).toEqual({ unreadPostIds: [], unreadCount: 0 }));

    await act(async () => {
      await setUnreadStream(streamId, [ready.id]);
    });
    await waitFor(() => expect(result.current.unreadPostIds).toEqual([ready.id]));
  });
});
