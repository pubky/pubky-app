import type { Pubky } from '@/models/models.types';
import type { PostStreamId } from '@/models/stream/post/postStream.types';
import type { NexusPost } from '@/services/nexus/nexus.types';
import type { StreamOrder } from '@/services/nexus/stream/posts/postStream.types';

export interface TFetchStreamParams {
  isCurrent?: () => boolean;
  streamId: PostStreamId;
  streamHead: number;
  streamTail: number;
  limit: number;
  /** Optional viewer ID for relationship data. Null for unauthenticated views. */
  viewerId: Pubky | null;
  lastPostId?: string;
  /** Ids the caller has already rendered from this stream, in display order. Used to
   * re-anchor the cache walk when `lastPostId` was removed from the cached row (the post
   * was deleted or un-bookmarked): the walk resumes after the deepest one still cached. */
  visiblePostIds?: string[];
  /**
   * `streamTail` was seeded from a cached post's timestamp because the row has no persisted
   * Nexus cursor yet (bootstrap-seeded, or pre-cursor). Only the part of the page below the
   * row is then served or persisted (`LocalStreamPostsService.keepIdsBelowRow`).
   */
  seededFromTimestamp?: boolean;
  tags?: string[];
  order?: StreamOrder;
}

export interface TInitialStreamParams {
  streamId: PostStreamId;
  limit: number;
  cachedStream: { stream: string[] } | null;
}

export interface TPostStreamChunkResponse {
  nextPageIds: string[];
  cacheMissPostIds: string[];
  /** Opaque resume cursor: raw `skip` offset for skip streams, `last_post_score` for score
   * streams. Advanced only by raw backend data, never by the visible count. */
  nextCursor: number | undefined;
  /** True only if we've reached the actual end of the stream (Nexus returned fewer posts than limit).
   * False if we hit MAX_FETCH_ITERATIONS or filled the limit. */
  reachedEnd?: boolean;
  /** Id of the last RAW post scanned this round (visible or filtered) — the resume anchor
   * for the local stream-cache walk. Advances by raw scanned data, never by the post-filter
   * visible count (the cache-walk twin of `nextCursor`'s invariant). After a Nexus page it
   * is the deepest of that page's ids and the previous anchor as positioned in the persisted
   * row, so a page the row already held can never move the anchor back up the row and a row
   * another walker extended cannot make it jump over unserved ids. Holds at the caller's own
   * `lastPostId` when a round is served purely from the overflow buffer; undefined when
   * nothing was scanned or on paths that bypass the cache walk (e.g. ASCENDING order).
   * May be a filtered-out (deleted/collection/muted) post id — do not dereference for display. */
  lastRawPostId?: string;
  /** Raw ids this round consumed before filtering (see `CollectResult.rawScannedCount`);
   * undefined on paths that bypass the queue (head polls, ASCENDING order). */
  rawScannedCount?: number;
}

export interface TPartialCacheHitParams {
  isCurrent?: () => boolean;
  cachedStreamChunk: string[];
  limit: number;
  /** The cached stream's Nexus resume cursor: the position the remaining posts are fetched from. */
  streamTail: number;
  /** See `TFetchStreamParams.seededFromTimestamp`. */
  seededFromTimestamp?: boolean;
  streamId: PostStreamId;
  /** Optional viewer ID for relationship data. Null for unauthenticated views. */
  viewerId: Pubky | null;
}

export interface TMissingPostsParams {
  force?: boolean;
  isCurrent?: () => boolean;
  cacheMissPostIds: string[];
  /** Optional viewer ID for relationship data. Null/undefined for unauthenticated views. */
  viewerId?: Pubky | null;
}

export interface TCacheStreamParams {
  lastPostId: string | undefined;
  /** See `TFetchStreamParams.visiblePostIds`. */
  visiblePostIds?: string[];
  limit: number;
  cachedStream: { stream: string[] };
}

export interface TFetchMissingUsersParams {
  isCurrent?: () => boolean;
  posts: NexusPost[];
  /** Optional viewer ID for relationship data. Null/undefined for unauthenticated views. */
  viewerId?: Pubky | null;
}

export interface TPersistUnreadNewStreamChunkParams {
  streamId: PostStreamId;
  compositePostIds: string[];
}

/**
 * Entry stored in the in-memory queue for overflow posts between pagination requests.
 * @property posts - Array of composite post IDs (authorPubky:postId) not yet returned to UI
 * @property cursor - The last timestamp used for pagination
 */
export interface TQueueEntry {
  posts: string[];
  cursor: number;
}
