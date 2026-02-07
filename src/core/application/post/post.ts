import * as Core from '@/core';
import { HttpMethod, Err, ClientErrorCode, ErrorService } from '@/libs';

export class PostApplication {
  /**
   * Reads post details from local database and enriches with moderation state
   * @param compositeId - Composite post ID in format "authorId:postId"
   * @returns Post details with moderation state or null if not found
   */
  static async getDetails({ compositeId }: Core.TCompositeId): Promise<Core.EnrichedPostDetails | null> {
    const post = await Core.LocalPostService.readDetails({ postId: compositeId });
    if (!post) return null;
    const [enriched] = await Core.ModerationController.enrichPosts([post]);
    return enriched;
  }

  /**
   * Reads post counts for a specific post
   * @param compositeId - Composite post ID in format "authorId:postId"
   * @returns Post counts (with default values if not found)
   */
  static async getCounts({ compositeId }: Core.TCompositeId): Promise<Core.PostCountsModelSchema> {
    return await Core.LocalPostService.readCounts(compositeId);
  }

  /**
   * Reads post tags for a specific post from local database
   * @param compositeId - Composite post ID in format "authorId:postId"
   * @returns Post tags
   */
  static async getTags({ compositeId }: Core.TCompositeId): Promise<Core.TagCollectionModelSchema<string>[]> {
    return await Core.LocalPostService.readTags(compositeId);
  }

  /**
   * Reads post relationships for a specific post
   * @param compositeId - Composite post ID in format "authorId:postId"
   * @returns Post relationships or null if not found
   */
  static async getRelationships({ compositeId }: Core.TCompositeId): Promise<Core.PostRelationshipsModelSchema | null> {
    return await Core.LocalPostService.readRelationships(compositeId);
  }

  /**
   * Reads all posts that are replies to a specific post
   * @param compositeId - Composite post ID to read replies for
   * @returns Array of post relationships that replied to this post
   */
  static async getReplies({ compositeId }: Core.TCompositeId): Promise<Core.PostRelationshipsModelSchema[]> {
    return await Core.LocalPostService.readReplies(compositeId);
  }

  /**
   * Fetch more post tags from Nexus with pagination and persist to local DB
   * @param compositeId - Composite post ID in format "authorId:postId"
   * @param skip - Number of tags to skip
   * @param limit - Maximum number of tags to return
   * @returns Array of tags from Nexus
   */
  static async fetchTags({ compositeId, skip, limit }: Core.TFetchMorePostTagsParams): Promise<Core.NexusTag[]> {
    const nexusTags = await Core.NexusPostService.getPostTags({ compositeId, skip, limit });

    // Persist new tags to local DB (merge with existing)
    if (nexusTags.length > 0) {
      await Core.LocalPostTagService.mergeTags({ postId: compositeId, tags: nexusTags });
    }

    return nexusTags;
  }

  /**
   * Fetch taggers for a specific tag label on a post from Nexus API
   * @param params - Parameters containing composite post ID, label, and pagination options
   * @returns Tagger payload for the label ({ users, relationship })
   */
  static async fetchTaggers(params: Core.TFetchPostTaggersParams): Promise<Core.NexusTaggers> {
    return await Core.NexusPostService.getPostTaggers(params);
  }

  /**
   * Reads or fetches a post - reads from local DB first, fetches from Nexus if not found
   * Also fetches and persists related data: counts, relationships, tags, and author
   * @param compositeId - Composite post ID in format "authorId:postId"
   * @returns Post details or null if not found
   */
  static async getOrFetchDetails({
    compositeId,
    viewerId,
  }: Core.TGetOrFetchPostParams): Promise<Core.PostDetailsModelSchema | null> {
    const localPost = await Core.LocalPostService.readDetails({ postId: compositeId });
    if (localPost) return localPost;

    // Reuse stream posts logic to fetch and persist single post
    await Core.PostStreamApplication.fetchMissingPostsFromNexus({
      cacheMissPostIds: [compositeId],
      viewerId,
    });

    // Return the persisted post details
    return await Core.LocalPostService.readDetails({ postId: compositeId });
  }

  static async commitCreate({ postUrl, compositePostId, post, fileAttachments, tags }: Core.TCreatePostInput) {
    if (fileAttachments && fileAttachments.length > 0) {
      await Core.FileApplication.commitCreate({ fileAttachments });
    }
    await Core.LocalPostService.create({ compositePostId, post });
    await Core.HomeserverService.request({ method: HttpMethod.PUT, url: postUrl, bodyJson: post.toJson() });

    if (tags && tags.length > 0) {
      await Core.TagApplication.commitCreate({ tagList: tags });
    }
  }

  static async commitDelete({ compositePostId }: Core.TDeletePostParams) {
    const post = await Core.PostDetailsModel.findById(compositePostId);

    if (!post) {
      throw Err.client(ClientErrorCode.NOT_FOUND, 'Post not found', {
        service: ErrorService.Local,
        operation: 'commitDelete',
        context: { compositePostId },
      });
    }
    const hadConnections = await Core.LocalPostService.delete({ compositePostId });

    // Always delete from homeserver, even if the post had connections (soft delete).
    // Nexus will determine the definitive state based on graph state.
    const postUrl = post.uri;
    await Core.HomeserverService.request({ method: HttpMethod.DELETE, url: postUrl });

    if (!hadConnections && post.attachments && post.attachments.length > 0) {
      await Core.FileApplication.commitDelete(post.attachments);
    }
  }

  static async commitEdit({ compositePostId, post, postUrl }: Core.TEditPostInput) {
    // Update local database
    await Core.LocalPostService.edit({ compositePostId, content: post.content });

    // Sync to homeserver
    await Core.HomeserverService.request({ method: HttpMethod.PUT, url: postUrl, bodyJson: post.toJson() });
  }
}
