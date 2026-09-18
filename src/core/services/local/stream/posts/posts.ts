import { detectModerationFromTags } from '@/application/moderation/moderation.utils';
import { FORCE_FETCH_NEW_POSTS, SKIP_FETCH_NEW_POSTS } from '@/controllers/stream/posts/post.constants';
import type { TStreamIdParams } from '@/controllers/stream/posts/posts.types';
import { db } from '@/database/franky/franky';
import { Logger } from '@/libs/logger/logger';
import { BookmarkModel } from '@/models/bookmark/bookmark';
import type { BookmarkModelSchema } from '@/models/bookmark/bookmark.schema';
import { CompositeIdDomain } from '@/models/models.types';
import { buildCompositeId, buildCompositeIdFromPubkyUri } from '@/models/models.utils';
import { ModerationModel } from '@/models/moderation/moderation';
import { type ModerationModelSchema, ModerationType } from '@/models/moderation/moderation.schema';
import { PostCountsModel } from '@/models/post/counts/postCounts';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import { DELETED } from '@/models/post/details/postDetails.constants';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import { PostRelationshipsModel } from '@/models/post/relationships/postRelationships';
import { PostTagsModel } from '@/models/post/tags/postTags';
import { PostTtlModel } from '@/models/post/ttl/postTtl';
import type { NexusModelTuple } from '@/models/shared/base/tuple/baseTuple.type';
import {
  buildPostReplyStreamId,
  type PostStreamId,
  type ReplyStreamCompositeId,
} from '@/models/stream/post/postStream.types';
import { PostStreamModel } from '@/models/stream/post/tables/postStream';
import { UnreadPostStreamModel } from '@/models/stream/post/tables/postStream.unread';
import type {
  TAddReplyToStreamParams,
  TAlignPageParams,
  TPersistPostsParams,
  TPostDetailsTimestampParams,
  TPostStreamBulkParams,
  TPostStreamUpsertParams,
  TPrependToStreamParams,
  TStreamResult,
} from '@/services/local/stream/posts/post.types';
import { LocalTagCacheService, type TagPreviewGuard } from '@/services/local/tag/tag-cache';
import type { NexusPostCounts, NexusPostRelationships, NexusTag } from '@/services/nexus/nexus.types';
import { getNexusResponseStartedAt } from '@/services/nexus/nexus.utils';
import { StreamSource } from '@/services/nexus/stream/posts/postStream.types';
import { sortPostIdsByTimestamp } from '@/utils/sorting';

/**
 * Local Stream Posts Service
 *
 * Simple service to manage post stream IDs in IndexDB.
 * Only stores arrays of post IDs, no post data or user data.
 */
export class LocalStreamPostsService {
  private constructor() {}

  static async readUnreadStream({ streamId }: TStreamIdParams): Promise<TStreamResult | null> {
    return await UnreadPostStreamModel.findById(streamId);
  }

  /**
   * Save or update a stream of post IDs
   */
  static async upsert({ streamId, stream, tailCursor }: TPostStreamUpsertParams): Promise<void> {
    await PostStreamModel.upsert(streamId, stream, this.tailCursorFields(tailCursor));
  }

  /**
   *
   * @param postStreams - Array of post streams to upsert
   */
  static async bulkSave({ postStreams }: TPostStreamBulkParams): Promise<void> {
    await Promise.all(postStreams.map((postStream) => this.upsert(postStream)));
  }

  /**
   * Get a stream of post IDs by stream ID
   */
  static async read({ streamId }: TStreamIdParams): Promise<TStreamResult | null> {
    return await PostStreamModel.findById(streamId);
  }

  /**
   * Delete a stream from cache
   */
  static async deleteById({ streamId }: TStreamIdParams): Promise<void> {
    await PostStreamModel.deleteById(streamId);
  }

  /**
   * Gets the timestamp of the head (first/most recent) post in a stream
   * First tries from the unread post stream, if not found, tries from the post stream
   * @param streamId - The stream ID to get the head timestamp for
   * @returns The indexed_at timestamp of the head post, or 1 if the stream is empty or head post not found
   * 1 means that there is no posts in the cache but force to fetch from Nexus new posts
   * 0 means that there is no posts in the cache and no need to fetch from Nexus new posts
   */
  static async getStreamHead({ streamId }: TStreamIdParams): Promise<number> {
    const unreadCompositePostId = await UnreadPostStreamModel.getStreamHead(streamId);
    if (unreadCompositePostId) {
      return await this.getPostDetailsTimestamp({ postCompositeId: unreadCompositePostId as string });
    }
    const postCompositeId = await PostStreamModel.getStreamHead(streamId);
    if (!postCompositeId) {
      // It might be a case that the stream that we want to update still does not have any posts in the cache
      // so we return 1 to indicate that there is no posts in the cache but force to fetch from Nexus new posts
      return FORCE_FETCH_NEW_POSTS;
    }
    return await this.getPostDetailsTimestamp({ postCompositeId: postCompositeId as string });
  }

