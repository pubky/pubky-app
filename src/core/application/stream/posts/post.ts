import { FileApplication } from '@/application/file/file';
import type {
  TCacheStreamParams,
  TFetchMissingUsersParams,
  TFetchStreamParams,
  TMissingPostsParams,
  TPartialCacheHitParams,
  TPersistUnreadNewStreamChunkParams,
  TPostStreamChunkResponse,
} from '@/application/stream/posts/post.types';
import { COLLECTIONS_DISCOVER_MAX_FETCHES_PER_LOAD } from '@/config/collections';
import { getStreamCacheMaxAgeMs } from '@/config/nexus';
import {
  FORCE_FETCH_NEW_POSTS,
  NOT_FOUND_CACHED_STREAM,
  SKIP_FETCH_NEW_POSTS,
} from '@/controllers/stream/posts/post.constants';
import type { TStreamIdParams } from '@/controllers/stream/posts/posts.types';
import { Logger } from '@/libs/logger/logger';
import { parseCollectionContent } from '@/libs/post/collectionContent';
import { BookmarkModel } from '@/models/bookmark/bookmark';
import { CompositeIdDomain, type Pubky } from '@/models/models.types';
import { buildCompositeId, buildCompositeIdFromPubkyUri, parseCompositeId } from '@/models/models.utils';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import type { PostRelationshipsModelSchema } from '@/models/post/relationships/postRelationships.schema';
import {
  isAuthorStreamSkippingMuteFilter,
  isBookmarkStream,
  isDeletedRetainingStream,
  isDiscoverCollectionsStream,
  isSkipPaginatedStream,
  type PostStreamId,
} from '@/models/stream/post/postStream.types';
import { PostStreamModel } from '@/models/stream/post/tables/postStream';
import { UnreadPostStreamModel } from '@/models/stream/post/tables/postStream.unread';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { LocalPostService } from '@/services/local/post/post';
import type { TStreamResult } from '@/services/local/stream/posts/post.types';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import { postStreamDirtyRegistry } from '@/services/local/stream/posts/postStreamDirtyRegistry';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import { NexusPostStreamService } from '@/services/nexus/stream/posts/postStream';
import { StreamKind, StreamOrder, StreamSource } from '@/services/nexus/stream/posts/postStream.types';
import { breakDownStreamId, createPostStreamParams } from '@/services/nexus/stream/posts/postStream.utils';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';
import { MuteFilter } from './muting/mute-filter';
import { postStreamQueue } from './muting/post-stream-queue';

export class PostStreamApplication {
  private constructor() {}

  // ============================================================================
  // Public API
  // ============================================================================

  static async getUnreadStream({ streamId }: TStreamIdParams): Promise<TStreamResult | null> {
    return await LocalStreamPostsService.readUnreadStream({ streamId });
  }

  static async getCachedLastPostTimestamp({ streamId }: TStreamIdParams): Promise<number> {
    try {
      const postStream = await LocalStreamPostsService.read({ streamId });
      if (!postStream || postStream.stream.length === 0) {
        Logger.warn('StreamId not found in cache', { streamId });
        return NOT_FOUND_CACHED_STREAM;
      }

      // Iterate backwards through the stream to find the last entry we can resolve
      // a pagination cursor for. This handles cases where the last PostDetails (or
      // bookmark row) might be missing.
      for (let i = postStream.stream.length - 1; i >= 0; i--) {
        const cursor = await this.getStreamCursorTimestamp(streamId, postStream.stream[i]);

        if (cursor !== undefined) {
          return cursor;
        }
      }

      // No stream entry yielded a cursor, cache is not useful
      Logger.warn('No cursor found in cached stream', { streamId, streamLength: postStream.stream.length });
      return NOT_FOUND_CACHED_STREAM;
    } catch (error) {
      Logger.warn('Failed to get timeline initial cursor', { streamId, error });
      return NOT_FOUND_CACHED_STREAM;
    }
  }

  /**
   * Gets the head of the stream
   * @param params - The parameters for the stream
   * @returns The postId of the head of the stream
   */
  static async getStreamHead(params: TStreamIdParams): Promise<number> {
    return await LocalStreamPostsService.getStreamHead(params);
  }

  /**
   * Get local stream data from cache
   * @param streamId - The ID of the stream
   * @returns The cached stream or null if not found
   */
  static async getLocalStream({ streamId }: TStreamIdParams): Promise<TStreamResult | null> {
    return await LocalStreamPostsService.read({ streamId });
  }

