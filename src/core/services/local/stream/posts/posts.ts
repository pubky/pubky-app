import * as Core from '@/core';
import { Logger } from '@/libs/logger';

/**
 * Local Stream Posts Service
 *
 * Simple service to manage post stream IDs in IndexDB.
 * Only stores arrays of post IDs, no post data or user data.
 */
export class LocalStreamPostsService {
  private constructor() {}

  static async readUnreadStream({ streamId }: Core.TStreamIdParams): Promise<Core.TStreamResult | null> {
    return await Core.UnreadPostStreamModel.findById(streamId);
  }

  /**
   * Save or update a stream of post IDs
   */
  static async upsert({ streamId, stream }: Core.TPostStreamUpsertParams): Promise<void> {
    await Core.PostStreamModel.upsert(streamId, stream);
  }

  /**
   *
   * @param postStreams - Array of post streams to upsert
   */
  static async bulkSave({ postStreams }: Core.TPostStreamBulkParams): Promise<void> {
    await Promise.all(postStreams.map(({ streamId, stream }) => this.upsert({ streamId, stream })));
  }

  /**
   * Get a stream of post IDs by stream ID
   */
  static async read({ streamId }: Core.TStreamIdParams): Promise<{ stream: string[] } | null> {
    return await Core.PostStreamModel.findById(streamId);
  }

  /**
   * Delete a stream from cache
   */
  static async deleteById({ streamId }: Core.TStreamIdParams): Promise<void> {
    await Core.PostStreamModel.deleteById(streamId);
  }

  /**
   * Gets the timestamp of the head (first/most recent) post in a stream
   * First tries from the unread post stream, if not found, tries from the post stream
   * @param streamId - The stream ID to get the head timestamp for
   * @returns The indexed_at timestamp of the head post, or 1 if the stream is empty or head post not found
   * 1 means that there is no posts in the cache but force to fetch from Nexus new posts
   * 0 means that there is no posts in the cache and no need to fetch from Nexus new posts
   */
  static async getStreamHead({ streamId }: Core.TStreamIdParams): Promise<number> {
    const unreadCompositePostId = await Core.UnreadPostStreamModel.getStreamHead(streamId);
    if (unreadCompositePostId) {
      return await this.getPostDetailsTimestamp({ postCompositeId: unreadCompositePostId as string });
    }
    const postCompositeId = await Core.PostStreamModel.getStreamHead(streamId);
    if (!postCompositeId) {
      // It might be a case that the stream that we want to update still does not have any posts in the cache
      // so we return 1 to indicate that there is no posts in the cache but force to fetch from Nexus new posts
      return Core.FORCE_FETCH_NEW_POSTS;
    }
    return await this.getPostDetailsTimestamp({ postCompositeId: postCompositeId as string });
  }

  /**
   * Get the timestamp of the post
   * @param postCompositeId - The composite post ID to get the timestamp for
   * @returns The indexed_at timestamp of the post, or 0 if the post is not found in the cache
   */
  private static async getPostDetailsTimestamp({ postCompositeId }: Core.TPostDetailsTimestampParams): Promise<number> {
    const postDetails = await Core.PostDetailsModel.findById(postCompositeId);
    if (postDetails) {
      return postDetails.indexed_at;
    }
    // Avoid fetching till we have persited the missing post in the cache
    Logger.debug('Post not found in cache, avoiding fetch', { postCompositeId });
    return Core.SKIP_FETCH_NEW_POSTS;
  }

  /**
   * Prepend a post ID to a stream
   * Only adds if not already present
   *
   * @param streamId - The stream to prepend to
   * @param compositePostId - The composite post ID to prepend
   */
  static async prependToStream({ streamId, compositePostId }: Core.TPrependToStreamParams): Promise<void> {
    const existing = await this.read({ streamId });
    const currentStream = existing?.stream || [];

    if (currentStream.includes(compositePostId)) return;

    const updatedStream = [compositePostId, ...currentStream];
    await this.upsert({ streamId, stream: updatedStream });
  }

  /**
   * Remove a post ID from a stream
   *
   * @param streamId - The stream to remove from
   * @param compositePostId - The composite post ID to remove
   */
  static async removeFromStream({ streamId, compositePostId }: Core.TPrependToStreamParams): Promise<void> {
    const existing = await this.read({ streamId });
    if (!existing) return;

    const updatedStream = existing.stream.filter((id) => id !== compositePostId);
    await this.upsert({ streamId, stream: updatedStream });
  }

  static async getNotPersistedPostsInCache(postIds: string[]): Promise<string[]> {
    const existingPostIds = await Core.PostDetailsModel.findByIdsPreserveOrder(postIds);
    return postIds.filter((_postId, index) => existingPostIds[index] === undefined);
  }