  /**
   * Get the timestamp of the post
   * @param postCompositeId - The composite post ID to get the timestamp for
   * @returns The indexed_at timestamp of the post, or 0 if the post is not found in the cache
   */
  private static async getPostDetailsTimestamp({ postCompositeId }: TPostDetailsTimestampParams): Promise<number> {
    const postDetails = await PostDetailsModel.findById(postCompositeId);
    if (postDetails) {
      return postDetails.indexed_at;
    }
    // Avoid fetching till we have persited the missing post in the cache
    Logger.debug('Post not found in cache, avoiding fetch', { postCompositeId });
    return SKIP_FETCH_NEW_POSTS;
  }

  /**
   * Prepend a post ID to a stream
   * Only adds if not already present
   *
   * @param streamId - The stream to prepend to
   * @param compositePostId - The composite post ID to prepend
   */
  static async prependToStream({ streamId, compositePostId }: TPrependToStreamParams): Promise<void> {
    const existing = await this.read({ streamId });
    const currentStream = existing?.stream || [];

    if (currentStream.includes(compositePostId)) return;

    const updatedStream = [compositePostId, ...currentStream];
    // A resume cursor only describes the ids it was fetched with: an emptied row must not
    // hand its old deep cursor to the ids that start it again.
    const tailCursor = currentStream.length > 0 ? existing?.tailCursor : undefined;
    await this.upsert({ streamId, stream: updatedStream, tailCursor });
  }

  /**
   * Remove a post ID from a stream
   *
   * @param streamId - The stream to remove from
   * @param compositePostId - The composite post ID to remove
   */
  static async removeFromStream({ streamId, compositePostId }: TPrependToStreamParams): Promise<void> {
    const existing = await this.read({ streamId });
    if (!existing) return;

    const updatedStream = existing.stream.filter((id) => id !== compositePostId);
    // Removing the last id leaves nothing the cursor describes; drop it with the ids.
    const tailCursor = updatedStream.length > 0 ? existing.tailCursor : undefined;
    await this.upsert({ streamId, stream: updatedStream, tailCursor });
  }

  static async getNotPersistedPostsInCache(postIds: string[]): Promise<string[]> {
    const existingPostIds = await PostDetailsModel.findByIdsPreserveOrder(postIds);
    return postIds.filter((_postId, index) => existingPostIds[index] === undefined);
  }

  /**
   * Adds a reply post to the post replies map if the post is a reply
   *
   * @param repliedUri - The URI of the parent post being replied to (optional)
   * @param replyPostId - The composite post ID of the reply post
   * @param postReplies - The map of reply stream IDs to arrays of reply post IDs
   */
  private static addReplyToStream({ repliedUri, replyPostId, postReplies }: TAddReplyToStreamParams): void {
    if (!repliedUri) return;

    const parentCompositePostId = buildCompositeIdFromPubkyUri({
      uri: repliedUri,
      domain: CompositeIdDomain.POSTS,
    });
    if (!parentCompositePostId) return;

    const replyStreamId = buildPostReplyStreamId(parentCompositePostId);
    postReplies[replyStreamId] = [...(postReplies[replyStreamId] || []), replyPostId];
  }

