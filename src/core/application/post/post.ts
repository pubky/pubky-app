import { postUriBuilder } from 'pubky-app-specs';
import { FileApplication } from '@/application/file/file';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import type {
  TCreatePostInput,
  TEditPostInput,
  TGetDetailsByIdsParams,
  TGetOrFetchPostParams,
} from '@/application/post/post.types';
import { PostStreamApplication } from '@/application/stream/posts/post';
import { TagApplication } from '@/application/tag/tag';
import { NEXUS_STREAM_MAX_LIMIT } from '@/config/nexus';
import { ModerationController } from '@/controllers/moderation/moderation';
import type {
  TDeletePostParams,
  TFetchMorePostTagsParams,
  TFetchPostTaggersParams,
} from '@/controllers/post/post.types';
import { NOT_FOUND_CACHED_STREAM, SKIP_FETCH_NEW_POSTS } from '@/controllers/stream/posts/post.constants';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { isPostDeleted } from '@/libs/utils/utils';
import { parseCompositeId } from '@/models/models.utils';
import type { CollectionPost, TAuthoredCollectionsParams } from '@/models/post/collection/collectionPost.types';
import type { PostCountsModelSchema } from '@/models/post/counts/postCounts.schema';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import type { PostRelationshipsModelSchema } from '@/models/post/relationships/postRelationships.schema';
import type { TagCollectionModelSchema } from '@/models/shared/tag/tag.schema';
import { buildAuthorCollectionsStreamId } from '@/models/stream/post/postStream.types';
import { CollectionPostContent } from '@/pipes/post/post.collection';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPostService } from '@/services/local/post/post';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import { LocalPostTagService } from '@/services/local/tag/post/tag.post';
import type { NexusTag, NexusTaggers } from '@/services/nexus/nexus.types';
import { NexusPostService } from '@/services/nexus/post/post';
import type { TCompositeId } from '@/services/nexus/post/post.types';

export class PostApplication {
  /**
   * Reads post details from local database and enriches with moderation state
   * @param compositeId - Composite post ID in format "authorId:postId"
   * @returns Post details with moderation state or null if not found
   */
  static async getDetails({ compositeId }: TCompositeId): Promise<EnrichedPostDetails | null> {
    const post = await LocalPostService.readDetails({ postId: compositeId });
    if (!post) return null;
    const [enriched] = await ModerationController.enrichPosts([post]);
    return enriched;
  }

  /**
   * Bulk reads multiple post details from the local database, preserving input order.
   * @param compositeIds - Array of composite post IDs in format "authorId:postId"
   * @returns Array of post details aligned to `compositeIds` (undefined for missing posts)
   */
  static async getDetailsByIds({
    compositeIds,
  }: TGetDetailsByIdsParams): Promise<(PostDetailsModelSchema | undefined)[]> {
    return await LocalPostService.readDetailsByIds(compositeIds);
  }

  /**
   * Reads post counts for a specific post
   * @param compositeId - Composite post ID in format "authorId:postId"
   * @returns Post counts or null if not found
   */
  static async getCounts({ compositeId }: TCompositeId): Promise<PostCountsModelSchema | null> {
    return await LocalPostService.readCounts(compositeId);
  }

  /**
   * Reads post tags for a specific post from local database
   * @param compositeId - Composite post ID in format "authorId:postId"
   * @returns Post tags
   */
  static async getTags({ compositeId }: TCompositeId): Promise<TagCollectionModelSchema<string>[]> {
    return await LocalPostService.readTags(compositeId);
  }

  /**
   * Reads post relationships for a specific post
   * @param compositeId - Composite post ID in format "authorId:postId"
   * @returns Post relationships or null if not found
   */
  static async getRelationships({ compositeId }: TCompositeId): Promise<PostRelationshipsModelSchema | null> {
    return await LocalPostService.readRelationships(compositeId);
  }

