import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { PostApplication } from '@/application/post/post';
import type { TGetOrFetchPostParams } from '@/application/post/post.types';
import { TagKind, type TCreateTagInput } from '@/application/tag/tag.types';
import type {
  TCreatePostParams,
  TDeletePostParams,
  TEditPostParams,
  TFetchMorePostTagsParams,
  TFetchPostTaggersParams,
  TFileAttachmentsParams,
  TNormalizeTagsParams,
} from '@/controllers/post/post.types';
import type { TTagEventParams } from '@/controllers/tag/tag.types';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { buildCompositeId, parseCompositeId } from '@/models/models.utils';
import type { PostCountsModelSchema } from '@/models/post/counts/postCounts.schema';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import type { PostRelationshipsModelSchema } from '@/models/post/relationships/postRelationships.schema';
import type { TagCollectionModelSchema } from '@/models/shared/tag/tag.schema';
import { FileNormalizer } from '@/pipes/file/file.normalizer';
import type { TFileAttachmentResult } from '@/pipes/file/file.types';
import { inferPostKindForCreate, resolveTagTargetCompositeIdForPostCreate } from '@/pipes/post/post.kind';
import { PostNormalizer } from '@/pipes/post/post.normalizer';
import { PostValidators } from '@/pipes/post/post.validators';
import { TagNormalizer } from '@/pipes/tag/tag.normalizer';
import type { NexusTag, NexusTaggers } from '@/services/nexus/nexus.types';
import type { TCompositeId } from '@/services/nexus/post/post.types';
import { useAuthStore } from '@/stores/auth/auth.store';

export class PostController {
  private constructor() {} // Prevent instantiation

  /**
   * Read post details from local database
   * @param params - Parameters object
   * @param params.compositeId - Composite post ID in format "authorId:postId"
   * @returns Post details or null if not found
   */
  static async getDetails({ compositeId }: TCompositeId): Promise<EnrichedPostDetails | null> {
    return await PostApplication.getDetails({ compositeId });
  }

  /**
   * Read post counts for a specific post
   * @param params - Parameters object
   * @param params.compositeId - Composite post ID in format "authorId:postId"
   * @returns Post counts or null if not found
   */
  static async getCounts({ compositeId }: TCompositeId): Promise<PostCountsModelSchema | null> {
    return await PostApplication.getCounts({ compositeId });
  }

  /**
   * Read post tags for a specific post from local database
   * @param params - Parameters object
   * @param params.compositeId - Composite post ID in format "authorId:postId"
   * @returns Post tags
   */
  static async getTags({ compositeId }: TCompositeId): Promise<TagCollectionModelSchema<string>[]> {
    return await PostApplication.getTags({ compositeId });
  }

  /**
   * Read post relationships for a specific post
   * @param params - Parameters object
   * @param params.compositeId - Composite post ID in format "authorId:postId"
   * @returns Post relationships or null if not found
   */
  static async getRelationships({ compositeId }: TCompositeId): Promise<PostRelationshipsModelSchema | null> {
    return await PostApplication.getRelationships({ compositeId });
  }

  /**
   * Read all posts that are replies to a specific post
   * @param params - Parameters object
   * @param params.compositeId - Composite post ID to read replies for
   * @returns Array of post relationships that replied to this post
   */
  static async getReplies({ compositeId }: TCompositeId): Promise<PostRelationshipsModelSchema[]> {
    return await PostApplication.getReplies({ compositeId });
  }

  /**
   * Read or fetch a full post entity from local database or Nexus API.
   * Persists details, counts, relationships, tags, and author.
   * @param params - Parameters object
   * @param params.compositeId - Composite post ID in format "authorId:postId"
   * @param params.viewerId - Optional viewer ID for relationship data
   * @returns Post details or null if not found
   */
  static async getOrFetch(params: TGetOrFetchPostParams): Promise<PostDetailsModelSchema | null> {
    return await PostApplication.getOrFetch(params);
  }

  /**
   * Fetch a post from Nexus and persist to local database (network-only, no local read).
   * Use instead of `getOrFetch` when the caller already knows the post is not cached.
   * @param params - Parameters object
   * @param params.compositeId - Composite post ID in format "authorId:postId"
   * @param params.viewerId - Optional viewer ID for relationship data
   * @returns Post details or null if not found
   */
  static async fetch(params: TGetOrFetchPostParams): Promise<PostDetailsModelSchema | null> {
    return await PostApplication.fetch(params);
  }

