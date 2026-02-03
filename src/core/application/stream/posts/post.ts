import * as Core from '@/core';
import * as Config from '@/config';
import * as Libs from '@/libs';
import { postStreamQueue } from './muting/post-stream-queue';
import { MuteFilter } from './muting/mute-filter';

export class PostStreamApplication {
  private constructor() {}

  // ============================================================================
  // Public API
  // ============================================================================

  static async getUnreadStream({ streamId }: Core.TStreamIdParams): Promise<Core.TStreamResult | null> {
    return await Core.LocalStreamPostsService.readUnreadStream({ streamId });
  }

  static async getCachedLastPostTimestamp({ streamId }: Core.TStreamIdParams): Promise<number> {
    try {
      const postStream = await Core.LocalStreamPostsService.read({ streamId });
      if (!postStream || postStream.stream.length === 0) {
        Libs.Logger.warn('StreamId not found in cache', { streamId });
        return Core.NOT_FOUND_CACHED_STREAM;
      }

      // Iterate backwards through the stream to find the last post that has details
      // This handles cases where the last PostDetails might be missing
      for (let i = postStream.stream.length - 1; i >= 0; i--) {
        const postId = postStream.stream[i];
        const postDetails = await Core.LocalPostService.readDetails({ postId });

        if (postDetails) {
          return postDetails.indexed_at;
        }
      }

      // No posts in the stream have details, cache is not useful
      Libs.Logger.warn('No post details found in cached stream', { streamId, streamLength: postStream.stream.length });
      return Core.NOT_FOUND_CACHED_STREAM;
    } catch (error) {
      Libs.Logger.warn('Failed to get timeline initial cursor', { streamId, error });
      return Core.NOT_FOUND_CACHED_STREAM;
    }
  }

  /**
   * Gets the head of the stream
   * @param params - The parameters for the stream
   * @returns The postId of the head of the stream
   */
  static async getStreamHead(params: Core.TStreamIdParams): Promise<number> {
    return await Core.LocalStreamPostsService.getStreamHead(params);
  }

  /**
   * Get local stream data from cache
   * @param streamId - The ID of the stream
   * @returns The cached stream or null if not found
   */
  static async getLocalStream({ streamId }: Core.TStreamIdParams): Promise<Core.TStreamResult | null> {
    return await Core.LocalStreamPostsService.read({ streamId });
  }

  static async mergeUnreadStreamWithPostStream(params: Core.TStreamIdParams) {
    return await Core.LocalStreamPostsService.mergeUnreadStreamWithPostStream(params);
  }

  static async clearUnreadStream(params: Core.TStreamIdParams): Promise<string[]> {
    return await Core.LocalStreamPostsService.clearUnreadStream(params);
  }