  /**
   * Reads all posts that are replies to a specific post
   * @param compositeId - Composite post ID to read replies for
   * @returns Array of post relationships that replied to this post
   */
  static async getReplies({ compositeId }: TCompositeId): Promise<PostRelationshipsModelSchema[]> {
    const { pubky, id } = parseCompositeId(compositeId);
    const parentPostUri = postUriBuilder(pubky, id);
    return await LocalPostService.readReplies(parentPostUri);
  }

  /**
   * Fetch more post tags from Nexus with pagination and persist to local DB
   * @param compositeId - Composite post ID in format "authorId:postId"
   * @param skip - Number of tags to skip
   * @param limit - Maximum number of tags to return
   * @returns Array of tags from Nexus
   */
  static async fetchTags({ compositeId, skip, limit, viewerId }: TFetchMorePostTagsParams): Promise<NexusTag[]> {
    const nexusTags = await NexusPostService.getPostTags({ compositeId, skip, limit, viewerId });

    // Persist new tags to local DB (merge with existing)
    if (nexusTags.length > 0) {
      await LocalPostTagService.mergeTags({ postId: compositeId, tags: nexusTags, viewerId: viewerId ?? null });
    }

    return nexusTags;
  }

  /**
   * Fetch taggers for a specific tag label on a post from Nexus API
   * @param params - Parameters containing composite post ID, label, and pagination options
   * @returns Tagger payload for the label ({ users, relationship })
   */
  static async fetchTaggers(params: TFetchPostTaggersParams): Promise<NexusTaggers> {
    return await NexusPostService.getPostTaggers(params);
  }

  /**
   * Reads or fetches a full post entity from local database.
   * If not found locally, fetches from Nexus and persists everything (details, counts, relationships, tags, author).
   * @param compositeId - Composite post ID in format "authorId:postId"
   * @param viewerId - Optional viewer ID for relationship data
   * @returns Post details or null if not found
   */
  static async getOrFetch({ compositeId, viewerId }: TGetOrFetchPostParams): Promise<PostDetailsModelSchema | null> {
    const localPost = await LocalPostService.readDetails({ postId: compositeId });
    if (localPost) return localPost;

    // Reuse stream posts logic to fetch and persist single post
    await PostStreamApplication.fetchMissingPostsFromNexus({
      cacheMissPostIds: [compositeId],
      viewerId,
    });

    // Return the persisted post details
    return await LocalPostService.readDetails({ postId: compositeId });
  }

  /**
   * Fetches a post from Nexus and persists to local database (network-only, no local read).
   * Use this instead of `getOrFetch` when the caller already knows the post is not in
   * local DB (e.g. `useLocalFirstQuery` hook where `useLiveQuery` handles the local read).
   * @param compositeId - Composite post ID in format "authorId:postId"
   * @param viewerId - Optional viewer ID for relationship data
   * @returns Post details or null if not found on Nexus
   */
  static async fetch({ compositeId, viewerId }: TGetOrFetchPostParams): Promise<PostDetailsModelSchema | null> {
    await PostStreamApplication.fetchMissingPostsFromNexus({
      cacheMissPostIds: [compositeId],
      viewerId,
    });

    return await LocalPostService.readDetails({ postId: compositeId });
  }

  static async getAuthoredCollections({ authorId }: TAuthoredCollectionsParams): Promise<CollectionPost[] | null> {
    const streamId = buildAuthorCollectionsStreamId(authorId);
    const stream = await LocalStreamPostsService.read({ streamId });

    if (!stream) return null;

    const details = await LocalPostService.readDetailsByIds(stream.stream);

    return details
      .filter(
        (post): post is PostDetailsModelSchema =>
          // Drop tombstoned rows explicitly — they would currently be filtered
          // out downstream by `CollectionPostContent.parse('[DELETED]')`
          // returning `null`, but that's incidental: it relies on `[DELETED]`
          // failing JSON parse. The explicit check is self-documenting and
          // keeps the picker robust against future parser changes.
          post !== undefined && post.kind === 'collection' && !isPostDeleted(post.content),
      )
      .map((post) => {
        const content = CollectionPostContent.parse(post.content);
        return content ? { details: post, content } : null;
      })
      .filter((collection): collection is CollectionPost => collection !== null);
  }