  static async mergeUnreadStreamWithPostStream(params: TStreamIdParams) {
    return await LocalStreamPostsService.mergeUnreadStreamWithPostStream(params);
  }

  static async clearUnreadStream(params: TStreamIdParams): Promise<string[]> {
    return await LocalStreamPostsService.clearUnreadStream(params);
  }

  /**
   * Filter out deleted posts from a list of post IDs.
   * Posts without details in cache are kept (fail-open semantics).
   *
   * @param postIds - Array of post IDs to filter
   * @returns Array of post IDs that are not deleted
   */
  static async filterDeletedPosts(postIds: string[]): Promise<string[]> {
    return LocalPostService.filterDeletedPosts(postIds);
  }

  static async filterStreamPosts({
    streamId,
    postIds,
  }: {
    streamId: PostStreamId;
    postIds: string[];
  }): Promise<string[]> {
    // Bookmark and single-collection item feeds keep deleted posts so the post
    // component can render its deleted-state placeholder; all other streams drop them.
    const visiblePostIds = isDeletedRetainingStream(streamId)
      ? postIds
      : await LocalPostService.filterDeletedPosts(postIds);
    const afterCollections = await this.filterCollectionsFromStream({ streamId, postIds: visiblePostIds });
    // Discover drops empty collections (nothing to discover). Lives here so it is re-applied by
    // the controller's post-hydration second pass, catching ids that were fail-open on details.
    return isDiscoverCollectionsStream(streamId) ? this.filterEmptyCollections(afterCollections) : afterCollections;
  }

  /** Drop collections with zero items. Fail-open when local details are missing. */
  private static async filterEmptyCollections(postIds: string[]): Promise<string[]> {
    if (postIds.length === 0) return postIds;
    const details = await PostDetailsModel.findByIdsPreserveOrder(postIds);
    return postIds.filter((_id, index) => {
      const detail = details[index];
      if (!detail) return true;
      return (parseCollectionContent(detail.content)?.items?.length ?? 0) > 0;
    });
  }

  /**
   * Discover-only, id-based filters that need no post details: drop the viewer's own collections
   * and ones they have already bookmarked. Deterministic, so it runs once in the fetch loop and
   * never needs the post-hydration second pass.
   */
  static filterDiscoverOwnAndBookmarked(
    postIds: string[],
    viewerId: Pubky | null,
    bookmarkedIds: Set<string>,
  ): string[] {
    return postIds.filter((id) => {
      if (bookmarkedIds.has(id)) return false;
      if (viewerId) {
        // A malformed id parses to null and is treated as not-own (kept), so one bad id from
        // Nexus can't throw out of this filter and fail the whole fetch.
        let ownerPubky: Pubky | null = null;
        try {
          ownerPubky = parseCompositeId(id).pubky;
        } catch {
          ownerPubky = null;
        }
        if (ownerPubky === viewerId) return false;
      }
      return true;
    });
  }