  /**
   * Merge the unread stream with the post stream, sorted by timestamp.
   * Filters out deleted posts from unread stream before merging.
   * @param streamId - The stream ID to merge the unread stream with the post stream
   * @returns void
   */
  static async mergeUnreadStreamWithPostStream({ streamId }: TStreamIdParams): Promise<void> {
    const unreadPostStream = await UnreadPostStreamModel.findById(streamId);
    if (!unreadPostStream) return;
    const postStream = await PostStreamModel.findById(streamId);
    if (!postStream) return;

    // Filter out deleted posts from unread stream before merging
    const validUnreadPosts = await PostDetailsModel.filterDeleted(unreadPostStream.stream);

    // An id both rows hold takes the unread position: a locally created post that a poll
    // returned is at the head either way.
    const unreadIds = new Set(validUnreadPosts);
    const rest = postStream.stream.filter((id) => !unreadIds.has(id));

    // Both parts are already in stream order: every head poll prepends a Nexus page that is
    // newer than the previous one, and the cached row keeps the order its pages arrived in.
    // Nothing is re-sorted by indexed_at — that would float an edited or deleted post above
    // its real position (#2523), and an edited row head promoted above the polled posts
    // would then feed its bumped indexed_at to the next head poll. The one cost is an own
    // post written after the poll: it sits below the polled posts until the next poll returns
    // it, at which point it takes the unread slot. The tail's resume cursor is untouched.
    const combinedStream = [...validUnreadPosts, ...rest];

    await PostStreamModel.upsert(streamId, combinedStream, this.tailCursorFields(postStream.tailCursor));
  }

  /**
   * Clear the unread stream and return the post IDs that were in it
   * @param streamId - The stream ID to clear the unread stream for
   * @returns Array of post IDs that were in the unread stream
   */
  static async clearUnreadStream({ streamId }: TStreamIdParams): Promise<string[]> {
    const unreadStream = await UnreadPostStreamModel.findById(streamId);
    if (!unreadStream) return [];
    const postIds = unreadStream.stream;
    await UnreadPostStreamModel.deleteById(streamId);
    return postIds;
  }