  static async fetchAuthoredCollections({
    authorId,
    viewerId,
  }: TAuthoredCollectionsParams): Promise<CollectionPost[] | null> {
    const streamId = buildAuthorCollectionsStreamId(authorId);
    const { cacheMissPostIds } = await PostStreamApplication.fetchStreamSlice({
      streamId,
      streamHead: SKIP_FETCH_NEW_POSTS,
      streamTail: NOT_FOUND_CACHED_STREAM,
      limit: NEXUS_STREAM_MAX_LIMIT,
      viewerId: viewerId ?? null,
    });

    if (cacheMissPostIds.length > 0) {
      await PostStreamApplication.fetchMissingPostsFromNexus({
        cacheMissPostIds,
        viewerId,
      });
    }

    return await this.getAuthoredCollections({ authorId, viewerId });
  }

  static async commitCreate({ postUrl, compositePostId, post, fileAttachments, tags }: TCreatePostInput) {
    const hasFiles = fileAttachments != null && fileAttachments.length > 0;

    if (hasFiles) {
      await FileApplication.commitCreate({ fileAttachments });
    }
    await LocalPostService.create({ compositePostId, post });

    try {
      await HomeserverService.request({ method: HttpMethod.PUT, url: postUrl, bodyJson: post.toJson() });
    } catch (error) {
      try {
        await LocalPostService.delete({ compositePostId });
      } catch (rollbackError) {
        Logger.error('[PostApplication.commitCreate] Failed to rollback local post create', {
          compositePostId,
          rollbackError,
        });
      }

      if (hasFiles) {
        try {
          const fileUris = fileAttachments.map((f) => f.fileResult.meta.url);
          await FileApplication.commitDelete(fileUris);
        } catch (fileRollbackError) {
          Logger.error('[PostApplication.commitCreate] Failed to rollback file attachments', {
            compositePostId,
            fileRollbackError,
          });
        }
      }

      throw error;
    }

    if (tags && tags.length > 0) {
      await TagApplication.commitCreate({ tagList: tags });
    }
  }

  static async commitDelete({ compositePostId }: TDeletePostParams) {
    const post = await PostDetailsModel.findById(compositePostId);

    if (!post) {
      throw Err.client(ClientErrorCode.NOT_FOUND, 'Post not found', {
        service: ErrorService.Local,
        operation: 'commitDelete',
        context: { compositePostId },
      });
    }
    const hadConnections = await LocalPostService.delete({ compositePostId });

    // Always delete from homeserver, even if the post had connections (soft delete).
    // Nexus will determine the definitive state based on graph state.
    const postUrl = post.uri;
    await HomeserverService.request({ method: HttpMethod.DELETE, url: postUrl });

    if (!hadConnections && post.attachments && post.attachments.length > 0) {
      await FileApplication.commitDelete(post.attachments);
    }
  }

  static async commitEdit({ compositePostId, post, postUrl }: TEditPostInput) {
    const originalPost = await LocalPostService.readDetails({ postId: compositePostId });
    await LocalPostService.edit({ compositePostId, content: post.content });

    try {
      await HomeserverService.request({ method: HttpMethod.PUT, url: postUrl, bodyJson: post.toJson() });
    } catch (error) {
      if (originalPost) {
        try {
          await LocalPostService.edit({ compositePostId, content: originalPost.content });
        } catch (rollbackError) {
          Logger.error('[PostApplication.commitEdit] Failed to rollback local post edit', {
            compositePostId,
            rollbackError,
          });
        }
      }
      throw error;
    }
  }
}