  /**
   * Prepares the stream for initial load by performing cleanup operations.
   *
   * This method should be called before fetching the initial stream slice to ensure
   * the stream state is consistent. It performs the following operations:
   * 1. Clears stale cache if the stream head is older than configured max age
   * 2. Merges any existing unread posts into the main stream
   * 3. Clears the unread stream
   *
   * This prevents race conditions where the StreamCoordinator might fetch posts
   * that are already in the main stream (due to stale unread stream head).
   *
   * @param streamId - The ID of the stream to prepare
   */
  static async prepareStreamForInitialLoad({ streamId }: TStreamIdParams): Promise<void> {
    // Initial loads and pull-to-refresh should start from the real stream head,
    // not reuse buffered overflow from a previous pagination session.
    postStreamQueue.remove(streamId);

    // 0. Rebuild streams invalidated by follow/friendship/profile-tag mutations.
    // Mutations only mark scopes dirty (mounted feeds are never disturbed);
    // the stale membership is dropped here, on the next initial load (#2294).
    if (postStreamDirtyRegistry.isDirty(streamId)) {
      Logger.debug('[PostStreamApplication] Stream marked dirty by a dependency mutation, clearing both streams', {
        streamId,
      });
      await Promise.all([
        LocalStreamPostsService.deleteById({ streamId }),
        LocalStreamPostsService.clearUnreadStream({ streamId }),
      ]);
      postStreamDirtyRegistry.markReconciled(streamId);
      return;
    }

    const now = Date.now();

    // 1. Check if main stream cache is stale
    const mainStreamHead = await this.getMainStreamHeadTimestamp({ streamId });
    if (this.isTimestampStale(mainStreamHead, now)) {
      // Main cache is stale - clear both main stream and unread stream (both are outdated)
      Logger.debug('[PostStreamApplication] Main stream cache is stale, clearing both streams', {
        streamId,
        headTimestamp: mainStreamHead,
        ageMs: now - mainStreamHead,
        maxAgeMs: getStreamCacheMaxAgeMs(),
      });
      await Promise.all([
        LocalStreamPostsService.deleteById({ streamId }),
        LocalStreamPostsService.clearUnreadStream({ streamId }),
      ]);
      return;
    }

    // 2. Check if unread stream is stale before merging
    const unreadStreamHead = await this.getUnreadStreamHeadTimestamp({ streamId });
    if (this.isTimestampStale(unreadStreamHead, now)) {
      // Unread stream is stale - just clear it without merging
      Logger.debug('[PostStreamApplication] Unread stream is stale, clearing without merge', {
        streamId,
        headTimestamp: unreadStreamHead,
        ageMs: now - unreadStreamHead,
        maxAgeMs: getStreamCacheMaxAgeMs(),
      });
      await LocalStreamPostsService.clearUnreadStream({ streamId });
      return;
    }

    // 3. Both streams are fresh - merge unread posts into main stream and clear unread
    await LocalStreamPostsService.mergeUnreadStreamWithPostStream({ streamId });
    await LocalStreamPostsService.clearUnreadStream({ streamId });
  }

  /**
   * Check if a timestamp is stale (older than configured max age)
   * Returns false for sentinel values (0, 1) as they indicate empty/missing streams
   */
  private static isTimestampStale(timestamp: number, now: number): boolean {
    // Sentinel values indicate empty/missing streams - not stale
    if (timestamp === SKIP_FETCH_NEW_POSTS || timestamp === FORCE_FETCH_NEW_POSTS) {
      return false;
    }
    const ageMs = now - timestamp;
    return ageMs > getStreamCacheMaxAgeMs();
  }

  /**
   * Get the head timestamp of the main post stream only (not unread)
   */
  private static async getMainStreamHeadTimestamp({ streamId }: TStreamIdParams): Promise<number> {
    const postCompositeId = await PostStreamModel.getStreamHead(streamId);
    if (!postCompositeId) {
      return FORCE_FETCH_NEW_POSTS;
    }
    // Bookmark streams stale-check against bookmark time, not the (possibly old)
    // bookmarked post's `indexed_at` — otherwise bookmarking an old post would mark
    // the whole cache stale on every load and defeat local-first caching.
    if (isBookmarkStream(streamId)) {
      const bookmarkedAt = await this.getBookmarkTimestamp(postCompositeId as string);
      if (bookmarkedAt !== undefined) {
        return bookmarkedAt;
      }
    }
    const postDetails = await PostDetailsModel.findById(postCompositeId);
    return postDetails?.indexed_at ?? SKIP_FETCH_NEW_POSTS;
  }

  /**
   * Get the head timestamp of the unread stream only
   */
  private static async getUnreadStreamHeadTimestamp({ streamId }: TStreamIdParams): Promise<number> {
    const unreadCompositePostId = await UnreadPostStreamModel.getStreamHead(streamId);
    if (!unreadCompositePostId) {
      return FORCE_FETCH_NEW_POSTS;
    }
    if (isBookmarkStream(streamId)) {
      const bookmarkedAt = await this.getBookmarkTimestamp(unreadCompositePostId as string);
      if (bookmarkedAt !== undefined) {
        return bookmarkedAt;
      }
    }
    const postDetails = await PostDetailsModel.findById(unreadCompositePostId);
    return postDetails?.indexed_at ?? SKIP_FETCH_NEW_POSTS;
  }