  /**
   * Persist posts from Nexus API to local IndexedDB
   *
   * Processes an array of Nexus posts and saves them to the local database.
   * For each post, it extracts and persists:
   * - Post details (with composite ID: author:postId)
   * - Post counts (likes, replies, etc.)
   * - Post relationships (replies, reposts, etc.)
   * - Post tags
   *
   * Additionally, creates reply streams for posts that are replies to other posts,
   * mapping parent posts to their reply post IDs.
   *
   * @param posts - Array of posts from Nexus API to persist
   */
  static async persistPosts({
    posts,
    refreshGuard,
    tagGuard = {},
  }: TPersistPostsParams & { tagGuard?: TagPreviewGuard }): Promise<void> {
    tagGuard = { ...tagGuard, validatedAt: tagGuard.validatedAt ?? getNexusResponseStartedAt(posts) };
    // Defensive check: if posts is empty or undefined, return early
    if (!posts?.length) return;

    const postCounts: NexusModelTuple<NexusPostCounts>[] = [];
    const postRelationships: NexusModelTuple<NexusPostRelationships>[] = [];
    const postTags: NexusModelTuple<NexusTag[]>[] = [];
    const postDetails: PostDetailsModelSchema[] = [];
    const postBookmarks: BookmarkModelSchema[] = [];
    const postModerations: ModerationModelSchema[] = [];
    const postTtl: NexusModelTuple<{ lastUpdatedAt: number }>[] = [];

    const postReplies: Record<ReplyStreamCompositeId, string[]> = {};
    const now = Date.now();

    for (const post of posts) {
      // Build composite ID to ensure uniqueness (authorId:postId)
      const postId = buildCompositeId({ pubky: post.details.author, id: post.details.id });

      postCounts.push([postId, post.counts]);

      postRelationships.push([postId, post.relationships]);

      // Collect bookmarks from Nexus response (viewer's bookmark status).
      //
      // Nexus returns `bookmark: { id, indexed_at }` (see
      // `NexusBookmark`). We mirror that into our local `bookmarks` table
      // using `indexed_at` as the `created_at` sort key.
      //
      // The `?? indexed_at ?? now` fallback chain exists because
      // `created_at` is indexed on the table and IndexedDB silently drops
      // rows with `undefined` indexed keys from index-cursor reads
      // (e.g. `orderBy('created_at')`). A single bad write would make the
      // row invisible to FollowedCollections — keep the chain defensive
      // against any future Nexus shape drift.
      if (post.bookmark) {
        const bookmarkCreatedAt =
          typeof post.bookmark.indexed_at === 'number' ? post.bookmark.indexed_at : (post.details.indexed_at ?? now);
        postBookmarks.push({
          id: postId,
          created_at: bookmarkCreatedAt,
        });
      }

      // Convert TagModel[] to NexusTag[] by accessing the data property
      const nexusTags = post.tags.map((tag) => ({
        label: tag.label,
        taggers: tag.taggers,
        taggers_count: tag.taggers_count,
        relationship: tag.relationship,
      }));
      postTags.push([postId, nexusTags]);

      // Compute moderation and store if post is moderated
      const isModerated = detectModerationFromTags(nexusTags);
      if (isModerated) {
        postModerations.push({
          id: postId,
          type: ModerationType.POST,
          is_blurred: true,
          created_at: Date.now(),
        });
      }

      // Remove author from details as it's in the composite ID
      // eslint-disable-next-line
      const { author, ...detailsWithoutAuthor } = post.details;
      postDetails.push({ ...detailsWithoutAuthor, id: postId });

      // Record TTL for freshness tracking
      postTtl.push([postId, { lastUpdatedAt: now }]);

      // Add reply to the post replies map if this post is a reply
      this.addReplyToStream({ repliedUri: post.relationships.replied, replyPostId: postId, postReplies });
    }

    // Guards and writes run in ONE transaction so a local-first write cannot
    // land between the check and the bulk save.
    //
    // Tombstone guard. Defense-in-depth against a Nexus refetch racing a
    // local delete: if a row already has `content === DELETED`, do NOT
    // overwrite it with whatever Nexus is returning right now (the by-ids
    // endpoint can be stale relative to the delete index, see
    // `LocalPostService.delete`'s hard-delete branch). Tombstoned ids are
    // dropped from every per-table batch below so we don't leave behind
    // orphan counts / tags / relationships / bookmarks pointing at a
    // deleted post.
    //
    // Refresh guard (TTL path only). A local-first edit is newer than
    // anything Nexus can return until Nexus has re-indexed it, and the owner's
    // next edit reads the local row — clobbering it with an older copy would
    // then write that older state back to the homeserver. Keep the local
    // details when the row's TTL was written at or after the fetch started
    // (an edit landed while the fetch was in flight) or when the Nexus copy
    // is not indexed after the local one (Nexus has not caught up yet).
    // Counts, tags, relationships and the TTL still refresh for those rows.
    const detailIds = postDetails.map((d) => d.id);
    await db.transaction(
      'rw',
      [
        PostDetailsModel.table,
        PostCountsModel.table,
        PostTagsModel.table,
        PostRelationshipsModel.table,
        PostTtlModel.table,
        BookmarkModel.table,
        ModerationModel.table,
      ],
      async () => {
        const existingDetails = await PostDetailsModel.findByIdsPreserveOrder(detailIds);
        const existingTtl = refreshGuard ? await PostTtlModel.findByIds(detailIds) : [];
        const ttlById = new Map(existingTtl.map((record) => [record.id, record.lastUpdatedAt]));

        const tombstonedIds = new Set<string>();
        const locallyNewerIds = new Set<string>();
        existingDetails.forEach((existing, index) => {
          const incoming = postDetails[index];
          if (existing?.content === DELETED) {
            tombstonedIds.add(incoming.id);
            return;
          }
          if (!refreshGuard || !existing) return;
          const writtenSinceFetch = (ttlById.get(incoming.id) ?? 0) >= refreshGuard.fetchStartedAt;
          const notIndexedAfterLocal = incoming.indexed_at <= existing.indexed_at;
          if (writtenSinceFetch || notIndexedAfterLocal) locallyNewerIds.add(incoming.id);
        });
        if (locallyNewerIds.size > 0) {
          Logger.debug('LocalStreamPostsService: Kept locally newer post details during refresh', {
            ids: Array.from(locallyNewerIds).slice(0, 5),
            count: locallyNewerIds.size,
          });
        }

        const liveDetails = postDetails.filter((d) => !tombstonedIds.has(d.id) && !locallyNewerIds.has(d.id));
        const liveCounts = postCounts.filter(([id]) => !tombstonedIds.has(id));
        const liveRelationships = postRelationships.filter(([id]) => !tombstonedIds.has(id));
        const liveTags = postTags.filter(([id]) => !tombstonedIds.has(id));
        const liveTtl = postTtl.filter(([id]) => !tombstonedIds.has(id));
        const liveBookmarks = postBookmarks.filter((b) => !tombstonedIds.has(b.id));
        const liveModerations = postModerations.filter((m) => !tombstonedIds.has(m.id));

        if (tagGuard.isCurrent && !tagGuard.isCurrent()) return;
        await Promise.all([
          PostDetailsModel.bulkSave(liveDetails),
          // Tag previews and counts share one revision-guarded write; it joins this transaction.
          LocalTagCacheService.savePreviews('post', liveTags, tagGuard, liveCounts),
          PostRelationshipsModel.bulkSave(liveRelationships),
          PostTtlModel.bulkSave(liveTtl),
          // Persist bookmarks from Nexus (viewer's bookmark status for each post)
          liveBookmarks.length > 0 ? BookmarkModel.bulkSave(liveBookmarks) : Promise.resolve(),
          // Persist moderation records for moderated posts (is_blurred defaults to true)
          liveModerations.length > 0 ? ModerationModel.bulkSave(liveModerations) : Promise.resolve(),
        ]);
      },
    );

    if (Object.keys(postReplies).length > 0) {
      await Promise.all(
        Object.entries(postReplies).map(async ([parentCompositePostId, postIds]) => {
          await this.persistNewStreamChunk({
            streamId: parentCompositePostId as PostStreamId,
            stream: postIds,
          });
        }),
      );
    }
  }

