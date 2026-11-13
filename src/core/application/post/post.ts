import { buildUri, decodeObject, deletionPaths, listPrefix, toPath, toUrl } from 'pubky-social-specs';
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
import type { Pubky } from '@/models/models.types';
import { parseCompositeId } from '@/models/models.utils';
import type { CollectionPost, TAuthoredCollectionsParams } from '@/models/post/collection/collectionPost.types';
import type { PostCountsModelSchema } from '@/models/post/counts/postCounts.schema';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import type { PostRelationshipsModelSchema } from '@/models/post/relationships/postRelationships.schema';
import { buildAuthorCollectionsStreamId } from '@/models/stream/post/postStream.types';
import type { TFileAttachmentResult } from '@/pipes/file/file.types';
import { CollectionPostContent } from '@/pipes/post/post.collection';
import { pickHeadVersion, pickPostVersions } from '@/pipes/post/post.head';
import { toLocalPostKind } from '@/pipes/post/post.kind';
import { PostNormalizer, type TPostHead } from '@/pipes/post/post.normalizer';
import { postReferenceSpellings } from '@/pipes/post/post.reference';
import { toSpecsValidationError } from '@/pipes/specs.errors';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { retryHomeserverWriteAfterReread, type THomeserverWriteFence } from '@/services/homeserver/write-retry';
import { LocalPostService } from '@/services/local/post/post';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import type { NexusTaggers } from '@/services/nexus/nexus.types';
import { NexusPostService } from '@/services/nexus/post/post';
import type { TCompositeId } from '@/services/nexus/post/post.types';
import { awaitBounded } from '@/utils/bounded-read';
import { withSyncLock } from '@/utils/sync-lock';

/**
 * One post's write lock (`withSyncLock`), held `exclusive` by `commitCreate` (from the local row through the
 * first PUT), `commitEdit` and `commitDelete`, and shared by every tab of the app (a queue in the tab where
 * Web Locks are unavailable), so writes to one post run one after another: an edit checks the tombstone,
 * uploads, projects, reads the head and PUTs under it, and a delete tombstones, lists and DELETEs under it,
 * so an edit that starts after a delete finds the tombstone and writes nothing, and a delete that starts
 * during a create's or an edit's PUT lists the post's directory after that PUT and deletes the version too.
 * Keyed by the raw post id, which both URI spellings share. Nothing under it takes another lock or calls back
 * into `PostApplication` (an exclusive Web Lock does not re-enter): the media collection a delete ends with,
 * `onPostSynced` and the tag writes run after it is released. Writes from another device are not ordered:
 * Nexus follows event order (ADR-0027).
 */