  /**
   * Fetches a page of posts for a stream.
   * Filters out muted authors for most streams; skips filtering for author timelines and bookmarks.
   */
  static async getOrFetchStreamSlice({
    streamId,
    streamHead,
    streamTail,
    lastPostId,
    limit,
    viewerId,
    order,
  }: TFetchStreamParams): Promise<TPostStreamChunkResponse> {
    // Skip cache for ascending order (chronological) - always fetch from Nexus
    // This is because cache is stored in descending order
    // TODO: Might be a better way to handle this.
    if (order === StreamOrder.ASCENDING) {
      return await this.fetchStreamFromNexus({ streamId, limit, streamTail, streamHead, viewerId, order });
    }

    // Coordinator head-polls (streamHead > 0) only need the fetch side effects (unread
    // persist + counts + cache-miss ids); the response is discarded. Keep them out of the
    // shared pagination queue: routing them through collect() consumes/rewrites the UI's
    // overflow buffer, and with a raw resume anchor those buffered posts would be skipped.
    if (streamHead > SKIP_FETCH_NEW_POSTS) {
      return await this.fetchStreamFromNexus({ streamId, limit, streamTail, streamHead, viewerId, order });
    }

    // Author streams and bookmarks intentionally include posts from muted users:
    // bookmarks are explicit saves (#1804); profile is someone's full timeline.
    const shouldFilterMuted = !isAuthorStreamSkippingMuteFilter(streamId) && !isBookmarkStream(streamId);
    const mutedUserIds = shouldFilterMuted
      ? new Set((await LocalStreamUsersService.findById(UserStreamTypes.MUTED))?.stream ?? [])
      : new Set<Pubky>();

    // Discover Collections filters out the viewer's own and already-bookmarked collections in the
    // shared stream layer (like mute/deleted), so the section paginates like any other feed.
    const isDiscover = isDiscoverCollectionsStream(streamId);
    const bookmarkedIds = isDiscover ? new Set(await BookmarkModel.findAll()) : new Set<string>();

    let lastReturnedPostId: string | undefined = lastPostId;

    const { posts, cacheMissIds, nextCursor, reachedEnd } = await postStreamQueue.collect(streamId, {
      limit,
      cursor: streamTail,
      // Discover bounds its per-load scan tighter than the shared default: it is a
      // secondary surface, so we cap the data/latency cost of digging through a
      // heavily-filtered region and let the no-new-results toast + cursor advance
      // handle the give-up case instead.
      maxIterations: isDiscover ? COLLECTIONS_DISCOVER_MAX_FETCHES_PER_LOAD : undefined,
      filter: async (posts) => {
        // Muted users (sync), then deleted/kind/empty (async), then Discover's own/bookmarked.
        const afterMuteFilter = MuteFilter.filterPosts(posts, mutedUserIds);
        const standard = await PostStreamApplication.filterStreamPosts({ streamId, postIds: afterMuteFilter });
        return isDiscover
          ? PostStreamApplication.filterDiscoverOwnAndBookmarked(standard, viewerId, bookmarkedIds)
          : standard;
      },
      // Overflow-buffer early returns resolve score cursors stream-aware: bookmark
      // streams resume by bookmark time, everything else by the post's `indexed_at`.
      // Without this, the buffered path re-introduces the #2100 pagination seam.
      cursorForPost: (postId) => PostStreamApplication.getStreamCursorTimestamp(streamId, postId),
      fetch: async (cursor) => {
        // Continue reading from cache using lastReturnedPostId to track position
        // This ensures we exhaust cache before going to Nexus
        const result = await this.fetchStreamSliceInternal({
          streamId,
          // Head-polls (streamHead > 0) bypass collect() above, so every fetch here
          // is a pagination read below the head.
          streamHead: SKIP_FETCH_NEW_POSTS,
          streamTail: cursor,
          lastPostId: lastReturnedPostId,
          limit,
          viewerId,
          order,
        });

        // Track last returned post for cache continuation
        if (result.nextPageIds.length > 0) {
          lastReturnedPostId = result.nextPageIds[result.nextPageIds.length - 1];
        }

        return result;
      },
    });

    // Fetch original posts for any reposts served from cache
    // (handles case where repost is cached but original was evicted)
    try {
      const relationships = await LocalPostService.readRelationshipsByIds(posts);
      const repostedUris = relationships
        .filter((rel): rel is PostRelationshipsModelSchema => rel !== undefined && rel.reposted !== null)
        .map((rel) => rel.reposted as string);
      await this.fetchOriginalPostsByUris({ repostedUris, viewerId });
    } catch (error) {
      Logger.warn('Failed to fetch missing repost content', { postIds: posts, error });
    }

    return {
      nextPageIds: posts,
      cacheMissPostIds: cacheMissIds,
      nextCursor,
      reachedEnd,
      // The raw cache-walk anchor: last raw id scanned this round (buffer-only rounds
      // scan nothing, so it holds at the caller's own lastPostId).
      lastRawPostId: lastReturnedPostId,
    };
  }