  /**
   * Persist a new chunk of post IDs into a cached stream.
   *
   * Creates the stream when it does not exist yet. Otherwise merges the incoming
   * IDs with the existing stream and removes duplicates before saving.
   *
   * A descending Nexus page (`tailCursor` given) is appended in stream order and the
   * row's resume cursor advances to the deepest page fetched. Re-sorting such a page by
   * `indexed_at` would float edited and deleted posts above the raw resume anchor —
   * Nexus keeps them at their original position — and the next round would re-walk
   * ids it already delivered (#2523). Bookmark streams likewise preserve membership
   * order (bookmark time, not post time). Chunks that carry no Nexus position
   * (hydration-discovered replies, ascending reply pages) keep a row that has no cursor of
   * its own newest-first by post timestamp, at creation and whenever they add ids, because
   * `useReplyStream` reverses that row for chronological display. A cursor-less row is also
   * normalized by a cursor-less chunk that adds nothing, because an earlier build stored such
   * rows in hydration order and only re-sorted them on a later write. A row with a Nexus
   * cursor is never re-sorted, whatever chunk reaches it, and nothing rewrites its ids when a
   * chunk adds none.
   *
   * @param stream - Incoming post IDs to merge into the stream cache
   * @param streamId - Stream identifier to create or update
   * @param tailCursor - Nexus `last_post_score` of a descending page, when persisting one
   * @returns The stored stream, in row order (empty when nothing is cached)
   */
  static async persistNewStreamChunk({ stream, streamId, tailCursor }: TPostStreamUpsertParams): Promise<string[]> {
    const storedRow = await PostStreamModel.findById(streamId);
    const postStream = storedRow !== null && storedRow.stream.length > 0 ? storedRow : null;
    // Only a cursor-less chunk landing on a row without a Nexus position of its own is
    // ordered by post timestamp (an emptied row's stale cursor does not count).
    const normalizesByTimestamp =
      tailCursor === undefined && !this.isBookmarkStream(streamId) && postStream?.tailCursor === undefined;

    if (postStream === null) {
      // No cached ids to extend (e.g., database was deleted): the chunk is the stream and
      // its own position is the resume cursor — a stale cursor on an emptied row must not
      // survive, or the next seam would skip everything above it. A cursor-less chunk (a
      // reply row seeded from a hydration response) is stored newest-first from the start.
      const initialStream = normalizesByTimestamp && stream.length > 1 ? await sortPostIdsByTimestamp(stream) : stream;
      await PostStreamModel.upsert(streamId, initialStream, this.tailCursorFields(tailCursor));
      return initialStream;
    }

    // Check for duplicates before adding
    const existingIds = new Set(postStream.stream);
    const newPostsToAdd = stream.filter((id) => !existingIds.has(id));
    const deepestCursor = this.deepestTailCursor(postStream.tailCursor, tailCursor);
    const nextTailCursor = this.tailCursorFields(deepestCursor);

    if (newPostsToAdd.length === 0) {
      // A cursor-less row is normalized by any cursor-less chunk that repeats its ids: a row an
      // earlier build created in hydration order, or one seeded while its details were still
      // missing, would otherwise keep that order until a new reply arrives.
      if (normalizesByTimestamp && stream.length > 0) {
        const sortedStream = await sortPostIdsByTimestamp(postStream.stream);
        if (sortedStream.some((id, index) => id !== postStream.stream[index])) {
          await PostStreamModel.upsert(streamId, sortedStream, nextTailCursor);
          return sortedStream;
        }
        return postStream.stream;
      }
      // Nothing to add to a row with a Nexus cursor (an empty end page, or a page it already
      // holds): never rewrite the ids — only a deeper cursor is worth persisting.
      if (deepestCursor !== postStream.tailCursor) {
        await PostStreamModel.upsert(streamId, postStream.stream, nextTailCursor);
      }
      return postStream.stream;
    }

    // Combine existing and new posts
    const combinedStream = [...postStream.stream, ...newPostsToAdd];

    if (!normalizesByTimestamp) {
      await PostStreamModel.upsert(streamId, combinedStream, nextTailCursor);
      return combinedStream;
    }

    // Sort by timestamp (indexed_at) in descending order (most recent first)
    const sortedStream = await sortPostIdsByTimestamp(combinedStream);

    await PostStreamModel.upsert(streamId, sortedStream, nextTailCursor);
    return sortedStream;
  }

