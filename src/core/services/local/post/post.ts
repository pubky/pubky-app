import { postUriBuilder } from 'pubky-app-specs';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { TDeletePostParams } from '@/controllers/post/post.types';
import { db } from '@/database/franky/franky';
import { CompositeIdDomain } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri, parseCompositeId } from '@/models/models.utils';
import { PostCountsModel } from '@/models/post/counts/postCounts';
import type { PostCountsModelSchema } from '@/models/post/counts/postCounts.schema';
import type { TPostCountsParams } from '@/models/post/counts/postCounts.types';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import { DELETED } from '@/models/post/details/postDetails.constants';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import { PostRelationshipsModel } from '@/models/post/relationships/postRelationships';
import type { PostRelationshipsModelSchema } from '@/models/post/relationships/postRelationships.schema';
import { PostTagsModel } from '@/models/post/tags/postTags';
import { PostTtlModel } from '@/models/post/ttl/postTtl';
import type { TagCollectionModelSchema } from '@/models/shared/tag/tag.schema';
import { PostStreamTypes, type PostStreamId } from '@/models/stream/post/postStream.types';
import { PostStreamModel } from '@/models/stream/post/tables/postStream';
import { UnreadPostStreamModel } from '@/models/stream/post/tables/postStream.unread';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import { PostNormalizer } from '@/pipes/post/post.normalizer';
import type { TLocalSavePostParams, TLocalUpdatePostStreamParams } from '@/services/local/post/post.types';
export class LocalPostService {
  private constructor() {}

  /**
   * Read a post from the local database.
   * @param postId - ID of the post to read
   * @returns Post details or null if not found
   */
  static async readDetails({ postId }: { postId: string }) {
    return PostDetailsModel.findById(postId);
  }

  /**
   * Filter out deleted posts from a list of post IDs.
   * Posts without details in cache are kept (fail-open semantics).
   *
   * @param postIds - Array of post IDs to filter
   * @returns Array of post IDs that are not deleted
   */
  static async filterDeletedPosts(postIds: string[]): Promise<string[]> {
    return PostDetailsModel.filterDeleted(postIds);
  }

  /**
   * Reads post counts for a specific post
   *
   * @param postId - Composite post ID (author:postId)
   * @returns Post counts or null if not found
   */
  static async readCounts(postId: string): Promise<PostCountsModelSchema | null> {
    return (await PostCountsModel.findById(postId)) ?? null;
  }

  /**
   * Reads post relationships for a specific post
   *
   * @param postId - Composite post ID (author:postId)
   * @returns Post relationships or null if not found
   */
  static async readRelationships(postId: string): Promise<PostRelationshipsModelSchema | null> {
    return PostRelationshipsModel.findById(postId);
  }

