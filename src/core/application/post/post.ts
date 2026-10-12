import {
  decodeObject,
  listPrefix,
  parseOwnerPath,
  parseUri,
  planDelete,
  type Post,
  type StoredCopy,
  toPath,
  tryDecodeObject,
  type UrlArg,
} from 'pubky-social-specs';
import { FileApplication } from '@/application/file/file';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import type {
  TCreatePostInput,
  TEditPostInput,
  TGetDetailsByIdsParams,
  TGetOrFetchPostParams,
  TGetRelationshipsByIdsParams,
} from '@/application/post/post.types';
import { PostStreamApplication } from '@/application/stream/posts/post';
import { TagApplication } from '@/application/tag/tag';
import { NEXUS_STREAM_MAX_LIMIT } from '@/config/nexus';
import { ModerationController } from '@/controllers/moderation/moderation';
import type { TDeletePostParams, TFetchPostTaggersParams } from '@/controllers/post/post.types';
import { NOT_FOUND_CACHED_STREAM, SKIP_FETCH_NEW_POSTS } from '@/controllers/stream/posts/post.constants';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isHomeserverFileUri } from '@/libs/file/homeserverFileUri';
import { Logger } from '@/libs/logger/logger';
import { isPostDeleted } from '@/libs/utils/utils';
import { parseCompositeId } from '@/models/models.utils';
import type { CollectionPost, TAuthoredCollectionsParams } from '@/models/post/collection/collectionPost.types';
import type { PostCountsModelSchema } from '@/models/post/counts/postCounts.schema';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import type { PostRelationshipsModelSchema } from '@/models/post/relationships/postRelationships.schema';
import { buildAuthorCollectionsStreamId } from '@/models/stream/post/postStream.types';
import type { TFileAttachmentResult } from '@/pipes/file/file.types';
import { ownerPathToUrl } from '@/pipes/pipes.utils';
import { CollectionPostContent } from '@/pipes/post/post.collection';
import { toLocalPostKind } from '@/pipes/post/post.kind';
import { PostNormalizer, type TPostHead } from '@/pipes/post/post.normalizer';
import { postReferenceSpellings } from '@/pipes/post/post.reference';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPostService } from '@/services/local/post/post';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import type { NexusTaggers } from '@/services/nexus/nexus.types';
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
   * Reads post relationships for a specific post
   * @param compositeId - Composite post ID in format "authorId:postId"
   * @returns Post relationships or null if not found
   */
  static async getRelationships({ compositeId }: TCompositeId): Promise<PostRelationshipsModelSchema | null> {
    return await LocalPostService.readRelationships(compositeId);
  }

  /**
   * Bulk reads post relationships from the local database, preserving input order.
   * @param compositeIds - Array of composite post IDs in format "authorId:postId"
   * @returns Array of post relationships aligned to `compositeIds` (undefined for missing posts)
   */
  static async getRelationshipsByIds({
    compositeIds,
  }: TGetRelationshipsByIdsParams): Promise<(PostRelationshipsModelSchema | undefined)[]> {
    return await LocalPostService.readRelationshipsByIds(compositeIds);
  }

  /**
   * Reads all posts that are replies to a specific post
   * @param compositeId - Composite post ID to read replies for
   * @returns Array of post relationships that replied to this post
   */
  static async getReplies({ compositeId }: TCompositeId): Promise<PostRelationshipsModelSchema[]> {
    const { pubky, id } = parseCompositeId(compositeId);
    return await LocalPostService.readReplies(postReferenceSpellings(pubky, id));
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
  static async getOrFetch({
    compositeId,
    viewerId,
    isCurrent,
  }: TGetOrFetchPostParams & { isCurrent?: () => boolean }): Promise<PostDetailsModelSchema | null> {
    const localPost = await LocalPostService.readDetails({ postId: compositeId });
    if (localPost) return localPost;

    // Reuse stream posts logic to fetch and persist single post
    await PostStreamApplication.fetchMissingPostsFromNexus({
      cacheMissPostIds: [compositeId],
      viewerId,
      isCurrent,
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
  static async fetch({
    compositeId,
    viewerId,
    isCurrent,
  }: TGetOrFetchPostParams & { isCurrent?: () => boolean }): Promise<PostDetailsModelSchema | null> {
    await PostStreamApplication.fetchMissingPostsFromNexus({
      cacheMissPostIds: [compositeId],
      viewerId,
      isCurrent,
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
          // Drop tombstoned rows explicitly (the Nexus `deleted` flag, or the
          // legacy `[DELETED]` content) — they would currently be filtered out
          // downstream by `CollectionPostContent.parse` returning `null`, but
          // that's incidental: it relies on the tombstone content failing JSON
          // parse. The explicit check is self-documenting and keeps the picker
          // robust against future parser changes.
          post !== undefined && post.kind === 'collection' && !isPostDeleted(post),
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
    isCurrent,
  }: TAuthoredCollectionsParams & { isCurrent?: () => boolean }): Promise<CollectionPost[] | null> {
    const streamId = buildAuthorCollectionsStreamId(authorId);
    const { cacheMissPostIds } = await PostStreamApplication.fetchStreamSlice({
      streamId,
      streamHead: SKIP_FETCH_NEW_POSTS,
      streamTail: NOT_FOUND_CACHED_STREAM,
      limit: NEXUS_STREAM_MAX_LIMIT,
      viewerId: viewerId ?? null,
      isCurrent,
    });

    if (cacheMissPostIds.length > 0) {
      await PostStreamApplication.fetchMissingPostsFromNexus({
        cacheMissPostIds,
        viewerId,
        isCurrent,
      });
    }

    return await this.getAuthoredCollections({ authorId, viewerId });
  }

  /**
   * Rolls freshly uploaded files back after a failed create or edit: uses the
   * known record + blob URLs so it also cleans up partial uploads (blob PUT
   * ok, record PUT failed) that a record-based delete cannot reach.
   * Best-effort — the triggering error is what the caller rethrows.
   */
  private static async rollbackUploadedFiles({
    fileAttachments,
    compositePostId,
    operation,
  }: {
    fileAttachments: TFileAttachmentResult[];
    compositePostId: string;
    operation: 'commitCreate' | 'commitEdit';
  }) {
    if (fileAttachments.length === 0) return;
    await FileApplication.commitDeleteUploaded(fileAttachments).catch((fileRollbackError) => {
      Logger.error(`[PostApplication.${operation}] Failed to rollback file attachments`, {
        compositePostId,
        fileRollbackError,
      });
    });
  }

  static async commitCreate({ compositePostId, post, fileAttachments, tags, isCurrent }: TCreatePostInput) {
    const hasFiles = fileAttachments != null && fileAttachments.length > 0;
    const rollbackUploadedFiles = () =>
      this.rollbackUploadedFiles({
        fileAttachments: hasFiles ? fileAttachments : [],
        compositePostId,
        operation: 'commitCreate',
      });

    if (hasFiles) {
      try {
        await FileApplication.commitCreate({ fileAttachments });
      } catch (error) {
        // Uploads run in parallel and can partially succeed (an article sends
        // its cover and body files as one batch); sweep everything before
        // rethrowing, so nothing of the unpublished post stays behind.
        await rollbackUploadedFiles();
        throw error;
      }
    }

    try {
      await LocalPostService.create({ compositePostId, post });
    } catch (error) {
      await rollbackUploadedFiles();
      throw error;
    }

    try {
      await HomeserverService.putBlob({ url: post.url, blob: post.body });
    } catch (error) {
      try {
        await LocalPostService.delete({ compositePostId });
      } catch (rollbackError) {
        Logger.error('[PostApplication.commitCreate] Failed to rollback local post create', {
          compositePostId,
          rollbackError,
        });
      }
      await rollbackUploadedFiles();
      throw error;
    }

    if (tags && tags.length > 0) {
      await TagApplication.commitCreate({ tagList: tags, isCurrent });
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
    await this.deleteEveryCopy(compositePostId);

    // Best-effort: the post delete already succeeded on the homeserver, so a
    // file-cleanup failure (e.g. files already deleted by an earlier edit whose
    // Nexus state was reverted locally) must not surface as a delete failure.
    if (!hadConnections && post.attachments && post.attachments.length > 0) {
      await FileApplication.commitDelete(post.attachments, compositePostId).catch((cleanupError) => {
        Logger.warn('[PostApplication.commitDelete] Failed to cleanup post attachments', {
          compositePostId,
          cleanupError,
        });
      });
    }

    // Cover is no longer referenced after delete; if this delete fails, the post
    // delete still stands (old cover may remain on the homeserver).
    if (isHomeserverFileUri(collectionCoverUri)) {
      await FileApplication.commitDelete([collectionCoverUri], compositePostId).catch((cleanupError) => {
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
  static async commitEdit({ compositePostId, edit, fileAttachments, removedUris }: TEditPostInput) {
    const { pubky: authorId, id: postId } = parseCompositeId(compositePostId);
    const originalPost = await LocalPostService.readDetails({ postId: compositePostId });
    // The edit applies to the newest stored version, never to the local copy, so members this
    // client does not hold (a lock, alt text, another client's additions) survive it.
    const head = await this.readHead(authorId, postId);
    const built = PostNormalizer.toEdit({ owner: authorId, head, edit });
    const post = built.object;

    const hasNewFiles = fileAttachments != null && fileAttachments.length > 0;
    const rollbackUploadedFiles = () =>
      this.rollbackUploadedFiles({
        fileAttachments: hasNewFiles ? fileAttachments : [],
        compositePostId,
        operation: 'commitEdit',
      });

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

    const nextKind = toLocalPostKind(post.kind);
    try {
      await LocalPostService.edit({
        compositePostId,
        content: post.content,
        attachments: post.attachments.length > 0 ? post.attachments.map((attachment) => attachment.uri) : null,
        kind: nextKind,
      });
    } catch (error) {
      // Local write failed after the uploads — remove them or they orphan
      await rollbackUploadedFiles();
      throw error;
    }

    try {
      await HomeserverService.putBlob({ url: built.url, blob: built.body });
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
      await FileApplication.commitDelete(deletableRemovedUris, compositePostId).catch((cleanupError) => {
        Logger.warn('[PostApplication.commitEdit] Failed to cleanup removed attachments', {
          compositePostId,
          removedUris: deletableRemovedUris,
          cleanupError,
        });
      });
    }
  }

  /** The URLs of every stored version of the author's post under both v1 roots, as a LIST gives them. */
  private static async listVersions(
    authorId: string,
    postId: string,
  ): Promise<{ url: UrlArg<'post'>; editId: string; copy: StoredCopy }[]> {
    const [publicUrls, privateUrls] = await Promise.all(
      (['public', 'private'] as const).map((root) =>
        HomeserverService.listAll({ baseDirectory: `${listPrefix(authorId, root)}posts/${postId}/` }),
      ),
    );
    return [
      ...publicUrls.map((url) => ({ url, root: 'public' as const })),
      ...privateUrls.map((url) => ({ url, root: 'private' as const })),
    ].flatMap(({ url, root }) => {
      // A file name that is no canonical version URL is skipped
      if (!isPubkyUrlString(url)) return [];
      let parsed: ReturnType<typeof parseUri>;
      try {
        parsed = parseUri(url);
      } catch {
        return [];
      }
      if (parsed.kind !== 'post' || parsed.editId === undefined) return [];
      return [{ url, editId: parsed.editId, copy: { root, path: toPath(url) } }];
    });
  }

  /**
   * The newest public version of the author's post, read and decoded. A post that only has its 0.x
   * copy (an account that has not migrated) cannot be edited here: the package has no 0.x reader
   * to carry that copy forward.
   */
  private static async readHead(authorId: string, postId: string): Promise<TPostHead> {
    const versions = (await this.listVersions(authorId, postId)).filter(({ copy }) => copy.root === 'public');
    // Edit ids sort by the time they were minted, as plain strings.
    const head = versions.reduce<(typeof versions)[number] | null>(
      (newest, version) => (newest && newest.editId > version.editId ? newest : version),
      null,
    );
    if (!head) {
      throw Err.client(ClientErrorCode.NOT_FOUND, 'Post has no v1 version to edit', {
        service: ErrorService.Homeserver,
        operation: 'readHead',
        context: { authorId, postId },
      });
    }
    const post = decodeObject(head.url, await HomeserverService.getBytes(head.url), 'post');
    return { url: head.url, post };
  }

  /**
   * Deletes every copy of the author's post: the 0.x file when there is one, then each v1 version,
   * in the order `planDelete` gives so a reader never meets a dangling post.
   */
  private static async deleteEveryCopy(compositePostId: string): Promise<void> {
    const { pubky: authorId, id: postId } = parseCompositeId(compositePostId);
    const legacyUrl = `${listPrefix(authorId, 'legacy')}posts/${postId}`;
    const [versions, hasLegacy] = await Promise.all([
      this.listVersions(authorId, postId),
      HomeserverService.exists(legacyUrl),
    ]);
    const readable = await Promise.all(
      versions.map(async ({ url }): Promise<Post | null> => {
        const read = tryDecodeObject(url, await HomeserverService.getBytes(url), 'post');
        return read.ok ? read.value : null;
      }),
    );
    const plan = planDelete(authorId, {
      id: postId,
      legacyPaths: hasLegacy ? [parseOwnerPath(`/pub/pubky.app/posts/${postId}`)] : null,
      copies: versions.map(({ copy }) => copy),
      versions: readable.filter((version): version is Post => version !== null),
    });
    for (const path of plan.deletes) await HomeserverService.deleteIdempotent(ownerPathToUrl(authorId, path));
  }
}

/** A LIST entry spelled as a URL, typed so the package takes it as one. */
function isPubkyUrlString(url: string): url is `pubky://${string}` {
  return url.startsWith('pubky://');
}