  /**
   * Adds a reply post to the post replies map if the post is a reply
   *
   * @param repliedUri - The URI of the parent post being replied to (optional)
   * @param replyPostId - The composite post ID of the reply post
   * @param postReplies - The map of reply stream IDs to arrays of reply post IDs
   */
  private static addReplyToStream({ repliedUri, replyPostId, postReplies }: Core.TAddReplyToStreamParams): void {
    if (!repliedUri) return;

    const parentCompositePostId = Core.buildCompositeIdFromPubkyUri({
      uri: repliedUri,
      domain: Core.CompositeIdDomain.POSTS,
    });
    if (!parentCompositePostId) return;

    const replyStreamId = Core.buildPostReplyStreamId(parentCompositePostId);
    postReplies[replyStreamId] = [...(postReplies[replyStreamId] || []), replyPostId];
  }

  /**
   * Merge the unread stream with the post stream, sorted by timestamp.
   * Filters out deleted posts from unread stream before merging.
   * @param streamId - The stream ID to merge the unread stream with the post stream
   * @returns void
   */
  static async mergeUnreadStreamWithPostStream({ streamId }: Core.TStreamIdParams): Promise<void> {
    const unreadPostStream = await Core.UnreadPostStreamModel.findById(streamId);
    if (!unreadPostStream) return;
    const postStream = await Core.PostStreamModel.findById(streamId);
    if (!postStream) return;

    // Filter out deleted posts from unread stream before merging
    const validUnreadPosts = await Core.PostDetailsModel.filterDeleted(unreadPostStream.stream);

    // Deduplicate: unread posts first, then existing posts (excluding duplicates)
    const existingIds = new Set(validUnreadPosts);
    const uniqueExistingPosts = postStream.stream.filter((id) => !existingIds.has(id));
    const combinedStream = [...validUnreadPosts, ...uniqueExistingPosts];

    // Sort by timestamp (indexed_at) in descending order (most recent first)
    const sortedStream = await Core.sortPostIdsByTimestamp(combinedStream);

    await Core.PostStreamModel.upsert(streamId, sortedStream);
  }

  /**
   * Clear the unread stream and return the post IDs that were in it
   * @param streamId - The stream ID to clear the unread stream for
   * @returns Array of post IDs that were in the unread stream
   */
  static async clearUnreadStream({ streamId }: Core.TStreamIdParams): Promise<string[]> {
    const unreadStream = await Core.UnreadPostStreamModel.findById(streamId);
    if (!unreadStream) return [];
    const postIds = unreadStream.stream;
    await Core.UnreadPostStreamModel.deleteById(streamId);
    return postIds;
  }