  /**
   * Fetch more post tags from Nexus with pagination
   * @param params - Parameters object
   * @param params.compositeId - Composite post ID in format "authorId:postId"
   * @param params.skip - Number of tags to skip
   * @param params.limit - Maximum number of tags to return
   * @returns Array of tags from Nexus
   */
  static async fetchTags({ compositeId, skip, limit }: TFetchMorePostTagsParams): Promise<NexusTag[]> {
    return await PostApplication.fetchTags({ compositeId, skip, limit });
  }

  /**
   * Fetch taggers for a specific tag label on a post from Nexus API
   * @param params - Parameters containing composite post ID, label, and pagination options
   * @returns Tagger payload for the label ({ users, relationship })
   */
  static async fetchTaggers(params: TFetchPostTaggersParams): Promise<NexusTaggers> {
    return await PostApplication.fetchTaggers(params);
  }

  /**
   * Create a post (including replies and reposts)
   * @param params - Parameters object
   * @param params.authorId - ID of the user creating the post
   * @param params.content - Post content (can be empty for simple reposts)
   * @param params.isArticle - Whether the post is a long-form article
   * @param params.tags - Tags to add (optional). For a simple repost, tags target the embedded original post.
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
  }: TCreatePostParams): Promise<string> {
    let parentUri: string | undefined = undefined;
    let repostedUri: string | undefined = undefined;
    let tagList: TCreateTagInput[] = [];

    // Validate and set parent URI if this is a reply
    if (parentPostId) {
      parentUri = await PostValidators.validatePostId({ postId: parentPostId, message: 'Parent post' });
    }
    if (originalPostId) {
      repostedUri = await PostValidators.validatePostId({ postId: originalPostId, message: 'Original post' });
    }

    const postKind = inferPostKindForCreate({ content, attachments, isArticle });

    // TODO: In the future, we could decouple that action and do it asyncronously in the moment that we add a file to the post
    const fileAttachments = attachments ? await this.normalizeFileAttachments({ attachments, pubky: authorId }) : [];

    const { post, meta } = await PostNormalizer.to(
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
      const tagTargetCompositeId = resolveTagTargetCompositeIdForPostCreate({
        authorId,
        newPostId: postId,
        originalPostId,
        content,
        attachments,
      });
      const tagsMetadata = tags.map((tag) => {
        return {
          taggerId: authorId,
          taggedId: tagTargetCompositeId,
          label: tag,
          taggedKind: TagKind.POST,
        };
      });
      tagList = this.normalizeTags({ tags: tagsMetadata });
    }

    const compositePostId = buildCompositeId({ pubky: authorId, id: postId });

    await PostApplication.commitCreate({
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
  static async commitDelete({ compositePostId }: TDeletePostParams) {
    const { pubky: authorId, id: postId } = parseCompositeId(compositePostId);
    const userId = useAuthStore.getState().selectCurrentUserPubky();

    if (authorId !== userId) {
      throw Err.client(ClientErrorCode.NOT_FOUND, 'User is not the author of this post', {
        service: ErrorService.Local,
        operation: 'commitDelete',
        context: { postId, userId },
      });
    }

    await PostApplication.commitDelete({ compositePostId });
  }

  static async commitEdit({ compositePostId, content }: TEditPostParams) {
    const currentUserPubky = useAuthStore.getState().selectCurrentUserPubky();
    const { post, meta } = await PostNormalizer.toEdit({ compositePostId, content, currentUserPubky });

    await PostApplication.commitEdit({ compositePostId, post, postUrl: meta.url });
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
  }: TFileAttachmentsParams): Promise<TFileAttachmentResult[]> {
    return await Promise.all(
      attachments.map(async (attachment) => {
        return await FileNormalizer.toFileAttachment({ file: attachment, pubky });
      }),
    );
  }

  /**
   * Normalize tags
   * @param params - Parameters object
   * @param params.tags - Tags to normalize
   * @returns Normalized tags
   */
  private static normalizeTags({ tags }: TNormalizeTagsParams): TCreateTagInput[] {
    return tags.map((param: TTagEventParams) => {
      return TagNormalizer.from(param);
    });
  }
}