  static async fetchStreamSlice(params: TFetchStreamParams): Promise<TPostStreamChunkResponse> {
    return await this.fetchStreamFromNexus(params);
  }

  // ============================================================================
  // Internal Helpers
  // ============================================================================

  /**
   * Gets the indexed_at timestamp from a post for pagination cursor advancement.
   * Returns undefined if the post details cannot be found.
   */
  private static async getPostTimestamp(postId: string): Promise<number | undefined> {
    try {
      const postDetails = await LocalPostService.readDetails({ postId });
      return postDetails?.indexed_at;
    } catch (error) {
      Logger.warn('Failed to get post timestamp', { postId, error });
      return undefined;
    }
  }

  /**
   * Bookmark time (`created_at`) for a post, or undefined if it isn't bookmarked
   * locally. Bookmark streams are ordered by this on Nexus — not the post's own
   * `indexed_at` — so it is the correct key for both pagination cursors and the
   * stream-head staleness check.
   */
  private static async getBookmarkTimestamp(postId: string): Promise<number | undefined> {
    try {
      const bookmark = await BookmarkModel.findById(postId);
      return typeof bookmark?.created_at === 'number' ? bookmark.created_at : undefined;
    } catch (error) {
      Logger.warn('Failed to get bookmark timestamp', { postId, error });
      return undefined;
    }
  }

  /**
   * Resolve the pagination cursor timestamp for a post within a given stream.
   *
   * Bookmark streams must page by bookmark time (see `getBookmarkTimestamp`) rather
   * than the post's `indexed_at`. Seeding the cursor from the post timestamp desyncs
   * the cache→Nexus pagination seam — a post bookmarked recently but created long ago
   * would send an old `start`, skipping or repeating bookmarks. Every other stream
   * paginates by the post's `indexed_at`.
   *
   * Falls open to the post timestamp if the bookmark row is missing.
   */
  private static async getStreamCursorTimestamp(streamId: PostStreamId, postId: string): Promise<number | undefined> {
    if (isBookmarkStream(streamId)) {
      const bookmarkedAt = await this.getBookmarkTimestamp(postId);
      if (bookmarkedAt !== undefined) {
        return bookmarkedAt;
      }
    }
    return this.getPostTimestamp(postId);
  }

  /**
   * Internal method that performs the actual fetch without mute filtering.
   * This is the original getOrFetchStreamSlice logic, now used as a building block.
   */
  private static async fetchStreamSliceInternal({
    streamId,
    streamHead,
    streamTail,
    lastPostId,
    limit,
    viewerId,
    order,
  }: TFetchStreamParams): Promise<TPostStreamChunkResponse> {
    // Avoid the indexdb query for skip-paginated streams (engagement + single-collection items):
    // their local cache is timestamp-keyed and incompatible with offset pagination.
    if (!isSkipPaginatedStream(streamId) && !streamHead) {
      const cachedStream = await LocalStreamPostsService.read({ streamId });

      if (cachedStream) {
        const cachedStreamChunk = await this.getStreamFromCache({ lastPostId, limit, cachedStream });

        // Full cache hit, return with proper cursor for pagination
        if (cachedStreamChunk.length === limit) {
          const lastCachedPostId = cachedStreamChunk[cachedStreamChunk.length - 1];
          const nextCursor = await this.getStreamCursorTimestamp(streamId, lastCachedPostId);
          return { nextPageIds: cachedStreamChunk, cacheMissPostIds: [], nextCursor, reachedEnd: false };
        }

        // Partial cache hit, fetch missing posts from Nexus and combine
        if (cachedStreamChunk.length > 0 && cachedStreamChunk.length < limit) {
          return await this.partialCacheHit({ cachedStreamChunk, limit, streamTail, streamId, viewerId });
        }
      }

      // Defensive check: If this is an initial load (no lastPostId) and cache doesn't exist or is empty,
      // force fetching from the beginning by setting streamTail to 0.
      // This ensures correctness even if a non-zero streamTail was incorrectly passed for an initial load.
      if (!lastPostId && (!cachedStream || cachedStream.stream.length === 0)) {
        streamTail = NOT_FOUND_CACHED_STREAM;
      }
    }
    return await this.fetchStreamFromNexus({ streamId, limit, streamTail, streamHead, viewerId, order });
  }

