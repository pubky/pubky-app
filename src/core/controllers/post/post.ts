import * as Core from '@/core';
import { Err, ErrorService, ClientErrorCode } from '@/libs';

export class PostController {
  private constructor() {} // Prevent instantiation

  /**
   * Read post details from local database
   * @param params - Parameters object
   * @param params.compositeId - Composite post ID in format "authorId:postId"
   * @returns Post details or null if not found
   */
  static async getDetails({ compositeId }: Core.TCompositeId): Promise<Core.EnrichedPostDetails | null> {
    return await Core.PostApplication.getDetails({ compositeId });
  }

  /**
   * Read post counts for a specific post
   * @param params - Parameters object
   * @param params.compositeId - Composite post ID in format "authorId:postId"
   * @returns Post counts or null if not found
   */
  static async getCounts({ compositeId }: Core.TCompositeId): Promise<Core.PostCountsModelSchema | null> {
    return await Core.PostApplication.getCounts({ compositeId });
  }

  /**
   * Read post tags for a specific post from local database
   * @param params - Parameters object
   * @param params.compositeId - Composite post ID in format "authorId:postId"
   * @returns Post tags
   */
  static async getTags({ compositeId }: Core.TCompositeId): Promise<Core.TagCollectionModelSchema<string>[]> {
    return await Core.PostApplication.getTags({ compositeId });
  }

  /**
   * Read post relationships for a specific post
   * @param params - Parameters object
   * @param params.compositeId - Composite post ID in format "authorId:postId"
   * @returns Post relationships or null if not found
   */
  static async getRelationships({ compositeId }: Core.TCompositeId): Promise<Core.PostRelationshipsModelSchema | null> {
    return await Core.PostApplication.getRelationships({ compositeId });
  }

  /**
   * Read all posts that are replies to a specific post
   * @param params - Parameters object
   * @param params.compositeId - Composite post ID to read replies for
   * @returns Array of post relationships that replied to this post
   */
  static async getReplies({ compositeId }: Core.TCompositeId): Promise<Core.PostRelationshipsModelSchema[]> {
    return await Core.PostApplication.getReplies({ compositeId });
  }

  /**
   * Read or fetch a full post entity from local database or Nexus API.
   * Persists details, counts, relationships, tags, and author.
   * @param params - Parameters object
   * @param params.compositeId - Composite post ID in format "authorId:postId"
   * @param params.viewerId - Optional viewer ID for relationship data
   * @returns Post details or null if not found
   */
  static async getOrFetch(params: Core.TGetOrFetchPostParams): Promise<Core.PostDetailsModelSchema | null> {
    return await Core.PostApplication.getOrFetch(params);
  }

  /**
   * Fetch a post from Nexus and persist to local database (network-only, no local read).
   * Use instead of `getOrFetch` when the caller already knows the post is not cached.
   * @param params - Parameters object
   * @param params.compositeId - Composite post ID in format "authorId:postId"
   * @param params.viewerId - Optional viewer ID for relationship data
   * @returns Post details or null if not found
   */
  static async fetch(params: Core.TGetOrFetchPostParams): Promise<Core.PostDetailsModelSchema | null> {
    return await Core.PostApplication.fetch(params);
  }

  /**
   * Fetch more post tags from Nexus with pagination
   * @param params - Parameters object
   * @param params.compositeId - Composite post ID in format "authorId:postId"
   * @param params.skip - Number of tags to skip
   * @param params.limit - Maximum number of tags to return
   * @returns Array of tags from Nexus
   */
  static async fetchTags({ compositeId, skip, limit }: Core.TFetchMorePostTagsParams): Promise<Core.NexusTag[]> {
    return await Core.PostApplication.fetchTags({ compositeId, skip, limit });
  }

  /**
   * Fetch taggers for a specific tag label on a post from Nexus API
   * @param params - Parameters containing composite post ID, label, and pagination options
   * @returns Tagger payload for the label ({ users, relationship })
   */
  static async fetchTaggers(params: Core.TFetchPostTaggersParams): Promise<Core.NexusTaggers> {
    return await Core.PostApplication.fetchTaggers(params);
  }

