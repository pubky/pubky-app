import { detectModerationFromTags } from '@/application/moderation/moderation.utils';
import { FORCE_FETCH_NEW_POSTS, SKIP_FETCH_NEW_POSTS } from '@/controllers/stream/posts/post.constants';
import type { TStreamIdParams } from '@/controllers/stream/posts/posts.types';
import { Logger } from '@/libs/logger/logger';
import { BookmarkModel } from '@/models/bookmark/bookmark';
import type { BookmarkModelSchema } from '@/models/bookmark/bookmark.schema';
import { CompositeIdDomain } from '@/models/models.types';
import { buildCompositeId, buildCompositeIdFromPubkyUri } from '@/models/models.utils';
import { ModerationModel } from '@/models/moderation/moderation';
import { type ModerationModelSchema, ModerationType } from '@/models/moderation/moderation.schema';
import { PostCountsModel } from '@/models/post/counts/postCounts';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import { PostRelationshipsModel } from '@/models/post/relationships/postRelationships';
import { PostTagsModel } from '@/models/post/tags/postTags';
import { PostTtlModel } from '@/models/post/ttl/postTtl';
import type { RecordModelBase } from '@/models/shared/base/record/baseRecord';
import type { NexusModelTuple } from '@/models/shared/base/tuple/baseTuple.type';
import {
  buildPostReplyStreamId,
  type PostStreamId,
  type ReplyStreamCompositeId,
} from '@/models/stream/post/postStream.types';
import { PostStreamModel } from '@/models/stream/post/tables/postStream';
import { UnreadPostStreamModel } from '@/models/stream/post/tables/postStream.unread';
import type {
  TAddReplyToStreamParams,
  TPersistPostsParams,
  TPostDetailsTimestampParams,
  TPostStreamBulkParams,
  TPostStreamPersistResult,
  TPostStreamUpsertParams,
  TPrependToStreamParams,
  TStreamResult,
} from '@/services/local/stream/posts/post.types';
import type { NexusFileDetails, NexusPostCounts, NexusPostRelationships, NexusTag } from '@/services/nexus/nexus.types';
import { sortPostIdsByTimestamp } from '@/utils/sorting';

/**
 * Local Stream Posts Service
 *
 * Simple service to manage post stream IDs in IndexDB.
 * Only stores arrays of post IDs, no post data or user data.
 */
export class LocalStreamPostsService {
  private constructor() {}

  static async readUnreadStream({ streamId }: TStreamIdParams): Promise<TStreamResult | null> {
    return await UnreadPostStreamModel.findById(streamId);
  }

  /**
   * Save or update a stream of post IDs
   */
  static async upsert({ streamId, stream }: TPostStreamUpsertParams): Promise<void> {
    await PostStreamModel.upsert(streamId, stream);
  }

  /**
   *
   * @param postStreams - Array of post streams to upsert
   */
  static async bulkSave({ postStreams }: TPostStreamBulkParams): Promise<void> {
    await Promise.all(postStreams.map(({ streamId, stream }) => this.upsert({ streamId, stream })));
  }

  /**
   * Get a stream of post IDs by stream ID
   */
  static async read({ streamId }: TStreamIdParams): Promise<{ stream: string[] } | null> {
    return await PostStreamModel.findById(streamId);
  }

  /**
   * Delete a stream from cache
   */
  static async deleteById({ streamId }: TStreamIdParams): Promise<void> {
    await PostStreamModel.deleteById(streamId);
  }

  /**
   * Gets the timestamp of the head (first/most recent) post in a stream
   * First tries from the unread post stream, if not found, tries from the post stream
   * @param streamId - The stream ID to get the head timestamp for
   * @returns The indexed_at timestamp of the head post, or 1 if the stream is empty or head post not found
   * 1 means that there is no posts in the cache but force to fetch from Nexus new posts
   * 0 means that there is no posts in the cache and no need to fetch from Nexus new posts
   */
  static async getStreamHead({ streamId }: TStreamIdParams): Promise<number> {
    const unreadCompositePostId = await UnreadPostStreamModel.getStreamHead(streamId);
    if (unreadCompositePostId) {
      return await this.getPostDetailsTimestamp({ postCompositeId: unreadCompositePostId as string });
    }
    const postCompositeId = await PostStreamModel.getStreamHead(streamId);
    if (!postCompositeId) {
      // It might be a case that the stream that we want to update still does not have any posts in the cache
      // so we return 1 to indicate that there is no posts in the cache but force to fetch from Nexus new posts
      return FORCE_FETCH_NEW_POSTS;
    }
    return await this.getPostDetailsTimestamp({ postCompositeId: postCompositeId as string });
  }