  /**
   * Fetch missing posts from nexus and persist them to cache
   * @param cacheMissPostIds - Array of post IDs that are not persisted in cache
   * @param viewerId - ID of the viewer
   * @param streamHead - Detects if the call is coming from the streamCoordinator.
   * @param streamId - ID of the stream. If not provided, it means that it is a single post operation.
   */
  static async fetchMissingPostsFromNexus({ cacheMissPostIds, viewerId }: TMissingPostsParams) {
    try {
      const postBatch = await NexusPostStreamService.fetchByIds({
        post_ids: cacheMissPostIds,
        // Only pass viewer_id if it's a valid string (not null/undefined)
        ...(viewerId ? { viewer_id: viewerId } : {}),
      });
      const { attachmentMetadata } = await LocalStreamPostsService.persistPosts({ posts: postBatch });
      await FileApplication.persistFiles(attachmentMetadata);
      // Persist the missing authors of the posts
      await this.fetchMissingUsersFromNexus({ posts: postBatch, viewerId });
      // Fetch original posts for any reposts (to display embedded repost content)
      const repostedUris = postBatch
        .map((post) => post.relationships.reposted)
        .filter((uri): uri is string => uri !== null);
      await this.fetchOriginalPostsByUris({ repostedUris, viewerId });
    } catch (error) {
      Logger.warn('Failed to fetch missing posts from Nexus', { cacheMissPostIds, viewerId, error });
    }
  }

  /**
   * Shared logic for fetching original posts by their URIs.
   * Converts URIs to IDs, checks cache, fetches missing posts from Nexus, and persists them.
   * This method is public to allow reuse by TtlApplication for refreshing repost originals.
   * @param repostedUris - Array of pubky URIs pointing to original posts
   * @param viewerId - ID of the viewer
   */
  static async fetchOriginalPostsByUris({
    repostedUris,
    viewerId,
  }: {
    repostedUris: string[];
    /** Optional viewer ID for relationship data. Null/undefined for unauthenticated views. */
    viewerId?: Pubky | null;
  }) {
    if (repostedUris.length === 0) return;

    // Convert URIs to composite IDs and deduplicate
    const originalPostIds = Array.from(
      new Set(
        repostedUris
          .map((uri) =>
            buildCompositeIdFromPubkyUri({
              uri,
              domain: CompositeIdDomain.POSTS,
            }),
          )
          .filter((id): id is string => id !== null),
      ),
    );

    if (originalPostIds.length === 0) return;

    // Filter out posts already in local DB
    const missingOriginalPostIds = await LocalStreamPostsService.getNotPersistedPostsInCache(originalPostIds);

    if (missingOriginalPostIds.length === 0) return;

    Logger.debug('Fetching original posts for reposts', {
      repostCount: repostedUris.length,
      originalCount: originalPostIds.length,
      missingOriginalCount: missingOriginalPostIds.length,
    });

    try {
      const originalPosts = await NexusPostStreamService.fetchByIds({
        post_ids: missingOriginalPostIds,
        viewer_id: viewerId ?? undefined,
      });
      const { attachmentMetadata } = await LocalStreamPostsService.persistPosts({ posts: originalPosts });
      await FileApplication.persistFiles(attachmentMetadata);
      await this.fetchMissingUsersFromNexus({ posts: originalPosts, viewerId });
    } catch (error) {
      Logger.warn('Failed to fetch original posts for reposts', { missingOriginalPostIds, error });
    }
  }