  /**
   * The part of a Nexus page that lies below the cached row.
   *
   * A row without a persisted cursor (bootstrap-seeded, or written before cursors were
   * tracked) resumes once from its tail post's timestamp. That is the post's score only
   * while the post is unedited: an edit bumps it, and the seam page then starts somewhere
   * inside or above the row. Only the ids the page lists after the last id the row already
   * holds are below the tail; everything before is either cached already or above the row
   * (a head poll's business, and possibly above the head the current walk started from),
   * so it is neither served by the walk nor appended below the tail. A page sharing no id
   * with the row is taken as lying below the tail, which is what a seam page normally is:
   * no local timestamp can tell that shape from a page entirely above the row (an edited
   * head reads as newer than it is), so that rarer shape is served once as it comes.
   */
  static async keepIdsBelowRow({ streamId, stream }: TAlignPageParams): Promise<string[]> {
    if (stream.length === 0) return stream;
    const row = await PostStreamModel.findById(streamId);
    if (!row || row.stream.length === 0) return stream;

    const rowIds = new Set(row.stream);
    for (let index = stream.length - 1; index >= 0; index -= 1) {
      if (rowIds.has(stream[index])) return stream.slice(index + 1);
    }
    return stream;
  }

  /** The deeper (smaller) of two Nexus resume cursors; pages only ever extend a stream downward. */
  private static deepestTailCursor(existing: number | undefined, incoming: number | undefined): number | undefined {
    if (existing === undefined) return incoming;
    if (incoming === undefined) return existing;
    return Math.min(existing, incoming);
  }

  /** Extra row fields for `PostStreamModel.upsert`; omitted entirely when there is no cursor. */
  private static tailCursorFields(tailCursor: number | undefined): { tailCursor: number } | undefined {
    return tailCursor === undefined ? undefined : { tailCursor };
  }

  private static isBookmarkStream(streamId: PostStreamId): boolean {
    return streamId.includes(`:${StreamSource.BOOKMARKS}:`);
  }

  /**
   * Persist a new chunk of posts to the unread post stream
   * @param stream - Array of post IDs to persist
   * @param streamId - The stream ID to persist the new chunk to
   * @returns The post IDs that were actually added (after deduplication)
   */
  static async persistUnreadNewStreamChunk({ stream, streamId }: TPostStreamUpsertParams): Promise<string[]> {
    const unreadPostStream = await UnreadPostStreamModel.findById(streamId);
    if (!unreadPostStream) {
      await UnreadPostStreamModel.upsert(streamId, stream);
      return stream;
    }
    const existingIds = new Set(unreadPostStream.stream);
    const newPostsToAdd = stream.filter((id) => !existingIds.has(id));
    if (newPostsToAdd.length === 0) return [];

    // Head polls can complete out of order (two tabs share this row), so a late, older page
    // must not land its unique ids above newer ones. The page is in Nexus order: each new id
    // goes right after the nearest id before it that the row already holds, and an id no
    // cached id precedes is newer than the row head and goes on top. A page sharing no id
    // with the row is taken as newer, which is what a poll above the head returns.
    const combinedStream = [...unreadPostStream.stream];
    let insertAt = 0;
    for (const id of stream) {
      const cachedIndex = combinedStream.indexOf(id);
      if (cachedIndex !== -1) {
        insertAt = cachedIndex + 1;
        continue;
      }
      combinedStream.splice(insertAt, 0, id);
      insertAt += 1;
    }
    await UnreadPostStreamModel.upsert(streamId, combinedStream);
    return newPostsToAdd;
  }
}