  /**
   * Reads post relationships for multiple posts
   *
   * @param postIds - Array of composite post IDs (author:postId)
   * @returns Array of post relationships (undefined entries for posts not found)
   *
   * @throws {DatabaseError} When database operations fail
   */
  static async readRelationshipsByIds(postIds: string[]): Promise<(PostRelationshipsModelSchema | undefined)[]> {
    try {
      return await PostRelationshipsModel.findByIdsPreserveOrder(postIds);
    } catch (error) {
      Logger.error('Failed to read post relationships by ids', { postIds, error });
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, 'Failed to read post relationships by ids', {
        service: ErrorService.Local,
        operation: 'readRelationshipsByIds',
        context: { postIds },
        cause: error,
      });
    }
  }

  /**
   * Reads all posts that are replies to a specific post
   * @param postId - Composite post ID to read replies for
   * @returns Array of post relationships that replied to this post
   */
  static async readReplies(postId: string): Promise<PostRelationshipsModelSchema[]> {
    return PostRelationshipsModel.getReplies(postId);
  }

  /**
   * Reads tags for a specific post from local database
   * @param postId - Composite post ID (author:postId)
   * @returns Array of tag collections or empty array if not found
   */
  static async readTags(postId: string): Promise<TagCollectionModelSchema<string>[]> {
    const tags = await PostTagsModel.findById(postId);
    if (!tags) return [];
    return [tags] as unknown as TagCollectionModelSchema<string>[];
  }

  static async updatePostCounts({ postCompositeId, countChanges }: TPostCountsParams) {
    await PostCountsModel.updateCounts({ postCompositeId, countChanges });
  }

  /**
   * Edit a post's content in the local database.
   *
   * @param params.compositePostId - Composite post ID (author:postId)
   * @param params.content - New content for the post
   *
   * @throws {DatabaseError} When database operations fail
   */
  static async edit({ compositePostId, content }: { compositePostId: string; content: string }) {
    try {
      await PostDetailsModel.update(compositePostId, { content });
      Logger.debug('Post edited successfully', { compositePostId });
    } catch (error) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to edit post', {
        service: ErrorService.Local,
        operation: 'edit',
        context: { compositePostId },
        cause: error,
      });
    }
  }

  /**
   * Save a new post to the local database.
   *
   * Creates a new post with all its related records:
   * - Post details (content, kind, URI, etc.)
   * - Post counts (initialized to zero)
   * - Post relationships (parent URI if reply)
   * - Post tags (empty array)
   *
   * If the post is a reply, also updates the parent post's reply count.
   *
   * @param params.authorId - Unique identifier of the post author
   * @param params.postId - Unique identifier for the post
   * @param params.post - PubkyAppPost object
   *
   * @throws {DatabaseError} When database operations fail
   */
  static async create({ compositePostId, post }: TLocalSavePostParams) {
    const { content, kind, parent: parentUri, attachments, embed } = post;

    const repostedUri = embed?.uri ?? null;
    const normalizedKind = PostNormalizer.postKindToLowerCase(kind);

    const { pubky: authorId, id: postId } = parseCompositeId(compositePostId);

    try {
      const postDetails: PostDetailsModelSchema = {
        id: compositePostId,
        content,
        indexed_at: Date.now(),
        kind: normalizedKind,
        uri: postUriBuilder(authorId, postId),
        attachments: attachments ?? null,
      };

      const postRelationships: PostRelationshipsModelSchema = {
        id: compositePostId,
        replied: parentUri ?? null,
        reposted: repostedUri,
        mentioned: [],
      };

      const postCounts: PostCountsModelSchema = {
        id: compositePostId,
        tags: 0,
        unique_tags: 0,
        replies: 0,
        reposts: 0,
      };

      await db.transaction(
        'rw',
        [
          PostDetailsModel.table,
          PostRelationshipsModel.table,
          PostCountsModel.table,
          PostTagsModel.table,
          UserCountsModel.table,
          PostStreamModel.table,
          PostTtlModel.table,
        ],
        async () => {
          await Promise.all([
            PostDetailsModel.create(postDetails),
            PostRelationshipsModel.create(postRelationships),
            PostCountsModel.create(postCounts),
            PostTagsModel.create({ id: compositePostId, tags: [] }),
          ]);

          const ops: Promise<unknown>[] = [];

          // Update related post counts
          if (parentUri) {
            ops.push(this.updatePostCount(parentUri, 'replies', 1));
            // Touch parent post TTL so the coordinator considers it fresh
            // and doesn't overwrite the updated reply count from Nexus
            const parentPostId = buildCompositeIdFromPubkyUri({
              uri: parentUri,
              domain: CompositeIdDomain.POSTS,
            });
            if (parentPostId) {
              ops.push(PostTtlModel.upsert({ id: parentPostId, lastUpdatedAt: Date.now() }));
            }
          }
          if (repostedUri) {
            ops.push(this.updatePostCount(repostedUri, 'reposts', 1));
            // Touch reposted post TTL so the coordinator considers it fresh
            // and doesn't overwrite the updated repost count from Nexus
            const repostedPostId = buildCompositeIdFromPubkyUri({
              uri: repostedUri,
              domain: CompositeIdDomain.POSTS,
            });
            if (repostedPostId) {
              ops.push(PostTtlModel.upsert({ id: repostedPostId, lastUpdatedAt: Date.now() }));
            }
          }

          // Touch TTL for the new post
          ops.push(PostTtlModel.upsert({ id: compositePostId, lastUpdatedAt: Date.now() }));

          // Update author's user counts in a single operation
          ops.push(
            UserCountsModel.updateCounts({
              userId: authorId,
              countChanges: { posts: 1, replies: parentUri ? 1 : 0 },
            }),
          );

          this.updatePostStream({
            compositePostId,
            kind: normalizedKind,
            parentUri,
            ops,
            action: HttpMethod.PUT,
          });

          await Promise.all(ops);
        },
      );
    } catch (error) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to save post', {
        service: ErrorService.Local,
        operation: 'create',
        context: { compositePostId, kind },
        cause: error,
      });
    }
  }

  /**
   * Delete a post from the local database.
   *
   * Removes the post and all related records. If the post is a reply,
   * decrements the parent post's reply count. If the post is a repost,
   * decrements the original post's repost count.
   *
   * @param compositePostId - Composite post ID (author:postId)
   * @returns true if the post had connections (soft deleted), false otherwise
   */
  static async delete({ compositePostId }: TDeletePostParams): Promise<boolean> {
    const { pubky: authorId } = parseCompositeId(compositePostId);

    // TODO: There is an edge case where the post counts are not found, but the post is linked. This should be handled.
    const postCounts = await PostCountsModel.findById(compositePostId);
    // If counts exist and post is linked → soft delete (mark as DELETED, keep records)
    if (postCounts && this.isPostLinked(postCounts)) {
      await PostDetailsModel.update(compositePostId, { content: DELETED });
      return true;
    }

    // Hard delete - proceed even if postCounts missing (treat as not linked)
    const postRelationships = await PostRelationshipsModel.findById(compositePostId);

    const parentUri = postRelationships?.replied ?? undefined;
    const repostedUri = postRelationships?.reposted ?? undefined;

    // Fetch post details and relationships to get metadata
    const postDetails = await PostDetailsModel.findById(compositePostId);
    const kind = postDetails?.kind ?? 'short';

    try {
      await db.transaction(
        'rw',
        [
          PostDetailsModel.table,
          PostRelationshipsModel.table,
          PostCountsModel.table,
          PostTagsModel.table,
          UserCountsModel.table,
          PostStreamModel.table,
          UnreadPostStreamModel.table,
          PostTtlModel.table,
        ],
        async () => {
          await Promise.all([
            PostDetailsModel.deleteById(compositePostId),
            PostRelationshipsModel.deleteById(compositePostId),
            PostCountsModel.deleteById(compositePostId),
            PostTagsModel.deleteById(compositePostId),
          ]);

          const ops: Promise<unknown>[] = [];

          // Decrement related post counts
          if (parentUri) {
            ops.push(this.updatePostCount(parentUri, 'replies', -1));
            // Touch parent post TTL so the coordinator considers it fresh
            // and doesn't overwrite the updated reply count from Nexus
            const parentPostId = buildCompositeIdFromPubkyUri({
              uri: parentUri,
              domain: CompositeIdDomain.POSTS,
            });
            if (parentPostId) {
              ops.push(PostTtlModel.upsert({ id: parentPostId, lastUpdatedAt: Date.now() }));
            }
          }
          if (repostedUri) {
            ops.push(this.updatePostCount(repostedUri, 'reposts', -1));
            // Touch reposted post TTL so the coordinator considers it fresh
            // and doesn't overwrite the updated repost count from Nexus
            const repostedPostId = buildCompositeIdFromPubkyUri({
              uri: repostedUri,
              domain: CompositeIdDomain.POSTS,
            });
            if (repostedPostId) {
              ops.push(PostTtlModel.upsert({ id: repostedPostId, lastUpdatedAt: Date.now() }));
            }
          }

          // Update author's user counts in a single operation
          ops.push(
            UserCountsModel.updateCounts({
              userId: authorId,
              countChanges: { posts: -1, replies: parentUri ? -1 : 0 },
            }),
          );

          // Remove post from streams (including unread streams)
          this.updatePostStream({ compositePostId, kind, parentUri, ops, action: HttpMethod.DELETE });

          await Promise.all(ops);
        },
      );

      return false;
    } catch (error) {
      throw Err.database(DatabaseErrorCode.DELETE_FAILED, 'Failed to delete post', {
        service: ErrorService.Local,
        operation: 'delete',
        context: { compositePostId },
        cause: error,
      });
    }
  }

  private static updatePostStream({ compositePostId, kind, parentUri, ops, action }: TLocalUpdatePostStreamParams) {
    const { pubky: authorId } = parseCompositeId(compositePostId);

    // Helper to call the appropriate method with proper class context
    const updateStream = (streamId: PostStreamId, items: string[]) => {
      if (action === HttpMethod.PUT) {
        return PostStreamModel.prependItems(streamId, items);
      } else {
        return PostStreamModel.removeItems(streamId, items);
      }
    };

    // Helper to remove from unread streams when deleting
    // This prevents ghost posts when a post is deleted while still in the unread stream
    const removeFromUnreadStream = (streamId: PostStreamId, items: string[]) => {
      if (action === HttpMethod.DELETE) {
        return UnreadPostStreamModel.removeItems(streamId, items);
      }
      return Promise.resolve();
    };

    if (parentUri) {
      const parentCompositeId = buildCompositeIdFromPubkyUri({
        uri: parentUri,
        domain: CompositeIdDomain.POSTS,
      });
      ops.push(updateStream(`author_replies:${authorId}`, [compositePostId]));
      ops.push(updateStream(`post_replies:${parentCompositeId}`, [compositePostId]));
    } else {
      ops.push(updateStream(PostStreamTypes.TIMELINE_ALL_ALL, [compositePostId]));
      ops.push(updateStream(`timeline:all:${kind}` as PostStreamId, [compositePostId]));
      ops.push(updateStream(PostStreamTypes.TIMELINE_FOLLOWING_ALL, [compositePostId]));
      ops.push(updateStream(`timeline:following:${kind}` as PostStreamId, [compositePostId]));
      ops.push(updateStream(PostStreamTypes.TIMELINE_FRIENDS_ALL, [compositePostId]));
      ops.push(updateStream(`timeline:friends:${kind}` as PostStreamId, [compositePostId]));
      ops.push(updateStream(`author:${authorId}`, [compositePostId]));

      // Also remove from unread streams when deleting to prevent ghost posts
      // This handles the case where a post was polled and added to unread stream before deletion
      // Clean both the "all" streams and kind-specific streams since the user may have
      // been viewing a filtered feed (e.g., timeline:all:short) when the post was polled
      ops.push(removeFromUnreadStream(PostStreamTypes.TIMELINE_ALL_ALL, [compositePostId]));
      ops.push(removeFromUnreadStream(`timeline:all:${kind}` as PostStreamId, [compositePostId]));
      ops.push(removeFromUnreadStream(PostStreamTypes.TIMELINE_FOLLOWING_ALL, [compositePostId]));
      ops.push(removeFromUnreadStream(`timeline:following:${kind}` as PostStreamId, [compositePostId]));
      ops.push(removeFromUnreadStream(PostStreamTypes.TIMELINE_FRIENDS_ALL, [compositePostId]));
      ops.push(removeFromUnreadStream(`timeline:friends:${kind}` as PostStreamId, [compositePostId]));
    }
  }

  private static isPostLinked(postCounts: PostCountsModelSchema): boolean {
    return postCounts.replies > 0 || postCounts.reposts > 0 || postCounts.tags > 0;
  }

  /**
   * Helper method to update post counts safely
   */
  private static async updatePostCount(
    uri: string,
    countField: 'replies' | 'reposts',
    countChange: number,
  ): Promise<void> {
    const postId = buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.POSTS });
    if (!postId) return;

    const counts = await PostCountsModel.findById(postId);
    if (!counts) return;

    const currentCount = counts[countField];
    const newCount = Math.max(0, currentCount + countChange);

    await PostCountsModel.update(postId, { [countField]: newCount });
  }
}