  /**
   * Persist posts from Nexus API to local IndexedDB
   *
   * Processes an array of Nexus posts and saves them to the local database.
   * For each post, it extracts and persists:
   * - Post details (with composite ID: author:postId)
   * - Post counts (likes, replies, etc.)
   * - Post relationships (replies, reposts, etc.)
   * - Post tags
   * - Post attachments
   *
   * Additionally, creates reply streams for posts that are replies to other posts,
   * mapping parent posts to their reply post IDs.
   *
   * @param posts - Array of posts from Nexus API to persist
   * @returns Object containing an array of all post attachment URIs collected from the posts
   */
  static async persistPosts({ posts }: Core.TPersistPostsParams): Promise<Core.TPostStreamPersistResult> {
    // Defensive check: if posts is empty or undefined, return early
    if (!posts?.length) return { attachmentMetadata: [] };

    const postCounts: Core.NexusModelTuple<Core.NexusPostCounts>[] = [];
    const postRelationships: Core.NexusModelTuple<Core.NexusPostRelationships>[] = [];
    const postTags: Core.NexusModelTuple<Core.NexusTag[]>[] = [];
    const postDetails: Core.RecordModelBase<string, Core.PostDetailsModelSchema>[] = [];
    const postBookmarks: Core.BookmarkModelSchema[] = [];
    const postModerations: Core.ModerationModelSchema[] = [];
    const postTtl: Core.NexusModelTuple<{ lastUpdatedAt: number }>[] = [];

    const postReplies: Record<Core.ReplyStreamCompositeId, string[]> = {};
    const attachmentMetadata: Core.NexusFileDetails[] = [];
    const now = Date.now();

    for (const post of posts) {
      // Build composite ID to ensure uniqueness (authorId:postId)
      const postId = Core.buildCompositeId({ pubky: post.details.author, id: post.details.id });

      postCounts.push([postId, post.counts]);

      postRelationships.push([postId, post.relationships]);
      if (post.attachments_metadata) {
        post.attachments_metadata.forEach((metadata) => {
          attachmentMetadata.push(metadata);
        });
      }

      // Collect bookmarks from Nexus response (viewer's bookmark status)
      if (post.bookmark) {
        postBookmarks.push({
          id: postId,
          created_at: post.bookmark.created_at,
        });
      }

      // Convert TagModel[] to NexusTag[] by accessing the data property
      const nexusTags = post.tags.map((tag) => ({
        label: tag.label,
        taggers: tag.taggers,
        taggers_count: tag.taggers_count,
        relationship: tag.relationship,
      }));
      postTags.push([postId, nexusTags]);

      // Compute moderation and store if post is moderated
      const isModerated = Core.detectModerationFromTags(nexusTags);
      if (isModerated) {
        postModerations.push({
          id: postId,
          type: Core.ModerationType.POST,
          is_blurred: true,
          created_at: Date.now(),
        });
      }

      // Remove author from details as it's in the composite ID
      // eslint-disable-next-line
      const { author, ...detailsWithoutAuthor } = post.details;
      postDetails.push({ ...detailsWithoutAuthor, id: postId });

      // Record TTL for freshness tracking
      postTtl.push([postId, { lastUpdatedAt: now }]);

      // Add reply to the post replies map if this post is a reply
      this.addReplyToStream({ repliedUri: post.relationships.replied, replyPostId: postId, postReplies });
    }

    await Promise.all([
      Core.PostDetailsModel.bulkSave(postDetails),
      Core.PostCountsModel.bulkSave(postCounts),
      Core.PostTagsModel.bulkSave(postTags),
      Core.PostRelationshipsModel.bulkSave(postRelationships),
      Core.PostTtlModel.bulkSave(postTtl),
      // Persist bookmarks from Nexus (viewer's bookmark status for each post)
      postBookmarks.length > 0 ? Core.BookmarkModel.bulkSave(postBookmarks) : Promise.resolve(),
      // Persist moderation records for moderated posts (is_blurred defaults to true)
      postModerations.length > 0 ? Core.ModerationModel.bulkSave(postModerations) : Promise.resolve(),
    ]);

    if (Object.keys(postReplies).length > 0) {
      await Promise.all(
        Object.entries(postReplies).map(async ([parentCompositePostId, postIds]) => {
          await this.persistNewStreamChunk({
            streamId: parentCompositePostId as Core.PostStreamId,
            stream: postIds,
          });
        }),
      );
    }
    return { attachmentMetadata };
  }

  /**
   * Extracts post IDs from Nexus post response
   * Temporary function until Nexus provides an endpoint that returns only IDs
   *
   * @param posts - Array of posts from Nexus API
   * @returns Array of composite post IDs (author:postId)
   */
  static async persistNewStreamChunk({ stream, streamId }: Core.TPostStreamUpsertParams) {
    const postStream = await Core.PostStreamModel.findById(streamId);

    if (!postStream) {
      // If stream doesn't exist (e.g., database was deleted), create it with the new chunk
      await Core.PostStreamModel.upsert(streamId, stream);
      return;
    }

    // Check for duplicates before adding
    const existingIds = new Set(postStream.stream);
    const newPostsToAdd = stream.filter((id) => !existingIds.has(id));

    // Combine existing and new posts
    const combinedStream = [...postStream.stream, ...newPostsToAdd];

    // Sort by timestamp (indexed_at) in descending order (most recent first)
    const sortedStream = await Core.sortPostIdsByTimestamp(combinedStream);

    await Core.PostStreamModel.upsert(streamId, sortedStream);
  }

  /**
   * Persist a new chunk of posts to the unread post stream
   * @param stream - Array of post IDs to persist
   * @param streamId - The stream ID to persist the new chunk to
   * @returns The post IDs that were actually added (after deduplication)
   */
  static async persistUnreadNewStreamChunk({ stream, streamId }: Core.TPostStreamUpsertParams): Promise<string[]> {
    const unreadPostStream = await Core.UnreadPostStreamModel.findById(streamId);
    if (!unreadPostStream) {
      await Core.UnreadPostStreamModel.upsert(streamId, stream);
      return stream;
    }
    const existingIds = new Set(unreadPostStream.stream);
    const newPostsToAdd = stream.filter((id) => !existingIds.has(id));
    if (newPostsToAdd.length === 0) return [];
    const combinedStream = [...newPostsToAdd, ...unreadPostStream.stream];
    await Core.UnreadPostStreamModel.upsert(streamId, combinedStream);
    return newPostsToAdd;
  }
}
