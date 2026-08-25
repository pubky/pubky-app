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
import { isHomeserverFileUri } from '@/libs/file/homeserverFileUri';
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
import { PostNormalizer } from '@/pipes/post/post.normalizer';
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
          // Known record + blob URLs: also cleans up partial uploads (blob PUT
          // ok, record PUT failed) that a record-based delete cannot reach
          await FileApplication.commitDeleteUploaded(fileAttachments);
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

  /**
   * Delete a post (or collection) from local storage and the homeserver.
   *
   * Collection covers: `cover_image` lives in the content envelope, not
   * `post.attachments`. After the homeserver post DELETE succeeds, if the post
   * was a collection with a homeserver file cover, that file is deleted too —
   * including when the local row is soft-deleted (`hadConnections`), because
   * the envelope is tombstoned either way and no longer references the file.
   * Failures during cover delete are logged and swallowed so they do not fail
   * an already-successful post delete. External http(s) covers are never deleted.
   *
   * Regular attachment cleanup still runs only when `!hadConnections`, and is
   * likewise best-effort.
   */
  static async commitDelete({ compositePostId }: TDeletePostParams) {
    const post = await PostDetailsModel.findById(compositePostId);

    if (!post) {
      throw Err.client(ClientErrorCode.NOT_FOUND, 'Post not found', {
        service: ErrorService.Local,
        operation: 'commitDelete',
        context: { compositePostId },
      });
    }

    // Capture collection cover before local delete tombstones content to `[DELETED]`.
    const collectionCoverUri =
      post.kind === 'collection' ? CollectionPostContent.parse(post.content)?.cover_image : undefined;

    const hadConnections = await LocalPostService.delete({ compositePostId });

    // Always delete from homeserver, even if the post had connections (soft delete).
    // Nexus will determine the definitive state based on graph state.
    const postUrl = post.uri;
    await HomeserverService.request({ method: HttpMethod.DELETE, url: postUrl });

    // Best-effort: the post delete already succeeded on the homeserver, so a
    // file-cleanup failure (e.g. files already deleted by an earlier edit whose
    // Nexus state was reverted locally) must not surface as a delete failure.
    if (!hadConnections && post.attachments && post.attachments.length > 0) {
      await FileApplication.commitDelete(post.attachments).catch((cleanupError) => {
        Logger.warn('[PostApplication.commitDelete] Failed to cleanup post attachments', {
          compositePostId,
          cleanupError,
        });
      });
    }

    // Cover is no longer referenced after delete; if this delete fails, the post
    // delete still stands (old cover may remain on the homeserver).
    if (isHomeserverFileUri(collectionCoverUri)) {
      await FileApplication.commitDelete([collectionCoverUri]).catch((cleanupError) => {
        Logger.warn('[PostApplication.commitDelete] Failed to cleanup collection cover', {
          compositePostId,
          collectionCoverUri,
          cleanupError,
        });
      });
    }
  }

  /**
   * Edit a post: optimistic local write, then homeserver PUT.
   *
   * Attachment changes: `fileAttachments` (new uploads) are committed to the
   * homeserver before the post PUT so the edited post never references files
   * that don't exist yet; they are deleted again if the PUT fails. `removedUris`
   * are deleted only after a successful PUT, best-effort — a cleanup failure
   * must not surface as an edit failure (the old files may remain orphaned).
   *
   * The local row always converges to the envelope being PUT (content,
   * attachments, and kind), so content-only callers are no-op writes for the
   * attachment/kind columns.
   */
  static async commitEdit({ compositePostId, post, postUrl, fileAttachments, removedUris }: TEditPostInput) {
    const originalPost = await LocalPostService.readDetails({ postId: compositePostId });

    const hasNewFiles = fileAttachments != null && fileAttachments.length > 0;

    // Rollback helper for freshly uploaded files: uses the known record + blob
    // URLs so it also cleans up partial uploads (blob PUT ok, record PUT failed)
    // that a record-based delete cannot reach. Best-effort — the triggering
    // error is what gets rethrown.
    const rollbackUploadedFiles = async () => {
      if (!hasNewFiles) return;
      await FileApplication.commitDeleteUploaded(fileAttachments).catch((cleanupError) => {
        Logger.error('[PostApplication.commitEdit] Failed to rollback new file attachments', {
          compositePostId,
          cleanupError,
        });
      });
    };

    if (hasNewFiles) {
      try {
        await FileApplication.commitCreate({ fileAttachments });
      } catch (error) {
        // Uploads run in parallel and can partially succeed; sweep everything
        // best-effort before rethrowing (nothing else has happened yet).
        await rollbackUploadedFiles();
        throw error;
      }
    }

    try {
      await LocalPostService.edit({
        compositePostId,
        content: post.content,
        attachments: post.attachments ?? null,
        kind: PostNormalizer.postKindToLowerCase(post.kind),
      });
    } catch (error) {
      // Local write failed after the uploads — remove them or they orphan
      await rollbackUploadedFiles();
      throw error;
    }

    try {
      await HomeserverService.request({ method: HttpMethod.PUT, url: postUrl, bodyJson: post.toJson() });
    } catch (error) {
      if (originalPost) {
        try {
          await LocalPostService.edit({
            compositePostId,
            content: originalPost.content,
            attachments: originalPost.attachments,
            kind: originalPost.kind,
          });
        } catch (rollbackError) {
          Logger.error('[PostApplication.commitEdit] Failed to rollback local post edit', {
            compositePostId,
            rollbackError,
          });
        }
      }

      await rollbackUploadedFiles();

      throw error;
    }

    // A kind change strands the post in the old kind's filtered streams —
    // permanently, since stream persistence only merges and never evicts.
    // Remove it from every cached old-kind stream after the edit is fully
    // committed (best-effort); runs after the PUT so a failed edit never
    // touches stream membership.
    const nextKind = PostNormalizer.postKindToLowerCase(post.kind);
    if (originalPost && originalPost.kind !== nextKind) {
      await LocalPostService.removeFromKindStreams({ compositePostId, kind: originalPost.kind }).catch(
        (cleanupError) => {
          Logger.warn('[PostApplication.commitEdit] Failed to remove post from old kind streams', {
            compositePostId,
            oldKind: originalPost.kind,
            cleanupError,
          });
        },
      );
    }

    const deletableRemovedUris = removedUris?.filter(isHomeserverFileUri) ?? [];
    if (deletableRemovedUris.length > 0) {
      await FileApplication.commitDelete(deletableRemovedUris).catch((cleanupError) => {
        Logger.warn('[PostApplication.commitEdit] Failed to cleanup removed attachments', {
          compositePostId,
          removedUris: deletableRemovedUris,
          cleanupError,
        });
      });
    }
  }
}