const postWriteLock = (owner: Pubky, postId: string) => `pubky-post-write:${owner}:${postId}`;

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
   * The post's own row is no referencer: a failed create tombstones it with its `attachments`
   * intact (the very URIs swept here), and a failed edit restores the row the edit started from,
   * which names nothing this batch put on the homeserver.
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
    await FileApplication.commitDeleteUploaded(fileAttachments, compositePostId).catch((fileRollbackError) => {
      Logger.error(`[PostApplication.${operation}] Failed to rollback file attachments`, {
        compositePostId,
        fileRollbackError,
      });
    });
  }

  /**
   * Creates a post: uploads first (the post references them), then, under the post's write lock
   * (`postWriteLock`), the local row and the first version PUT at the URL `buildPost` named. The
   * local row holds the versionless v1 reference as its `uri`; a failed PUT tombstones the row
   * again and sweeps the uploads. The lock keeps a delete that starts during the PUT (a 429
   * back-off can hold it for 30 s) from tombstoning the row, listing an empty directory and
   * reporting the post deleted before the version lands: it waits, then lists and deletes it. The
   * uploads stay outside the lock, since no delete can target a post that has no row yet;
   * `onPostSynced` runs once the post is on the homeserver, before its tags are written, both
   * after the lock is released.
   */
  static async commitCreate({
    compositePostId,
    post,
    fileAttachments,
    tags,
    isCurrent,
    onPostSynced,
  }: TCreatePostInput) {
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

    const { pubky: owner, id: postId } = parseCompositeId(compositePostId);
    await withSyncLock(postWriteLock(owner, postId), 'exclusive', async () => {
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
    });
    onPostSynced?.();

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
   * is logged: `legacyRefused`). Nexus deletes the logical post on any version's DELETE. A listed
   * entry that is no post version (a foreign file in the directory) is left alone, as every reader
   * of the directory skips it: `deletionPaths` would refuse it after the row is tombstoned.
   *
   * The post's write lock (`postWriteLock`) is held from the local read through the last DELETE,
   * so the listing runs after an earlier edit's PUT in any tab and names the version it wrote, and
   * an edit queued behind the delete finds the tombstone. The listings are bounded by
   * `HOMESERVER_SYNC_READ_TIMEOUT_MS` (`awaitBounded`): a LIST that never answers rejects with
   * `REQUEST_TIMEOUT` before any DELETE, like a failed LIST (the row stays tombstoned locally and
   * the delete reports its failure), and releases the lock. A fence taken before the wait for the
   * lock guards its first pass, checked once the lock is held: a delete that waited across a
   * logout, an account change or a session replacement tombstones nothing and sends nothing
   * (`SESSION_EXPIRED`). `deleteIdempotent` takes no fence, so that check is the guard.
   *
   * Media: after the homeserver DELETEs succeed, and after the lock is released, the post's
   * attachments (only when the row did not keep its connections, `!hadConnections`) and its
   * homeserver file cover (`cover_image` lives in the content envelope; collected either way, the
   * envelope is tombstoned) go to `FileApplication.commitDelete`, which deletes a file only once
   * the local cache, the published profile and Nexus all say nothing else of the owner references
   * it (content-addressed media is shared). Best-effort: a failure is logged and swallowed so it
   * does not fail an already-successful post delete. External http(s) covers are never deleted.
   */
  static async commitDelete({ compositePostId, canWriteLegacy }: TDeletePostInput) {
    const { pubky: owner, id: postId } = parseCompositeId(compositePostId);
    const fence = HomeserverService.createWriteFence({ guardFirstPass: true });
    const mediaUris = await withSyncLock(postWriteLock(owner, postId), 'exclusive', () =>
      this.commitDeleteUnderLock({ compositePostId, canWriteLegacy }, { owner, postId, fence }),
    );

    // Best-effort, in one pass so the reference checks run once: the post delete already
    // succeeded on the homeserver, so a file-cleanup failure must not surface as a delete failure.
    if (mediaUris.length > 0) {
      await FileApplication.commitDelete(mediaUris, compositePostId).catch((cleanupError) => {
        Logger.warn('[PostApplication.commitDelete] Failed to cleanup post media', {
          compositePostId,
          mediaUris,
          cleanupError,
        });
      });
    }
  }

  /**
   * The tombstone, the listings and the DELETEs of `commitDelete`, under the post's write lock.
   * Returns the media URIs the post held, for the collection that runs once the lock is released.
   */
  private static async commitDeleteUnderLock(
    { compositePostId, canWriteLegacy }: TDeletePostInput,
    { owner, postId, fence }: { owner: Pubky; postId: string; fence: THomeserverWriteFence },
  ): Promise<string[]> {
    // The session this delete was asked under may have ended while it waited for the lock.
    fence.assertCurrent();
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
    const legacyUrl = `${listPrefix(owner, 'legacy')}posts/${postId}`;
    // One bound over the three reads: past it the delete fails before any DELETE and releases the lock.
    const [publicCopies, privateCopies, legacyExists] = await awaitBounded(
      Promise.all([
        HomeserverService.listAll({ baseDirectory: `${buildUri(owner, 'post', postId)}/` }),
        HomeserverService.listAll({ baseDirectory: `${listPrefix(owner, 'private')}posts/${postId}/` }),
        HomeserverService.exists(legacyUrl),
      ]),
      { operation: 'commitDelete', context: { compositePostId } },
    );
    if (legacyExists && !canWriteLegacy) {
      Logger.warn('[PostApplication.commitDelete] The 0.x copy stays: the grant cannot write the 0.x tree', {
        compositePostId,
      });
    }
    const listings = [
      ...(legacyExists && canWriteLegacy ? [toPath(legacyUrl)] : []),
      ...pickPostVersions([...publicCopies, ...privateCopies]).map((url) => toPath(url)),
    ];
    for (const path of this.deletionPaths(postId, listings)) {
      await HomeserverService.deleteIdempotent(toUrl(owner, path));
    }

    return [
      ...(!hadConnections && post.attachments ? post.attachments : []),
      ...(isHomeserverFileUri(coverUri) ? [coverUri] : []),
    ];
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
   *    was and the uploads are swept. Media the edit removed (an attachment, an article's or a
   *    collection's cover) is never deleted: the earlier versions still reference it, and content
   *    addressing lets other objects share it.
   *
   * All of it runs under the post's write lock (`postWriteLock`), the uploads included, so an edit
   * queued behind a delete of the post in any tab finds the tombstone and writes nothing, and a
   * delete queued behind the edit lists the version it PUT. The fence is taken before the wait for
   * the lock and guards its first pass, which is checked once the lock is held and again before
   * the PUT: an edit that waited across a logout, an account change or a session replacement
   * writes nothing, not an upload or the projection (`SESSION_EXPIRED`), and one whose session
   * changes during its uploads PUTs nothing and rolls back (the sweep of its uploads is
   * best-effort: after a logout or an account switch it cannot reach the old account's files). The
   * head read is bounded
   * by `HOMESERVER_SYNC_READ_TIMEOUT_MS`: past it the edit fails like a failed read (rollback, the
   * uploads swept) and releases the lock.
   *
   * A post with no v1 version (one the migration skipped) cannot be edited: `NOT_FOUND`.
   */
  static async commitEdit(input: TEditPostInput) {
    const { pubky: owner, id: postId } = parseCompositeId(input.compositePostId);
    const fence = HomeserverService.createWriteFence({ guardFirstPass: true });
    return withSyncLock(postWriteLock(owner, postId), 'exclusive', () =>
      this.commitEditUnderLock(input, { owner, postId, fence }),
    );
  }

  private static async commitEditUnderLock(
    { compositePostId, edit, fileAttachments }: TEditPostInput,
    { owner, postId, fence }: { owner: Pubky; postId: string; fence: THomeserverWriteFence },
  ) {
    // The session this edit was asked under may have ended while it waited for the lock.
    fence.assertCurrent();
    const originalPost = await LocalPostService.readDetails({ postId: compositePostId });
    // A tombstone (the Nexus `deleted` flag, or the legacy `[DELETED]` content) is not-found: a
    // projection onto it would build the next version from the tombstone's content. Checked under
    // the lock, so a delete that ran while this edit waited is seen.
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
      built = await retryHomeserverWriteAfterReread(fence, async () => {
        // One bound over the LIST and the GET: a `REQUEST_TIMEOUT` carries no status, so the pass is
        // not retried, the rollback below runs, and nothing the abandoned read answers late is built.
        const head = await awaitBounded(this.readHead(owner, postId), {
          operation: 'commitEdit',
          context: { compositePostId },
        });
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
  }

  /**
   * The newest public version of the author's post, read and decoded: a LIST of the post's
   * directory, the version with the highest edit id, its bytes. A post with no v1 version (an
   * account's post the migration skipped) cannot be edited here. A version file is immutable,
   * so a cached GET is as good as a fresh one. The caller bounds it (`awaitBounded`): it runs
   * under the post's write lock.
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
