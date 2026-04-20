import * as Core from '@/core';
import * as Config from '@/config';

// -=-=-=-=-=-=-=-=-=-=-=-=-=- POPULARITY STREAMS -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// If we are in engagement mode, we might not have background live updates. There is no
// identifier to fetch updates from redis. Always the top post has the max engagement
// when we render the first 10. In engagement mode, we use skip to paginate, not the score.
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--=-=--=-=-

// -=-=-=-=-=-=-=-=-=-=-=-=-= OBSERVER ID =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// We can clone the same behavior of profile. To see an external user post stream, the url
// of streams should be /home/[external_user_id]. If we want logged user post stream,
// the url of streams should be /home.
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

export class StreamPostsController {
  private constructor() {} // Prevent instantiation

  /**
   * Retrieves or fetches a slice of posts from a stream.
   *
   * @param params - Parameters for the stream slice request
   * @param params.streamId - Unique identifier for the stream (e.g., 'timeline:all:all', 'engagement:all:images')
   * @param params.streamHead - Identifier of the newest post in the current page for pagination.
   * @param params.streamTail - Identifier of the last post in the current page for pagination. timestamp (timeline mode) or skip (engagement mode)
   * @param params.lastPostId - Post ID of the last post in the current page. We use to get the chunk of the stream from the cache.
   * @param params.limit - Limit of posts to fetch. Default is Config.NEXUS_POSTS_PER_PAGE.
   *
   * @returns Promise resolving to stream slice response containing:
   * - nextPageIds: Array of post IDs for the current page
   * - timestamp: Timestamp for pagination of the next page
   *
   * // Get next page using the last post ID
   * const nextPage = await StreamPostsController.getOrFetchStreamSlice({
   *   streamId: 'timeline:all:all',
   *   streamTail: 1762843325,
   *   lastPostId: 'user_id:post_id',
   * });
   * // Get next page (5th page) of engagement stream
   * const nextPage = await StreamPostsController.getOrFetchStreamSlice({
   *   streamId: 'engagement:all:images',
   *   streamTail: 40
   * });
   * ```
   */
  static async getOrFetchStreamSlice({
    streamId,
    streamHead = Core.SKIP_FETCH_NEW_POSTS,
    streamTail = Core.NOT_FOUND_CACHED_STREAM,
    lastPostId,
    limit = Config.NEXUS_POSTS_PER_PAGE,
    order,
  }: Core.TReadPostStreamChunkParams): Promise<Core.TReadPostStreamChunkResponse> {
    // selectCurrentUserPubky() throws an error when user is not authenticated;
    // access currentUserPubky directly to get null instead (unauthenticated users can view profile posts)
    const viewerId = Core.useAuthStore.getState().currentUserPubky;
    const { nextPageIds, cacheMissPostIds, timestamp, reachedEnd } =
      await Core.PostStreamApplication.getOrFetchStreamSlice({
        streamId,
        limit,
        streamHead,
        streamTail,
        lastPostId,
        viewerId,
        order,
      });
    // Query nexus to get the cacheMissPostIds
    if (cacheMissPostIds.length > 0) {
      // TODO: When TTL is implemented, we can return to void
      await Core.PostStreamApplication.fetchMissingPostsFromNexus({
        cacheMissPostIds,
        viewerId,
      });
      // Second-pass: cache-miss details are now resolved,
      // re-filter to catch posts that were fail-open in the first pass
      const validIds = await Core.PostStreamApplication.filterDeletedPosts(nextPageIds);
      return { nextPageIds: validIds, timestamp, reachedEnd };
    }
    return { nextPageIds, timestamp, reachedEnd };
  }

  /**
   * Gets the timestamp of the last cached post in a stream.
   *
   * Extracts the indexed_at timestamp from the oldest post in the cached stream.
   * Returns 0 if no cached stream exists or if the last post's details cannot be found.
   *
   * @param streamId - The ID of the post stream to query
   * @returns Promise resolving to the timestamp (number) or 0 if not found
   */
  static async getCachedLastPostTimestamp(params: Core.TStreamIdParams): Promise<number> {
    return await Core.PostStreamApplication.getCachedLastPostTimestamp(params);
  }

  /**
   *
   * The "head" refers to the first post in the stream array, which represents
   * the most recently indexed post. For reply streams without a cached head,
   * returns 1 if replies exist, otherwise 0.
   *
   * @param streamId - The stream ID to get the head timestamp for
   * @returns The indexed_at timestamp of the head post, or 0 if the stream is empty or head post not found
   */
  static async getStreamHead(params: Core.TStreamIdParams): Promise<number> {
    return await Core.PostStreamApplication.getStreamHead(params);
  }

  /**
   * Get local stream data from cache
   * @param streamId - The ID of the stream
   * @returns The cached stream or null if not found
   */
  static async getLocalStream(params: Core.TStreamIdParams): Promise<Core.TStreamResult | null> {
    return await Core.PostStreamApplication.getLocalStream(params);
  }

  /**
   * Get the unread stream data from cache
   * @param streamId - The ID of the stream
   * @returns The unread stream or null if not found
   */
  static async getUnreadStream(params: Core.TStreamIdParams): Promise<Core.TStreamResult | null> {
    return await Core.PostStreamApplication.getUnreadStream(params);
  }

  /**
   * Merge the unread stream with the post stream
   * @param params - The stream ID to merge the unread stream with the post stream
   */
  static async mergeUnreadStreamWithPostStream(params: Core.TStreamIdParams) {
    return await Core.PostStreamApplication.mergeUnreadStreamWithPostStream(params);
  }

  /**
   * Clear the unread stream and return the post IDs that were in it
   * @param params - The stream ID to clear the unread stream for
   * @returns Array of post IDs that were in the unread stream
   */
  static async clearUnreadStream(params: Core.TStreamIdParams): Promise<string[]> {
    return await Core.PostStreamApplication.clearUnreadStream(params);
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
   * @param params.streamId - The ID of the stream to prepare
   */
  static async prepareStreamForInitialLoad(params: Core.TStreamIdParams): Promise<void> {
    await Core.PostStreamApplication.prepareStreamForInitialLoad(params);
  }

  /**
   * Filter out deleted posts from a list of post IDs.
   * Posts without details in cache are kept (fail-open semantics).
   *
   * @param postIds - Array of post IDs to filter
   * @returns Array of post IDs that are not deleted
   */
  static async filterDeletedPosts(postIds: string[]): Promise<string[]> {
    return Core.PostStreamApplication.filterDeletedPosts(postIds);
  }
}
