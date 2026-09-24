import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postStreamQueue } from '@/application/stream/posts/muting/post-stream-queue';
import { COLLECTIONS_SECTION_PAGE_SIZE } from '@/config/collections';
import { PostController } from '@/controllers/post/post';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import type { Pubky } from '@/models/models.types';
import { buildAuthorCollectionsStreamId } from '@/models/stream/post/postStream.types';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import type { NexusPost } from '@/services/nexus/nexus.types';
import { NexusPostStreamService } from '@/services/nexus/stream/posts/postStream';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useStreamPagination } from './useStreamPagination';

/**
 * A picker paginating a stream another surface owns (the save picker over
 * `<pubky>:author:collection`) renders from a local-first read of the shared stream row,
 * not from the pagination result. So an initial load that drops an expired row before the
 * replacement page arrives turns every cached collection target into an empty picker the
 * moment Nexus is unavailable. `preserveCachedStream` keeps the load additive.
 *
 * Real Dexie, real controller/application/queue, only the two Nexus read services replaced.
 */

const VIEWER = 'viewer' as Pubky;
const STREAM_ID = buildAuthorCollectionsStreamId(VIEWER);
const CACHED_COLLECTION_IDS = [`${VIEWER}:collection-1`, `${VIEWER}:collection-2`];
/** Over the stream cache max age, so the default initial load treats the row as stale. */
const STALE_INDEXED_AT = () => Date.now() - 60 * 60 * 1000;

const cachedCollectionPost = (compositeId: string): NexusPost => {
  const [author, id] = compositeId.split(':') as [Pubky, string];
  return {
    details: {
      id,
      content: JSON.stringify({ name: `Collection ${id}` }),
      kind: 'collection',
      uri: `pubky://${compositeId}`,
      author,
      indexed_at: STALE_INDEXED_AT(),
      attachments: null,
    },
    counts: { replies: 0, tags: 0, unique_tags: 0, reposts: 0 },
    tags: [],
    relationships: { replied: null, reposted: null, mentioned: [] },
    bookmark: null,
  } as NexusPost;
};

/** The picker's collections as a previous session left them: a stale shared stream row. */
const seedStaleCachedCollections = async () => {
  await LocalStreamPostsService.persistPosts({ posts: CACHED_COLLECTION_IDS.map(cachedCollectionPost) });
  await LocalStreamPostsService.upsert({ streamId: STREAM_ID, stream: CACHED_COLLECTION_IDS });
};

describe('useStreamPagination over a cached stream whose replacement fetch fails', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    useAuthStore.setState({ currentUserPubky: VIEWER });
    // Nexus unavailable: both the stream page and the cache-miss hydration fail.
    vi.spyOn(NexusPostStreamService, 'fetch').mockRejectedValue(new Error('nexus unavailable'));
    vi.spyOn(NexusPostStreamService, 'fetchByIds').mockRejectedValue(new Error('nexus unavailable'));
    vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([]);
    await seedStaleCachedCollections();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the cached collection targets when preserveCachedStream is set', async () => {
    const onError = vi.fn();

    const feed = renderHook(() =>
      useStreamPagination({
        streamId: STREAM_ID,
        limit: COLLECTIONS_SECTION_PAGE_SIZE,
        preserveCachedStream: true,
        onError,
      }),
    );

    await waitFor(() => {
      expect(feed.result.current.loading).toBe(false);
    });

    // The page really did fail; the cache is what the picker still renders from.
    expect(onError).toHaveBeenCalled();
    const row = await LocalStreamPostsService.read({ streamId: STREAM_ID });
    expect(row?.stream).toEqual(CACHED_COLLECTION_IDS);

    const collections = await PostController.getAuthoredCollections({ authorId: VIEWER });
    expect(collections?.map((collection) => collection.details.id)).toEqual(CACHED_COLLECTION_IDS);
  });

  it('documents the reset the flag suppresses: a stale row is dropped when the replacement fetch fails', async () => {
    const feed = renderHook(() => useStreamPagination({ streamId: STREAM_ID, limit: COLLECTIONS_SECTION_PAGE_SIZE }));

    await waitFor(() => {
      expect(feed.result.current.loading).toBe(false);
    });

    expect(await LocalStreamPostsService.read({ streamId: STREAM_ID })).toBeNull();
    expect(await PostController.getAuthoredCollections({ authorId: VIEWER })).toBeNull();
  });
});

describe('useStreamPagination extends a retained cached collection stream', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    postStreamQueue.clear();
    useAuthStore.setState({ currentUserPubky: VIEWER });
    vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    postStreamQueue.clear();
  });

  it.each([false, true])('keeps all 85 targets with a concurrent cache reader: %s', async (concurrentReader) => {
    const ids = Array.from({ length: 85 }, (_, index) => `${VIEWER}:collection-${index + 1}`);
    const posts = ids.map(cachedCollectionPost);
    // Server stream scores deliberately differ from indexed_at: an edited collection's
    // revision must never replace the stored pagination cursor.
    const scores = ids.map((_, index) => Date.now() - 2 * 60 * 60 * 1000 - index * 100);
    const cachedCount = 35;
    const tailCursor = scores[cachedCount - 1];
    await LocalStreamPostsService.persistPosts({ posts: posts.slice(0, cachedCount) });
    await LocalStreamPostsService.upsert({ streamId: STREAM_ID, stream: ids.slice(0, cachedCount), tailCursor });

    const fetchPage = vi.spyOn(NexusPostStreamService, 'fetch').mockImplementation(async ({ params }) => {
      const selected = ids
        .map((id, index) => ({ id, score: scores[index] }))
        .filter(({ score }) => params.start === undefined || score <= params.start)
        .slice(0, params.limit);
      return { post_keys: selected.map(({ id }) => id), last_post_score: selected.at(-1)?.score ?? null };
    });
    vi.spyOn(NexusPostStreamService, 'fetchByIds').mockImplementation(async ({ post_ids }) =>
      posts.filter((_, index) => post_ids.includes(ids[index])),
    );

    const feed = renderHook(() => useStreamPagination({ streamId: STREAM_ID, limit: 20, preserveCachedStream: true }));
    await waitFor(() => expect(feed.result.current.loading).toBe(false));
    expect(feed.result.current.postIds).toEqual(ids.slice(0, 20));
    expect(fetchPage).not.toHaveBeenCalled();

    if (concurrentReader) {
      await StreamPostsController.getOrFetchStreamSlice({
        streamId: STREAM_ID,
        lastPostId: ids[cachedCount - 1],
        streamTail: tailCursor,
        limit: 20,
      });
    }
    for (let round = 0; round < 12 && feed.result.current.hasMore; round += 1) {
      await act(async () => {
        await feed.result.current.loadMore();
      });
    }

    expect(feed.result.current.hasMore).toBe(false);
    expect(feed.result.current.postIds).toEqual(ids);
    const collections = await PostController.getAuthoredCollections({ authorId: VIEWER });
    expect(collections?.map((collection) => collection.details.id)).toEqual(ids);
    expect(fetchPage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        params: expect.objectContaining({ start: tailCursor - 1 }),
      }),
    );
    expect((await LocalStreamPostsService.read({ streamId: STREAM_ID }))?.tailCursor).toBe(scores.at(-1));
  });
});