  /**
   * Filter out deleted posts from a list of post IDs.
   * Posts without details in cache are kept (fail-open semantics).
   *
   * @param postIds - Array of post IDs to filter
   * @returns Array of post IDs that are not deleted
   */
  static async filterDeletedPosts(postIds: string[]): Promise<string[]> {
    return Core.LocalPostService.filterDeletedPosts(postIds);
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
  static async prepareStreamForInitialLoad({ streamId }: Core.TStreamIdParams): Promise<void> {
    const now = Date.now();

    // 1. Check if main stream cache is stale
    const mainStreamHead = await this.getMainStreamHeadTimestamp({ streamId });
    if (this.isTimestampStale(mainStreamHead, now)) {
      // Main cache is stale - clear both main stream and unread stream (both are outdated)
      Libs.Logger.debug('[PostStreamApplication] Main stream cache is stale, clearing both streams', {
        streamId,
        headTimestamp: mainStreamHead,
        ageMs: now - mainStreamHead,
        maxAgeMs: Config.STREAM_CACHE_MAX_AGE_MS,
      });
      await Promise.all([
        Core.LocalStreamPostsService.deleteById({ streamId }),
        Core.LocalStreamPostsService.clearUnreadStream({ streamId }),
      ]);
      return;
    }

    // 2. Check if unread stream is stale before merging
    const unreadStreamHead = await this.getUnreadStreamHeadTimestamp({ streamId });
    if (this.isTimestampStale(unreadStreamHead, now)) {
      // Unread stream is stale - just clear it without merging
      Libs.Logger.debug('[PostStreamApplication] Unread stream is stale, clearing without merge', {
        streamId,
        headTimestamp: unreadStreamHead,
        ageMs: now - unreadStreamHead,
        maxAgeMs: Config.STREAM_CACHE_MAX_AGE_MS,
      });
      await Core.LocalStreamPostsService.clearUnreadStream({ streamId });
      return;
    }

    // 3. Both streams are fresh - merge unread posts into main stream and clear unread
    await Core.LocalStreamPostsService.mergeUnreadStreamWithPostStream({ streamId });
    await Core.LocalStreamPostsService.clearUnreadStream({ streamId });
  }

  /**
   * Check if a timestamp is stale (older than configured max age)
   * Returns false for sentinel values (0, 1) as they indicate empty/missing streams
   */
  private static isTimestampStale(timestamp: number, now: number): boolean {
    // Sentinel values indicate empty/missing streams - not stale
    if (timestamp === Core.SKIP_FETCH_NEW_POSTS || timestamp === Core.FORCE_FETCH_NEW_POSTS) {
      return false;
    }
    const ageMs = now - timestamp;
    return ageMs > Config.STREAM_CACHE_MAX_AGE_MS;
  }

  /**
   * Get the head timestamp of the main post stream only (not unread)
   */
  private static async getMainStreamHeadTimestamp({ streamId }: Core.TStreamIdParams): Promise<number> {
    const postCompositeId = await Core.PostStreamModel.getStreamHead(streamId);
    if (!postCompositeId) {
      return Core.FORCE_FETCH_NEW_POSTS;
    }
    const postDetails = await Core.PostDetailsModel.findById(postCompositeId);
    return postDetails?.indexed_at ?? Core.SKIP_FETCH_NEW_POSTS;
  }

  /**
   * Get the head timestamp of the unread stream only
   */
  private static async getUnreadStreamHeadTimestamp({ streamId }: Core.TStreamIdParams): Promise<number> {
    const unreadCompositePostId = await Core.UnreadPostStreamModel.getStreamHead(streamId);
    if (!unreadCompositePostId) {
      return Core.FORCE_FETCH_NEW_POSTS;
    }
    const postDetails = await Core.PostDetailsModel.findById(unreadCompositePostId);
    return postDetails?.indexed_at ?? Core.SKIP_FETCH_NEW_POSTS;
  }

  /**
   * Fetches a page of posts for a stream, filtering out muted users.
   */
  static async getOrFetchStreamSlice({
    streamId,
    streamHead,
    streamTail,
    lastPostId,
    limit,
    viewerId,
    order,
  }: Core.TFetchStreamParams): Promise<Core.TPostStreamChunkResponse> {
    // Skip cache for ascending order (chronological) - always fetch from Nexus
    // This is because cache is stored in descending order
    // TODO: Might be a better way to handle this.
    if (order === Core.StreamOrder.ASCENDING) {
      return await this.fetchStreamFromNexus({ streamId, limit, streamTail, streamHead, viewerId, order });
    }

    const shouldFilterMuted = !streamId.startsWith(`${Core.StreamSource.AUTHOR}:`);
    const mutedUserIds = shouldFilterMuted
      ? new Set((await Core.LocalStreamUsersService.findById(Core.UserStreamTypes.MUTED))?.stream ?? [])
      : new Set<Core.Pubky>();

    let isFirstFetch = true;
    let lastReturnedPostId: string | undefined = lastPostId;

    const { posts, cacheMissIds, timestamp, reachedEnd } = await postStreamQueue.collect(streamId, {
      limit,
      cursor: streamTail,
      filter: async (posts) => {
        // First filter muted users (sync), then filter deleted posts (async)
        const afterMuteFilter = MuteFilter.filterPosts(posts, mutedUserIds);
        return Core.LocalPostService.filterDeletedPosts(afterMuteFilter);
      },
      fetch: async (cursor) => {
        // Continue reading from cache using lastReturnedPostId to track position
        // This ensures we exhaust cache before going to Nexus
        const result = await this.fetchStreamSliceInternal({
          streamId,
          streamHead: isFirstFetch ? streamHead : Core.SKIP_FETCH_NEW_POSTS,
          streamTail: cursor,
          lastPostId: lastReturnedPostId,
          limit,
          viewerId,
          order,
        });
        isFirstFetch = false;

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
      const relationships = await Core.LocalPostService.readRelationshipsByIds(posts);
      const repostedUris = relationships
        .filter((rel): rel is Core.PostRelationshipsModelSchema => rel !== undefined && rel.reposted !== null)
        .map((rel) => rel.reposted as string);
      await this.fetchOriginalPostsByUris({ repostedUris, viewerId });
    } catch (error) {
      Libs.Logger.warn('Failed to fetch missing repost content', { postIds: posts, error });
    }

    return {
      nextPageIds: posts,
      cacheMissPostIds: cacheMissIds,
      timestamp,
      reachedEnd,
    };
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
      const postDetails = await Core.LocalPostService.readDetails({ postId });
      return postDetails?.indexed_at;
    } catch (error) {
      Libs.Logger.warn('Failed to get post timestamp', { postId, error });
      return undefined;
    }
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
  }: Core.TFetchStreamParams): Promise<Core.TPostStreamChunkResponse> {
    // Avoid the indexdb query for engagement streams even we do not persist
    if (streamId.split(':')[0] !== Core.StreamSorting.ENGAGEMENT && !streamHead) {
      const cachedStream = await Core.LocalStreamPostsService.read({ streamId });

      if (cachedStream) {
        const cachedStreamChunk = await this.getStreamFromCache({ lastPostId, limit, cachedStream });

        // Full cache hit, return with proper timestamp for pagination
        if (cachedStreamChunk.length === limit) {
          const lastCachedPostId = cachedStreamChunk[cachedStreamChunk.length - 1];
          const timestamp = await this.getPostTimestamp(lastCachedPostId);
          return { nextPageIds: cachedStreamChunk, cacheMissPostIds: [], timestamp };
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
        streamTail = Core.NOT_FOUND_CACHED_STREAM;
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
  static async fetchMissingPostsFromNexus({ cacheMissPostIds, viewerId }: Core.TMissingPostsParams) {
    try {
      const postBatch = await Core.NexusPostStreamService.fetchByIds({
        post_ids: cacheMissPostIds,
        // Only pass viewer_id if it's a valid string (not null/undefined)
        ...(viewerId ? { viewer_id: viewerId } : {}),
      });
      const { postAttachments } = await Core.LocalStreamPostsService.persistPosts({ posts: postBatch });
      // Persist the post attachments metadata
      await Core.FileApplication.fetchFiles(postAttachments);
      // Persist the missing authors of the posts
      await this.fetchMissingUsersFromNexus({ posts: postBatch, viewerId });
      // Fetch original posts for any reposts (to display embedded repost content)
      const repostedUris = postBatch
        .map((post) => post.relationships.reposted)
        .filter((uri): uri is string => uri !== null);
      await this.fetchOriginalPostsByUris({ repostedUris, viewerId });
    } catch (error) {
      Libs.Logger.warn('Failed to fetch missing posts from Nexus', { cacheMissPostIds, viewerId, error });
    }
  }

  /**
   * Core logic for fetching original posts by their URIs.
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
    viewerId?: Core.Pubky | null;
  }) {
    if (repostedUris.length === 0) return;

    // Convert URIs to composite IDs and deduplicate
    const originalPostIds = Array.from(
      new Set(
        repostedUris
          .map((uri) =>
            Core.buildCompositeIdFromPubkyUri({
              uri,
              domain: Core.CompositeIdDomain.POSTS,
            }),
          )
          .filter((id): id is string => id !== null),
      ),
    );

    if (originalPostIds.length === 0) return;

    // Filter out posts already in local DB
    const missingOriginalPostIds = await Core.LocalStreamPostsService.getNotPersistedPostsInCache(originalPostIds);

    if (missingOriginalPostIds.length === 0) return;

    Libs.Logger.debug('Fetching original posts for reposts', {
      repostCount: repostedUris.length,
      originalCount: originalPostIds.length,
      missingOriginalCount: missingOriginalPostIds.length,
    });

    try {
      const originalPosts = await Core.NexusPostStreamService.fetchByIds({
        post_ids: missingOriginalPostIds,
        viewer_id: viewerId ?? undefined,
      });
      const { postAttachments } = await Core.LocalStreamPostsService.persistPosts({ posts: originalPosts });
      await Core.FileApplication.fetchFiles(postAttachments);
      await this.fetchMissingUsersFromNexus({ posts: originalPosts, viewerId });
    } catch (error) {
      Libs.Logger.warn('Failed to fetch original posts for reposts', { missingOriginalPostIds, error });
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
  }: Core.TPartialCacheHitParams): Promise<Core.TPostStreamChunkResponse> {
    const lastCachedPostId = cachedStreamChunk[cachedStreamChunk.length - 1];
    const remainingLimit = limit - cachedStreamChunk.length;

    // Get timestamp from last cached post for pagination cursor
    const nextStreamTail = (await this.getPostTimestamp(lastCachedPostId)) ?? streamTail;

    // Fetch remaining posts from Nexus
    const { nextPageIds, cacheMissPostIds, timestamp } = await this.fetchStreamFromNexus({
      streamId,
      limit: remainingLimit,
      streamTail: nextStreamTail,
      streamHead: Core.SKIP_FETCH_NEW_POSTS,
      viewerId,
      lastPostId: lastCachedPostId,
    });

    // Combine cached posts with fetched posts, deduplicating
    const uniquePostIds = Array.from(new Set([...cachedStreamChunk, ...nextPageIds]));

    return {
      nextPageIds: uniquePostIds,
      cacheMissPostIds,
      timestamp,
      reachedEnd: false,
    };
  }

  private static async fetchMissingUsersFromNexus({ posts, viewerId }: Core.TFetchMissingUsersParams) {
    const cacheMissUserIds = await this.getNotPersistedUsersInCache(posts.map((post) => post.details.author));
    if (cacheMissUserIds.length > 0) {
      const userBatch = await Core.NexusUserStreamService.fetchByIds({
        user_ids: cacheMissUserIds,
        viewer_id: viewerId ?? undefined,
      });
      await Core.LocalStreamUsersService.persistUsers(userBatch);
    }
  }

  private static async fetchStreamFromNexus({
    streamId,
    limit,
    streamHead,
    streamTail,
    viewerId,
    order,
  }: Core.TFetchStreamParams): Promise<Core.TPostStreamChunkResponse> {
    const { params, invokeEndpoint, extraParams } = Core.createPostStreamParams({
      streamId,
      streamTail,
      limit,
      streamHead,
      viewerId,
      order,
    });
    const postStreamChunk = await Core.NexusPostStreamService.fetch({ invokeEndpoint, params, extraParams });
    const { last_post_score: timestamp, post_keys: compositePostIds } = postStreamChunk;

    // Do not persist any stream related with engagement sorting
    if (streamId.split(':')[0] !== Core.StreamSorting.ENGAGEMENT && streamHead === Core.SKIP_FETCH_NEW_POSTS) {
      await Core.LocalStreamPostsService.persistNewStreamChunk({ stream: compositePostIds, streamId });
    }

    // When streamHead is greater than 0, it means that it is a streamCoordinator calling this method.
    // In the future, we might need to add some enum param to describe that type of call.
    // For now, that kind of queries comes from the streamCoordinator.
    if (streamHead > Core.SKIP_FETCH_NEW_POSTS) {
      await this.persistUnreadStreamChunkAndUpdateCounts({
        streamId,
        compositePostIds,
      });
    }

    const cacheMissPostIds = await this.getNotPersistedPostsInCache(compositePostIds);

    return { nextPageIds: compositePostIds, cacheMissPostIds, timestamp };
  }

  // Delegate to service for cache miss detection
  private static async getNotPersistedPostsInCache(postIds: string[]): Promise<string[]> {
    return Core.LocalStreamPostsService.getNotPersistedPostsInCache(postIds);
  }

  /**
   * Persist the unread stream chunk and update the counts of the posts and users
   * @param streamId - The ID of the stream
   * @param compositePostIds - The new posts IDs that are going to be persisted in the unreadstream
   */
  private static async persistUnreadStreamChunkAndUpdateCounts({
    streamId,
    compositePostIds,
  }: Core.TPersistUnreadNewStreamChunkParams) {
    const newToUnreadStream = await Core.LocalStreamPostsService.persistUnreadNewStreamChunk({
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
    const existingStream = await Core.LocalStreamPostsService.read({ streamId });
    const existingStreamIds = new Set(existingStream?.stream ?? []);
    const trulyNewPostIds = notInDatabase.filter((id) => !existingStreamIds.has(id));

    // Skip count updates if all posts are already in the stream
    if (trulyNewPostIds.length === 0) return;

    // The authorId and postId are going to be use to identify the replies parent id
    const [replyParentAuthorId, invokeEndpoint, replyParentPostId] = Core.breakDownStreamId(streamId);

    // If it is a reply, we need to update the parent post counts
    // TODO: Might happen some edge cases but for now, we can go with this approach.
    if (invokeEndpoint === Core.StreamSource.REPLIES) {
      const replyParentPostCompositeId = Core.buildCompositeId({
        pubky: replyParentAuthorId,
        id: replyParentPostId as string,
      });
      await Core.LocalPostService.updatePostCounts({
        postCompositeId: replyParentPostCompositeId,
        countChanges: { replies: trulyNewPostIds.length },
      });
    }

    // Update the related user counts of the authors of the posts
    // Only update counts for posts that are truly new (not in unread stream AND not in database)
    if (invokeEndpoint === Core.StreamSource.REPLIES || invokeEndpoint === Core.StreamSource.ALL) {
      const countUpdates = trulyNewPostIds.map(async (postId) => {
        const { pubky: authorId } = Core.parseCompositeId(postId);
        const countChanges: Core.TUserCountsCountChanges = { posts: 1 };
        if (invokeEndpoint === Core.StreamSource.REPLIES) {
          countChanges.replies = 1;
        }
        return Core.LocalUserService.updateCounts({ userId: authorId, countChanges });
      });
      await Promise.all(countUpdates);
    }
  }

  // Delegate to service for cache miss detection
  private static async getNotPersistedUsersInCache(userIds: Core.Pubky[]): Promise<Core.Pubky[]> {
    const existingUserIds = await Core.UserDetailsModel.findByIdsPreserveOrder(userIds);
    const missingUserIds = userIds.filter((_userId, index) => existingUserIds[index] === undefined);
    return Array.from(new Set(missingUserIds));
  }

  private static async getStreamFromCache({
    lastPostId,
    limit,
    cachedStream,
  }: Core.TCacheStreamParams): Promise<string[]> {
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