  /**
   * Handles partial cache hits by fetching remaining posts from Nexus and combining with cached posts.
   *
   * @param cachedStreamChunk - Array of post IDs from cache that need to be combined with fetched posts
   * @param limit - Maximum number of posts to return
   * @param streamTail - Timestamp or skip count for pagination
   * @param streamId - ID of the post stream
   * @param viewerId - ID of the viewer
   **/
  private static async partialCacheHit({
    cachedStreamChunk,
    limit,
    streamTail,
    streamId,
    viewerId,
  }: TPartialCacheHitParams): Promise<TPostStreamChunkResponse> {
    const lastCachedPostId = cachedStreamChunk[cachedStreamChunk.length - 1];
    const remainingLimit = limit - cachedStreamChunk.length;

    // Get cursor from last cached post for pagination (bookmark-time for bookmark streams)
    const nextStreamTail = (await this.getStreamCursorTimestamp(streamId, lastCachedPostId)) ?? streamTail;

    // Fetch remaining posts from Nexus
    const { nextPageIds, cacheMissPostIds, nextCursor, reachedEnd } = await this.fetchStreamFromNexus({
      streamId,
      limit: remainingLimit,
      streamTail: nextStreamTail,
      streamHead: SKIP_FETCH_NEW_POSTS,
      viewerId,
      lastPostId: lastCachedPostId,
    });

    // Combine cached posts with fetched posts, deduplicating
    const uniquePostIds = Array.from(new Set([...cachedStreamChunk, ...nextPageIds]));

    return {
      nextPageIds: uniquePostIds,
      cacheMissPostIds,
      nextCursor,
      // Propagate reachedEnd from Nexus - don't recalculate from deduped length
      reachedEnd: reachedEnd ?? false,
    };
  }

  private static async fetchMissingUsersFromNexus({ posts, viewerId }: TFetchMissingUsersParams) {
    const cacheMissUserIds = await this.getNotPersistedUsersInCache(posts.map((post) => post.details.author));
    if (cacheMissUserIds.length > 0) {
      const userBatch = await NexusUserStreamService.fetchByIds({
        user_ids: cacheMissUserIds,
        viewer_id: viewerId ?? undefined,
      });
      await LocalStreamUsersService.persistUsers(userBatch);
    }
  }

  private static async fetchStreamFromNexus({
    streamId,
    limit,
    streamHead,
    streamTail,
    viewerId,
    order,
  }: TFetchStreamParams): Promise<TPostStreamChunkResponse> {
    const { params, invokeEndpoint, extraParams } = createPostStreamParams({
      streamId,
      streamTail,
      limit,
      streamHead,
      viewerId,
      order,
    });
    const postStreamChunk = await NexusPostStreamService.fetch({ invokeEndpoint, params, extraParams });
    // `last_post_score` is null for skip streams; normalize to undefined (advanceCursor derives
    // their offset from the raw page instead).
    const { last_post_score: rawScore, post_keys: compositePostIds } = postStreamChunk;

    // Do not persist skip-paginated streams (engagement + single-collection items) to the
    // timestamp-keyed local stream cache; they always page from Nexus by offset.
    if (!isSkipPaginatedStream(streamId) && streamHead === SKIP_FETCH_NEW_POSTS) {
      await LocalStreamPostsService.persistNewStreamChunk({ stream: compositePostIds, streamId });
    }

    // When streamHead is greater than 0, it means that it is a streamCoordinator calling this method.
    // In the future, we might need to add some enum param to describe that type of call.
    // For now, that kind of queries comes from the streamCoordinator.
    if (streamHead > SKIP_FETCH_NEW_POSTS) {
      await this.persistUnreadStreamChunkAndUpdateCounts({
        streamId,
        compositePostIds,
      });
    }

    const cacheMissPostIds = await this.getNotPersistedPostsInCache(compositePostIds);

    // reachedEnd is true when Nexus returned fewer posts than requested (actual end of stream)
    return {
      nextPageIds: compositePostIds,
      cacheMissPostIds,
      nextCursor: rawScore ?? undefined,
      reachedEnd: compositePostIds.length < limit,
    };
  }

  // Delegate to service for cache miss detection
  private static async getNotPersistedPostsInCache(postIds: string[]): Promise<string[]> {
    return LocalStreamPostsService.getNotPersistedPostsInCache(postIds);
  }

  private static async filterCollectionsFromStream({
    streamId,
    postIds,
  }: {
    streamId: PostStreamId;
    postIds: string[];
  }): Promise<string[]> {
    if (!this.shouldExcludeCollectionsFromStream(streamId) || postIds.length === 0) {
      return postIds;
    }

    const postDetails = await LocalPostService.readDetailsByIds(postIds);
    return postIds.filter((_postId, index) => postDetails[index]?.kind !== StreamKind.COLLECTION);
  }

  /** Collections appear only on streams whose id encodes `kind=collection` (e.g. timeline:all:collection). */
  private static shouldExcludeCollectionsFromStream(streamId: PostStreamId): boolean {
    const { kind } = breakDownStreamId(streamId);
    return kind !== StreamKind.COLLECTION;
  }

