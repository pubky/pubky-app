import { postUriBuilder, PubkyAppPostKind } from 'pubky-app-specs';
import { FileApplication } from '@/application/file/file';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { PostApplication } from '@/application/post/post';
import type { TGetDetailsByIdsParams, TGetOrFetchPostParams } from '@/application/post/post.types';
import { TagKind, type TCreateTagInput } from '@/application/tag/tag.types';
import type {
  TCreateCollectionParams,
  TCreatePostParams,
  TDeletePostParams,
  TEditCollectionParams,
  TEditPostParams,
  TFetchMorePostTagsParams,
  TFetchPostTaggersParams,
  TFileAttachmentsParams,
  TNormalizeTagsParams,
  TReorderCollectionItemsParams,
  TUpdateCollectionItemParams,
} from '@/controllers/post/post.types';
import type { TTagEventParams } from '@/controllers/tag/tag.types';
import { ClientErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { toAppError } from '@/libs/error/error.utils';
import { isHomeserverFileUri } from '@/libs/file/homeserverFileUri';
import { Logger } from '@/libs/logger/logger';
import { isPostDeleted } from '@/libs/utils/utils';
import { buildCompositeId, parseCompositeId } from '@/models/models.utils';
import type { CollectionPost, TAuthoredCollectionsParams } from '@/models/post/collection/collectionPost.types';
import type { PostCountsModelSchema } from '@/models/post/counts/postCounts.schema';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import type { PostRelationshipsModelSchema } from '@/models/post/relationships/postRelationships.schema';
import type { TagCollectionModelSchema } from '@/models/shared/tag/tag.schema';
import type { TFileAttachmentResult } from '@/pipes/file/file.types';
import { CollectionPostContent } from '@/pipes/post/post.collection';
import {
  inferPostKindForCreate,
  inferPostKindForEdit,
  resolveTagTargetCompositeIdForPostCreate,
} from '@/pipes/post/post.kind';
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
   * Bulk read post details for multiple posts from the local database, preserving input order.
   * @param params - Parameters object
   * @param params.compositeIds - Composite post IDs in format "authorId:postId"
   * @returns Array of post details aligned to `compositeIds` (undefined for missing posts)
   */
  static async getDetailsByIds({
    compositeIds,
  }: TGetDetailsByIdsParams): Promise<(PostDetailsModelSchema | undefined)[]> {
    return await PostApplication.getDetailsByIds({ compositeIds });
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

  static async getAuthoredCollections(params: TAuthoredCollectionsParams): Promise<CollectionPost[] | null> {
    return await PostApplication.getAuthoredCollections(params);
  }

  static async fetchAuthoredCollections(params: TAuthoredCollectionsParams): Promise<CollectionPost[] | null> {
    return await PostApplication.fetchAuthoredCollections(params);
  }

  /**
   * Fetch more post tags from Nexus with pagination
   * @param params - Parameters object
   * @param params.compositeId - Composite post ID in format "authorId:postId"
   * @param params.skip - Number of tags to skip
   * @param params.limit - Maximum number of tags to return
   * @returns Array of tags from Nexus
   */
  static async fetchTags({ compositeId, skip, limit, viewerId }: TFetchMorePostTagsParams): Promise<NexusTag[]> {
    return await PostApplication.fetchTags({ compositeId, skip, limit, viewerId });
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

  static async commitCreateCollection({
    authorId,
    name,
    description,
    items,
    coverImage,
    layout,
  }: TCreateCollectionParams): Promise<string> {
    // Upload cover image to homeserver first when a File is supplied. We do this
    // before normalization so the resulting `pubky://` URL participates in the
    // envelope's max-length and protocol validation.
    let coverImageUrl: string | null = null;
    if (coverImage instanceof File) {
      try {
        const fileAttachment = await FileApplication.toFileAttachment({ file: coverImage, pubky: authorId });
        await FileApplication.commitCreate({ fileAttachments: [fileAttachment] });
        coverImageUrl = fileAttachment.fileResult.meta.url;
      } catch (error) {
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Failed to upload collection cover image', {
          service: ErrorService.Local,
          operation: 'commitCreateCollection',
          cause: error,
        });
      }
    } else if (typeof coverImage === 'string') {
      coverImageUrl = coverImage;
    }

    const { post, meta } = await PostNormalizer.toCollection(
      {
        name,
        description,
        items,
        coverImage: coverImageUrl,
        layout,
      },
      authorId,
    );

    const { id: postId } = meta;
    const compositePostId = buildCompositeId({ pubky: authorId, id: postId });

    await PostApplication.commitCreate({
      compositePostId,
      post,
      postUrl: meta.url,
    });

    return compositePostId;
  }

  /**
   * Edit a collection's name, description, and cover image.
   *
   * `coverImage` is required: pass a `File` to replace, the current cover URL
   * string to keep it, or `null` to clear. Callers must not omit it.
   *
   * Cover cleanup: after the envelope is persisted, if the previous `cover_image`
   * was a homeserver file URI and is no longer referenced (replaced or cleared),
   * that file is deleted from the homeserver. Failures during that delete are
   * logged and swallowed — the edit already succeeded, so a cleanup failure must
   * not surface as an edit failure (the old file may remain orphaned). External
   * http(s) covers are never deleted.
   *
   * If a new cover File was uploaded and then edit normalization or `commitEdit`
   * fails, the new file is deleted before rethrowing so the failed edit does not
   * leave an unreferenced upload.
   */
  static async commitEditCollection({
    compositeCollectionId,
    name,
    description,
    coverImage,
    layout,
  }: TEditCollectionParams): Promise<void> {
    // Reject non-authors up front, before any side effects: the cover File
    // upload below would otherwise hit the homeserver (and `PostNormalizer.toEdit`
    // only enforces the author check later). Mirrors the explicit guard in
    // `commitDelete`.
    const { pubky: authorId } = parseCompositeId(compositeCollectionId);
    const currentUserPubky = useAuthStore.getState().selectCurrentUserPubky();
    if (authorId !== currentUserPubky) {
      throw Err.client(ClientErrorCode.NOT_FOUND, 'Current user is not the author of this post', {
        service: ErrorService.Local,
        operation: 'commitEditCollection',
        context: { compositeCollectionId, currentUserPubky },
      });
    }

    const collection = await PostApplication.getDetails({ compositeId: compositeCollectionId });

    // Tombstoned collections (`content === '[DELETED]'`) are treated as
    // not-found here. Pre-tombstone refactor `!collection` caught hard-deleted
    // rows; now they stick around as tombstones, and falling through would
    // surface a misleading "Collection content is invalid" error.
    if (!collection || isPostDeleted(collection.content)) {
      throw Err.client(ClientErrorCode.NOT_FOUND, 'Collection not found', {
        service: ErrorService.Local,
        operation: 'commitEditCollection',
        context: { compositeCollectionId },
      });
    }

    const currentContent = CollectionPostContent.parse(collection.content);
    if (!currentContent) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Collection content is invalid', {
        service: ErrorService.Local,
        operation: 'commitEditCollection',
        context: { compositeCollectionId },
      });
    }

    const previousCover = currentContent.cover_image;
    let coverImageUrl: string | null = null;
    let uploadedCoverUri: string | null = null;
    if (coverImage instanceof File) {
      try {
        const fileAttachment = await FileApplication.toFileAttachment({ file: coverImage, pubky: authorId });
        await FileApplication.commitCreate({ fileAttachments: [fileAttachment] });
        coverImageUrl = fileAttachment.fileResult.meta.url;
        uploadedCoverUri = coverImageUrl;
      } catch (error) {
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Failed to upload collection cover image', {
          service: ErrorService.Local,
          operation: 'commitEditCollection',
          cause: error,
        });
      }
    } else if (typeof coverImage === 'string') {
      coverImageUrl = coverImage;
    }

    try {
      const nextContent = CollectionPostContent.toJson({
        name,
        description,
        items: currentContent.items ?? [],
        coverImage: coverImageUrl,
        layout: layout ?? currentContent.layout,
      });

      const { post, meta } = await PostNormalizer.toEdit({
        compositePostId: compositeCollectionId,
        content: nextContent,
        currentUserPubky,
      });

      await PostApplication.commitEdit({
        compositePostId: compositeCollectionId,
        post,
        postUrl: meta.url,
      });
    } catch (error) {
      // Roll back the newly uploaded cover so a failed edit does not orphan it.
      // If rollback itself fails, log and still rethrow the original edit error.
      if (uploadedCoverUri) {
        await FileApplication.commitDelete([uploadedCoverUri]).catch((cleanupError) => {
          Logger.warn('[PostController.commitEditCollection] Failed to rollback newly uploaded cover', {
            compositeCollectionId,
            uploadedCoverUri,
            cleanupError,
          });
        });
      }
      throw toAppError(error, ErrorService.Local, 'commitEditCollection');
    }

    // Previous cover is no longer referenced by the envelope (replaced or cleared).
    // Delete it after a successful persist; if delete fails, the edit still stands.
    if (isHomeserverFileUri(previousCover) && previousCover !== coverImageUrl) {
      await FileApplication.commitDelete([previousCover]).catch((cleanupError) => {
        Logger.warn('[PostController.commitEditCollection] Failed to cleanup previous collection cover', {
          compositeCollectionId,
          previousCover,
          cleanupError,
        });
      });
    }
  }

  static async commitUpdateCollectionItem({
    collectionId,
    postId,
    shouldAdd,
  }: TUpdateCollectionItemParams): Promise<void> {
    const currentUserPubky = useAuthStore.getState().selectCurrentUserPubky();
    const collection = await PostApplication.getDetails({ compositeId: collectionId });

    // Tombstoned collections are not-found. See `commitEditCollection` above
    // for the rationale.
    if (!collection || isPostDeleted(collection.content)) {
      throw Err.client(ClientErrorCode.NOT_FOUND, 'Collection not found', {
        service: ErrorService.Local,
        operation: 'commitUpdateCollectionItem',
        context: { collectionId },
      });
    }

    const currentContent = CollectionPostContent.parse(collection.content);
    if (!currentContent) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Collection content is invalid', {
        service: ErrorService.Local,
        operation: 'commitUpdateCollectionItem',
        context: { collectionId },
      });
    }

    const { pubky: postAuthorId, id: rawPostId } = parseCompositeId(postId);
    const itemUri = postUriBuilder(postAuthorId, rawPostId);
    const nextContent = shouldAdd
      ? CollectionPostContent.addItem(currentContent, itemUri)
      : CollectionPostContent.removeItem(currentContent, itemUri);

    if (nextContent.items === currentContent.items) return;

    const { post, meta } = await PostNormalizer.toEdit({
      compositePostId: collectionId,
      content: JSON.stringify(nextContent),
      currentUserPubky,
    });

    await PostApplication.commitEdit({
      compositePostId: collectionId,
      post,
      postUrl: meta.url,
    });
  }

  static async commitReorderCollectionItems({ collectionId, items }: TReorderCollectionItemsParams): Promise<void> {
    const currentUserPubky = useAuthStore.getState().selectCurrentUserPubky();
    const collection = await PostApplication.getDetails({ compositeId: collectionId });

    // Tombstoned collections are not-found. See `commitEditCollection` above
    // for the rationale.
    if (!collection || isPostDeleted(collection.content)) {
      throw Err.client(ClientErrorCode.NOT_FOUND, 'Collection not found', {
        service: ErrorService.Local,
        operation: 'commitReorderCollectionItems',
        context: { collectionId },
      });
    }

    const currentContent = CollectionPostContent.parse(collection.content);
    if (!currentContent) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Collection content is invalid', {
        service: ErrorService.Local,
        operation: 'commitReorderCollectionItems',
        context: { collectionId },
      });
    }

    const nextContent = CollectionPostContent.reorderItems(currentContent, items);

    if (nextContent.items === currentContent.items) return;

    const { post, meta } = await PostNormalizer.toEdit({
      compositePostId: collectionId,
      content: JSON.stringify(nextContent),
      currentUserPubky,
    });

    await PostApplication.commitEdit({
      compositePostId: collectionId,
      post,
      postUrl: meta.url,
    });
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

  /**
   * Edit a post's content and, optionally, its attachments.
   *
   * Without `attachments` this is a content-only edit. With `attachments`,
   * `kept` URIs are validated against the post's current attachments, `added`
   * files are normalized here (no IO) and uploaded by the application layer,
   * current attachments not in `kept` are deleted best-effort after a
   * successful edit, and the post kind is recomputed to match the resulting
   * attachment set (articles and collections keep their kind).
   */
  static async commitEdit({ compositePostId, content, attachments }: TEditPostParams) {
    const currentUserPubky = useAuthStore.getState().selectCurrentUserPubky();

    if (!attachments) {
      const { post, meta } = await PostNormalizer.toEdit({ compositePostId, content, currentUserPubky });

      await PostApplication.commitEdit({ compositePostId, post, postUrl: meta.url });
      return;
    }

    // Reject non-authors up front, before the CPU-heavy file sanitization below
    // (`PostNormalizer.toEdit` only enforces the author check later). Mirrors
    // the explicit guard in `commitEditCollection`.
    const { pubky: authorId } = parseCompositeId(compositePostId);
    if (authorId !== currentUserPubky) {
      throw Err.client(ClientErrorCode.NOT_FOUND, 'Current user is not the author of this post', {
        service: ErrorService.Local,
        operation: 'commitEdit',
        context: { compositePostId, currentUserPubky },
      });
    }

    const current = await PostApplication.getDetails({ compositeId: compositePostId });
    if (!current || isPostDeleted(current.content)) {
      throw Err.client(ClientErrorCode.NOT_FOUND, 'Post not found', {
        service: ErrorService.Local,
        operation: 'commitEdit',
        context: { compositePostId },
      });
    }

    const { original, kept, added } = attachments;
    const keptSet = new Set(kept);
    if (keptSet.size !== kept.length || !kept.every((uri) => original.includes(uri))) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Kept attachments must be original post attachments', {
        service: ErrorService.Local,
        operation: 'commitEdit',
        context: { compositePostId },
      });
    }

    // Removals are diffed against the seeded snapshot (`original`), never the
    // live row — only files the user actually saw and removed get deleted.
    const removedUris = original.filter((uri) => !keptSet.has(uri));

    const fileAttachments =
      added.length > 0 ? await this.normalizeFileAttachments({ attachments: added, pubky: authorId }) : [];
    const nextUris = [...kept, ...fileAttachments.map((f) => f.fileResult.meta.url)];

    const kind = await this.inferKindForEdit({ content, currentKind: current.kind, kept, added });

    const { post, meta } = await PostNormalizer.toEdit({
      compositePostId,
      content,
      currentUserPubky,
      attachments: nextUris.length > 0 ? nextUris : null,
      kind,
    });

    await PostApplication.commitEdit({
      compositePostId,
      post,
      postUrl: meta.url,
      fileAttachments: fileAttachments.length > 0 ? fileAttachments : undefined,
      removedUris: removedUris.length > 0 ? removedUris : undefined,
    });
  }

  /**
   * Kind for an edited post whose attachment set changed. Articles and
   * collections keep their kind. Kept attachments resolve their content types
   * from local file metadata; if any kept attachment has no local row its type
   * is unknown, so the current kind is preserved rather than guessed.
   */
  private static async inferKindForEdit({
    content,
    currentKind,
    kept,
    added,
  }: {
    content: string;
    currentKind: string;
    kept: string[];
    added: File[];
  }): Promise<PubkyAppPostKind> {
    if (currentKind === 'long' || currentKind === 'collection') {
      return PostNormalizer.mapKindToEnum(currentKind);
    }

    let keptContentTypes: string[] = [];
    if (kept.length > 0) {
      const metadata = await FileApplication.getMetadata({ fileAttachments: kept });
      const typeByUri = new Map(metadata.map((file) => [file.uri, file.content_type]));
      const resolvedTypes = kept.map((uri) => typeByUri.get(uri));
      if (resolvedTypes.some((type) => !type)) {
        return PostNormalizer.mapKindToEnum(currentKind);
      }
      keptContentTypes = resolvedTypes as string[];
    }

    return inferPostKindForEdit({
      content,
      attachmentContentTypes: [...keptContentTypes, ...added.map((file) => file.type)],
      currentKind,
    });
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
    const fileAttachments: TFileAttachmentResult[] = [];

    for (const attachment of attachments) {
      fileAttachments.push(await FileApplication.toFileAttachment({ file: attachment, pubky }));
    }

    return fileAttachments;
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