  /**
   * Get the timestamp of the post
   * @param postCompositeId - The composite post ID to get the timestamp for
   * @returns The indexed_at timestamp of the post, or 0 if the post is not found in the cache
   */
  private static async getPostDetailsTimestamp({ postCompositeId }: TPostDetailsTimestampParams): Promise<number> {
    const postDetails = await PostDetailsModel.findById(postCompositeId);
    if (postDetails) {
      return postDetails.indexed_at;
    }
    // Avoid fetching till we have persited the missing post in the cache
    Logger.debug('Post not found in cache, avoiding fetch', { postCompositeId });
    return SKIP_FETCH_NEW_POSTS;
  }

  /**
   * Prepend a post ID to a stream
   * Only adds if not already present
   *
   * @param streamId - The stream to prepend to
   * @param compositePostId - The composite post ID to prepend
   */
  static async prependToStream({ streamId, compositePostId }: TPrependToStreamParams): Promise<void> {
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
  static async removeFromStream({ streamId, compositePostId }: TPrependToStreamParams): Promise<void> {
    const existing = await this.read({ streamId });
    if (!existing) return;

    const updatedStream = existing.stream.filter((id) => id !== compositePostId);
    await this.upsert({ streamId, stream: updatedStream });
  }

  static async getNotPersistedPostsInCache(postIds: string[]): Promise<string[]> {
    const existingPostIds = await PostDetailsModel.findByIdsPreserveOrder(postIds);
    return postIds.filter((_postId, index) => existingPostIds[index] === undefined);
  }

  /**
   * Adds a reply post to the post replies map if the post is a reply
   *
   * @param repliedUri - The URI of the parent post being replied to (optional)
   * @param replyPostId - The composite post ID of the reply post
   * @param postReplies - The map of reply stream IDs to arrays of reply post IDs
   */
  private static addReplyToStream({ repliedUri, replyPostId, postReplies }: TAddReplyToStreamParams): void {
    if (!repliedUri) return;

    const parentCompositePostId = buildCompositeIdFromPubkyUri({
      uri: repliedUri,
      domain: CompositeIdDomain.POSTS,
    });
    if (!parentCompositePostId) return;

    const replyStreamId = buildPostReplyStreamId(parentCompositePostId);
    postReplies[replyStreamId] = [...(postReplies[replyStreamId] || []), replyPostId];
  }

  /**
   * Merge the unread stream with the post stream, sorted by timestamp.
   * Filters out deleted posts from unread stream before merging.
   * @param streamId - The stream ID to merge the unread stream with the post stream
   * @returns void
   */
  static async mergeUnreadStreamWithPostStream({ streamId }: TStreamIdParams): Promise<void> {
    const unreadPostStream = await UnreadPostStreamModel.findById(streamId);
    if (!unreadPostStream) return;
    const postStream = await PostStreamModel.findById(streamId);
    if (!postStream) return;

    // Filter out deleted posts from unread stream before merging
    const validUnreadPosts = await PostDetailsModel.filterDeleted(unreadPostStream.stream);

    // Deduplicate: unread posts first, then existing posts (excluding duplicates)
    const existingIds = new Set(validUnreadPosts);
    const uniqueExistingPosts = postStream.stream.filter((id) => !existingIds.has(id));
    const combinedStream = [...validUnreadPosts, ...uniqueExistingPosts];

    // Sort by timestamp (indexed_at) in descending order (most recent first)
    const sortedStream = await sortPostIdsByTimestamp(combinedStream);

    await PostStreamModel.upsert(streamId, sortedStream);
  }

  /**
   * Clear the unread stream and return the post IDs that were in it
   * @param streamId - The stream ID to clear the unread stream for
   * @returns Array of post IDs that were in the unread stream
   */
  static async clearUnreadStream({ streamId }: TStreamIdParams): Promise<string[]> {
    const unreadStream = await UnreadPostStreamModel.findById(streamId);
    if (!unreadStream) return [];
    const postIds = unreadStream.stream;
    await UnreadPostStreamModel.deleteById(streamId);
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
  static async persistPosts({ posts }: TPersistPostsParams): Promise<TPostStreamPersistResult> {
    // Defensive check: if posts is empty or undefined, return early
    if (!posts?.length) return { attachmentMetadata: [] };

    const postCounts: NexusModelTuple<NexusPostCounts>[] = [];
    const postRelationships: NexusModelTuple<NexusPostRelationships>[] = [];
    const postTags: NexusModelTuple<NexusTag[]>[] = [];
    const postDetails: RecordModelBase<string, PostDetailsModelSchema>[] = [];
    const postBookmarks: BookmarkModelSchema[] = [];
    const postModerations: ModerationModelSchema[] = [];
    const postTtl: NexusModelTuple<{ lastUpdatedAt: number }>[] = [];

    const postReplies: Record<ReplyStreamCompositeId, string[]> = {};
    const attachmentMetadata: NexusFileDetails[] = [];
    const now = Date.now();

    for (const post of posts) {
      // Build composite ID to ensure uniqueness (authorId:postId)
      const postId = buildCompositeId({ pubky: post.details.author, id: post.details.id });

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
      const isModerated = detectModerationFromTags(nexusTags);
      if (isModerated) {
        postModerations.push({
          id: postId,
          type: ModerationType.POST,
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
      PostDetailsModel.bulkSave(postDetails),
      PostCountsModel.bulkSave(postCounts),
      PostTagsModel.bulkSave(postTags),
      PostRelationshipsModel.bulkSave(postRelationships),
      PostTtlModel.bulkSave(postTtl),
      // Persist bookmarks from Nexus (viewer's bookmark status for each post)
      postBookmarks.length > 0 ? BookmarkModel.bulkSave(postBookmarks) : Promise.resolve(),
      // Persist moderation records for moderated posts (is_blurred defaults to true)
      postModerations.length > 0 ? ModerationModel.bulkSave(postModerations) : Promise.resolve(),
    ]);

    if (Object.keys(postReplies).length > 0) {
      await Promise.all(
        Object.entries(postReplies).map(async ([parentCompositePostId, postIds]) => {
          await this.persistNewStreamChunk({
            streamId: parentCompositePostId as PostStreamId,
            stream: postIds,
          });
        }),
      );
    }
    return { attachmentMetadata };
  }

  /**
   * Persist a new chunk of post IDs into a cached stream.
   *
   * Creates the stream when it does not exist yet. Otherwise merges the incoming
   * IDs with the existing stream, removes duplicates, and re-sorts by post
   * timestamp in descending order before saving.
   *
   * @param stream - Incoming post IDs to merge into the stream cache
   * @param streamId - Stream identifier to create or update
   */
  static async persistNewStreamChunk({ stream, streamId }: TPostStreamUpsertParams) {
    const postStream = await PostStreamModel.findById(streamId);

    if (!postStream) {
      // If stream doesn't exist (e.g., database was deleted), create it with the new chunk
      await PostStreamModel.upsert(streamId, stream);
      return;
    }

    // Check for duplicates before adding
    const existingIds = new Set(postStream.stream);
    const newPostsToAdd = stream.filter((id) => !existingIds.has(id));

    // Combine existing and new posts
    const combinedStream = [...postStream.stream, ...newPostsToAdd];

    // Sort by timestamp (indexed_at) in descending order (most recent first)
    const sortedStream = await sortPostIdsByTimestamp(combinedStream);

    await PostStreamModel.upsert(streamId, sortedStream);
  }

  /**
   * Persist a new chunk of posts to the unread post stream
   * @param stream - Array of post IDs to persist
   * @param streamId - The stream ID to persist the new chunk to
   * @returns The post IDs that were actually added (after deduplication)
   */
  static async persistUnreadNewStreamChunk({ stream, streamId }: TPostStreamUpsertParams): Promise<string[]> {
    const unreadPostStream = await UnreadPostStreamModel.findById(streamId);
    if (!unreadPostStream) {
      await UnreadPostStreamModel.upsert(streamId, stream);
      return stream;
    }
    const existingIds = new Set(unreadPostStream.stream);
    const newPostsToAdd = stream.filter((id) => !existingIds.has(id));
    if (newPostsToAdd.length === 0) return [];
    const combinedStream = [...newPostsToAdd, ...unreadPostStream.stream];
    await UnreadPostStreamModel.upsert(streamId, combinedStream);
    return newPostsToAdd;
  }
}