  /**
   * Persist the unread stream chunk and update the counts of the posts and users
   * @param streamId - The ID of the stream
   * @param compositePostIds - The new posts IDs that are going to be persisted in the unreadstream
   */
  private static async persistUnreadStreamChunkAndUpdateCounts({
    streamId,
    compositePostIds,
  }: TPersistUnreadNewStreamChunkParams) {
    const newToUnreadStream = await LocalStreamPostsService.persistUnreadNewStreamChunk({
      stream: compositePostIds,
      streamId,
    });

    // Skip count updates if no new posts were added to unread stream
    if (newToUnreadStream.length === 0) return;

    // Filter out posts that already exist in the database (e.g., locally created posts).
    // These posts have already been counted when they were created, so we should not
    // increment counts again when they arrive via the unread stream.
    const notInDatabase = await this.getNotPersistedPostsInCache(newToUnreadStream);

    // Skip count updates if all posts already exist in the database
    if (notInDatabase.length === 0) return;

    // Also filter out posts that are already in the main post stream for this streamId.
    // This catches locally created posts that were added to the stream but might not
    // have been committed to PostDetailsModel yet due to transaction timing.
    const existingStream = await LocalStreamPostsService.read({ streamId });
    const existingStreamIds = new Set(existingStream?.stream ?? []);
    const trulyNewPostIds = notInDatabase.filter((id) => !existingStreamIds.has(id));

    // Skip count updates if all posts are already in the stream
    if (trulyNewPostIds.length === 0) return;

    // The authorId and postId are going to be use to identify the replies parent id
    const { sorting: replyParentAuthorId, invokeEndpoint, kind: replyParentPostId } = breakDownStreamId(streamId);

    // If it is a reply, we need to update the parent post counts
    // TODO: Might happen some edge cases but for now, we can go with this approach.
    if (invokeEndpoint === StreamSource.REPLIES) {
      const replyParentPostCompositeId = buildCompositeId({
        pubky: replyParentAuthorId,
        id: replyParentPostId as string,
      });
      await LocalPostService.updatePostCounts({
        postCompositeId: replyParentPostCompositeId,
        countChanges: { replies: trulyNewPostIds.length },
      });
    }

    // NOTE: We intentionally do NOT optimistically bump the post authors' user
    // `posts`/`replies` counts from streamed-in posts. That bump was unlinked from
    // Nexus — it had no reconciliation against when each author's count was last
    // fetched — so it double-counted and could show counts higher than reality,
    // which the TTL refetch then snapped back down. The authoritative counts come
    // from `fetchCounts` (TTL), and a user's own actions are still reflected
    // instantly via the mutation paths (create/delete/follow/bookmark).
  }

  // Delegate to service for cache miss detection
  private static async getNotPersistedUsersInCache(userIds: Pubky[]): Promise<Pubky[]> {
    const existingUserIds = await UserDetailsModel.findByIdsPreserveOrder(userIds);
    const missingUserIds = userIds.filter((_userId, index) => existingUserIds[index] === undefined);
    return Array.from(new Set(missingUserIds));
  }

  private static async getStreamFromCache({ lastPostId, limit, cachedStream }: TCacheStreamParams): Promise<string[]> {
    // Handle limit 0 case, return empty array immediately
    if (limit === 0) {
      return [];
    }

    // If the lastPostId is not provided, it means that we are in the head of the stream
    if (!lastPostId) {
      // Return all available posts from cache (up to limit)
      // If cache has fewer posts than limit, return what's available
      return cachedStream.stream.slice(0, Math.min(limit, cachedStream.stream.length));
    }

    // lastPostId is provided, find the position in cache
    const postIndex = cachedStream.stream.indexOf(lastPostId);
    if (postIndex === -1) {
      // lastPostId not found in cache, cannot serve from cache
      return [];
    }

    // Return all available posts after lastPostId (up to limit)
    // If cache has fewer posts than requested, return what's available
    const startIndex = postIndex + 1;
    const endIndex = Math.min(startIndex + limit, cachedStream.stream.length);

    if (startIndex >= cachedStream.stream.length) {
      // No posts after lastPostId in cache
      return [];
    }

    return cachedStream.stream.slice(startIndex, endIndex);
  }
}