  /**
   * Create a post (including replies and reposts)
   * @param params - Parameters object
   * @param params.authorId - ID of the user creating the post
   * @param params.content - Post content (can be empty for simple reposts)
   * @param params.isArticle - Whether the post is a long-form article
   * @param params.tags - Tags to add to the post (optional)
   * @param params.attachments - Attachments to add to the post (optional)
   * @param params.parentPostId - ID of the post being replied to (optional for root posts)
   * @param params.originalPostId - ID of the post being reposted (optional for reposts)
   * @returns The composite post ID of the created post
   */
  static async commitCreate({
    authorId,
    content,
    isArticle,
    tags,
    attachments,
    parentPostId,
    originalPostId,
  }: Core.TCreatePostParams): Promise<string> {
    let parentUri: string | undefined = undefined;
    let repostedUri: string | undefined = undefined;
    let tagList: Core.TCreateTagInput[] = [];

    // Validate and set parent URI if this is a reply
    if (parentPostId) {
      parentUri = await Core.PostValidators.validatePostId({ postId: parentPostId, message: 'Parent post' });
    }
    if (originalPostId) {
      repostedUri = await Core.PostValidators.validatePostId({ postId: originalPostId, message: 'Original post' });
    }

    const postKind = Core.inferPostKindForCreate({ content, attachments, isArticle });

    // TODO: In the future, we could decouple that action and do it asyncronously in the moment that we add a file to the post
    const fileAttachments = attachments ? await this.normalizeFileAttachments({ attachments, pubky: authorId }) : [];

    const { post, meta } = await Core.PostNormalizer.to(
      {
        content: content.trim(),
        kind: postKind,
        parentUri,
        embed: repostedUri,
        attachments: fileAttachments,
      },
      authorId,
    );

    const { id: postId } = meta;

    if (tags) {
      const tagsMetadata = tags.map((tag) => {
        return {
          taggerId: authorId,
          taggedId: `${authorId}:${postId}`,
          label: tag,
          taggedKind: Core.TagKind.POST,
        };
      });
      tagList = this.normalizeTags({ tags: tagsMetadata });
    }

    const compositePostId = Core.buildCompositeId({ pubky: authorId, id: postId });

    await Core.PostApplication.commitCreate({
      compositePostId,
      post,
      postUrl: meta.url,
      fileAttachments,
      tags: tagList,
    });

    return compositePostId;
  }

  /**
   * Delete a post
   * @param params - Parameters object
   * @param params.postId - ID of the post to delete
   */
  static async commitDelete({ compositePostId }: Core.TDeletePostParams) {
    const { pubky: authorId, id: postId } = Core.parseCompositeId(compositePostId);
    const userId = Core.useAuthStore.getState().selectCurrentUserPubky();

    if (authorId !== userId) {
      throw Err.client(ClientErrorCode.NOT_FOUND, 'User is not the author of this post', {
        service: ErrorService.Local,
        operation: 'commitDelete',
        context: { postId, userId },
      });
    }

    await Core.PostApplication.commitDelete({ compositePostId });
  }

  static async commitEdit({ compositePostId, content }: Core.TEditPostParams) {
    const currentUserPubky = Core.useAuthStore.getState().selectCurrentUserPubky();
    const { post, meta } = await Core.PostNormalizer.toEdit({ compositePostId, content, currentUserPubky });

    await Core.PostApplication.commitEdit({ compositePostId, post, postUrl: meta.url });
  }

  /**
   * Normalize file attachments
   * @param params - Parameters object
   * @param params.attachments - Attachments to normalize
   * @param params.pubky - Public key of the author
   * @returns Normalized file attachments
   */
  private static async normalizeFileAttachments({
    attachments,
    pubky,
  }: Core.TFileAttachmentsParams): Promise<Core.TFileAttachmentResult[]> {
    return await Promise.all(
      attachments.map(async (attachment) => {
        return await Core.FileNormalizer.toFileAttachment({ file: attachment, pubky });
      }),
    );
  }

  /**
   * Normalize tags
   * @param params - Parameters object
   * @param params.tags - Tags to normalize
   * @returns Normalized tags
   */
  private static normalizeTags({ tags }: Core.TNormalizeTagsParams): Core.TCreateTagInput[] {
    return tags.map((param: Core.TTagEventParams) => {
      return Core.TagNormalizer.from(param);
    });
  }
}
