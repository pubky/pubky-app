import { buildUri, decodeObject, deletionPaths, listPrefix, toPath, toUrl, tryDecodeContent } from 'pubky-social-specs';
import { FileApplication } from '@/application/file/file';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import type {
  TCreatePostInput,
  TDeletePostInput,
  TEditPostInput,
  TGetDetailsByIdsParams,
  TGetOrFetchPostParams,
  TGetRelationshipsByIdsParams,
} from '@/application/post/post.types';
import { PostStreamApplication } from '@/application/stream/posts/post';
import { TagApplication } from '@/application/tag/tag';
import { NEXUS_STREAM_MAX_LIMIT } from '@/config/nexus';
import { ModerationController } from '@/controllers/moderation/moderation';
import type { TFetchPostTaggersParams } from '@/controllers/post/post.types';
import { NOT_FOUND_CACHED_STREAM, SKIP_FETCH_NEW_POSTS } from '@/controllers/stream/posts/post.constants';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isHomeserverFileUri } from '@/libs/file/homeserverFileUri';
import { Logger } from '@/libs/logger/logger';
import { parseArticleContent } from '@/libs/post/articleContent';
import { isPostDeleted } from '@/libs/utils/utils';
import { parseCompositeId } from '@/models/models.utils';
import type { CollectionPost, TAuthoredCollectionsParams } from '@/models/post/collection/collectionPost.types';
import type { PostCountsModelSchema } from '@/models/post/counts/postCounts.schema';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import type { PostRelationshipsModelSchema } from '@/models/post/relationships/postRelationships.schema';
import { buildAuthorCollectionsStreamId } from '@/models/stream/post/postStream.types';
import type { TFileAttachmentResult } from '@/pipes/file/file.types';
import { CollectionPostContent } from '@/pipes/post/post.collection';
import { pickHeadVersion } from '@/pipes/post/post.head';
import { toLocalPostKind } from '@/pipes/post/post.kind';
import { PostNormalizer, type TPostHead } from '@/pipes/post/post.normalizer';
import { postReferenceSpellings } from '@/pipes/post/post.reference';
import { toSpecsValidationError } from '@/pipes/specs.errors';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { retryHomeserverWriteAfterReread } from '@/services/homeserver/write-retry';
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
    // A reply's `replied` is the parent's stored address: Nexus serves the 0.x spelling for a
    // reply written before the parent's author migrated, so a thread needs both.
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
   * Rolls freshly uploaded files back after a failed create or edit: the files this write put on
   * the homeserver, never one it found there already (content-addressed media may be shared).
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

  /**
   * Creates a post: uploads first (the post references them), then the local row, then the
   * first version PUT at the URL `buildPost` named. The local row holds the versionless v1
   * reference as its `uri`; a failed PUT tombstones the row again and sweeps the uploads.
   */
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
   * A v1 post is a directory of versions, and a migrated one also has its 0.x copy: every copy
   * is deleted, in the order `deletionPaths` gives (the 0.x copy first, then each version oldest
   * first, public before private), one DELETE at a time, so a reader never sees a dangling
   * post. The copies come from a LIST of both roots; the 0.x copy from a GET, and only when the
   * grant can write the 0.x tree (a Ring session without `/pub/pubky.app/:rw` leaves it, which
   * is logged: `legacyRefused`). Nexus deletes the logical post on any version's DELETE.
   *
   * Collection and article covers: `cover_image` lives in the content envelope, not
   * `post.attachments`. After the homeserver DELETEs succeed, if the post had a homeserver file
   * cover, that file is deleted too — including when the local row is soft-deleted
   * (`hadConnections`), because the envelope is tombstoned either way and no longer references
   * the file. Failures during cover delete are logged and swallowed so they do not fail an
   * already-successful post delete. External http(s) covers are never deleted.
   *
   * Regular attachment cleanup still runs only when `!hadConnections`, and is likewise
   * best-effort. Both skip media another cached post still references.
   */
  static async commitDelete({ compositePostId, canWriteLegacy }: TDeletePostInput) {
    const post = await PostDetailsModel.findById(compositePostId);

    if (!post) {
      throw Err.client(ClientErrorCode.NOT_FOUND, 'Post not found', {
        service: ErrorService.Local,
        operation: 'commitDelete',
        context: { compositePostId },
      });
    }

    // Capture the cover before local delete tombstones content to `[DELETED]`.
    const coverUri =
      post.kind === 'collection'
        ? CollectionPostContent.parse(post.content)?.cover_image
        : post.kind === 'long'
          ? (parseArticleContent(post.content)?.cover_image ?? undefined)
          : undefined;

    const hadConnections = await LocalPostService.delete({ compositePostId });

    // Always delete from homeserver, even if the post had connections (soft delete).
    // Nexus will determine the definitive state based on graph state.
    const { pubky: owner, id: postId } = parseCompositeId(compositePostId);
    const legacyUrl = `${listPrefix(owner, 'legacy')}posts/${postId}`;
    const [publicCopies, privateCopies, legacyExists] = await Promise.all([
      HomeserverService.listAll({ baseDirectory: `${buildUri(owner, 'post', postId)}/` }),
      HomeserverService.listAll({ baseDirectory: `${listPrefix(owner, 'private')}posts/${postId}/` }),
      HomeserverService.exists(legacyUrl),
    ]);
    if (legacyExists && !canWriteLegacy) {
      Logger.warn('[PostApplication.commitDelete] The 0.x copy stays: the grant cannot write the 0.x tree', {
        compositePostId,
      });
    }
    const listings = [
      ...(legacyExists && canWriteLegacy ? [toPath(legacyUrl)] : []),
      ...[...publicCopies, ...privateCopies].map((url) => toPath(url)),
    ];
    for (const path of this.deletionPaths(postId, listings)) {
      await HomeserverService.deleteIdempotent(toUrl(owner, path));
    }

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
    if (isHomeserverFileUri(coverUri)) {
      await FileApplication.commitDelete([coverUri], compositePostId).catch((cleanupError) => {
        Logger.warn('[PostApplication.commitDelete] Failed to cleanup cover', {
          compositePostId,
          coverUri,
          cleanupError,
        });
      });
    }
  }

  /** The paths `deletionPaths` gives, its refusal of a listing wrapped as a validation error. */
  private static deletionPaths(postId: string, listings: string[]): string[] {
    try {
      return deletionPaths({ kind: 'post', id: postId, listings });
    } catch (error) {
      throw toSpecsValidationError(error, 'deletionPaths', { postId });
    }
  }

  /**
   * Edit a post, local-first, as a new version (ADR-0027).
   *
   * 1. New uploads go up first, so the edited post never references files that do not exist
   *    yet; they are deleted again if the edit fails.
   * 2. The edit is projected onto the cached row (`PostNormalizer.toLocalEdit`), so the UI shows
   *    it at once and offline behaves as it always did.
   * 3. Inside a write fence, the newest stored version is read (LIST, pick the head, GET,
   *    decode), the edit is applied to it (`PostNormalizer.toEdit`: the lock, kept attachments'
   *    alt text, an article's cover, item notes and unknown members are carried over), and the
   *    next version is PUT at its own URL. A refusal the write policy retries runs the read
   *    again; the body is never replayed from a stale read.
   * 4. The local row converges to the version that was PUT; on failure it goes back to what it
   *    was and the uploads are swept. `removedUris` are deleted only after success, best-effort.
   *
   * A post with no v1 version (one the migration skipped) cannot be edited: `NOT_FOUND`.
   */
  static async commitEdit({ compositePostId, edit, fileAttachments, removedUris }: TEditPostInput) {
    const { pubky: owner, id: postId } = parseCompositeId(compositePostId);
    const originalPost = await LocalPostService.readDetails({ postId: compositePostId });
    // A tombstone (the Nexus `deleted` flag, or the legacy `[DELETED]` content) is not-found: a
    // projection onto it would build the next version from the tombstone's content.
    if (!originalPost || isPostDeleted(originalPost)) {
      throw Err.client(ClientErrorCode.NOT_FOUND, 'Post not found', {
        service: ErrorService.Local,
        operation: 'commitEdit',
        context: { compositePostId },
      });
    }

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

    try {
      await LocalPostService.edit({ compositePostId, ...PostNormalizer.toLocalEdit({ row: originalPost, edit }) });
    } catch (error) {
      // Local write failed after the uploads — remove them or they orphan
      await rollbackUploadedFiles();
      throw error;
    }

    let built: Awaited<ReturnType<typeof PostNormalizer.toEdit>>;
    try {
      const fence = HomeserverService.createWriteFence();
      built = await retryHomeserverWriteAfterReread(fence, async () => {
        const head = await this.readHead(owner, postId);
        const next = PostNormalizer.toEdit({ owner, head, edit });
        await HomeserverService.putBlob({ url: next.url, blob: next.body, fence });
        return next;
      });
    } catch (error) {
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

      await rollbackUploadedFiles();

      throw error;
    }

    // Converge the row to the version that was PUT: the head may have carried members the
    // projection could not know (another device's edit), and the envelope is spelled by the package.
    const nextKind = toLocalPostKind(built.object.kind);
    try {
      await LocalPostService.edit({
        compositePostId,
        content: built.object.content,
        attachments: built.object.attachments.length > 0 ? built.object.attachments.map(({ uri }) => uri) : null,
        kind: nextKind,
      });
    } catch (convergeError) {
      Logger.warn('[PostApplication.commitEdit] Failed to converge the local row to the stored version', {
        compositePostId,
        convergeError,
      });
    }

    // A kind change strands the post in the old kind's filtered streams —
    // permanently, since stream persistence only merges and never evicts.
    // Remove it from every cached old-kind stream after the edit is fully
    // committed (best-effort); runs after the PUT so a failed edit never
    // touches stream membership.
    if (originalPost.kind !== nextKind) {
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

    // Media is content addressed: a file removed and added again, or a cover picked again, names
    // the URI the version just written references. Nothing it references is deleted.
    const referencedByNext = new Set(built.object.attachments.map(({ uri }) => uri));
    const nextEnvelope = tryDecodeContent(built.object);
    if (nextEnvelope.ok && nextEnvelope.value?.content.cover_image) {
      referencedByNext.add(nextEnvelope.value.content.cover_image);
    }
    const deletableRemovedUris =
      removedUris?.filter((uri) => isHomeserverFileUri(uri) && !referencedByNext.has(uri)) ?? [];
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

  /**
   * The newest public version of the author's post, read and decoded: a LIST of the post's
   * directory, the version with the highest edit id, its bytes. A post with no v1 version (an
   * account's post the migration skipped) cannot be edited here. A version file is immutable,
   * so a cached GET is as good as a fresh one.
   */
  private static async readHead(owner: string, postId: string): Promise<TPostHead> {
    const urls = await HomeserverService.listAll({ baseDirectory: `${buildUri(owner, 'post', postId)}/` });
    const url = pickHeadVersion(urls);
    if (!url) {
      throw Err.client(ClientErrorCode.NOT_FOUND, 'Post has no v1 version to edit', {
        service: ErrorService.Homeserver,
        operation: 'readHead',
        context: { owner, postId },
      });
    }
    const bytes = await HomeserverService.getBytes(url);
    try {
      return { url, post: decodeObject(url, bytes, 'post') };
    } catch (error) {
      throw toSpecsValidationError(error, 'readHead', { owner, postId, url });
    }
  }
}
