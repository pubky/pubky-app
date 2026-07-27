import type { Pubky } from '@/models/models.types';
import { StreamSorting } from '@/services/nexus/nexus.types';
import { StreamKind, StreamSource } from '@/services/nexus/stream/posts/postStream.types';

// Post Stream ID Pattern: sorting:source:kind
// - SORTING: timeline (recent), total_engagement (popularity)
// - SOURCE: all, following, friends, me, bookmarks, post_replies, author, author_replies
// - KIND: all, short (posts), long (articles), image, video, link, file, collection
//
// Dynamic Post Reply Stream ID Pattern: postReplies:compositePostId
// - compositePostId format: author:postId (e.g., "did:key:abc123:post456")
// - Example: "postReplies:did:key:abc123:post456"

// Note: In some cases that we reference PostStreamTypes enum, we need to cast to PostStreamId to avoid type errors.
// TypeScript's generic inference narrows PostStreamTypes enum to the enum type instead of widening to PostStreamId union.
export enum PostStreamTypes {
  // ============================================
  // TIMELINE (Recent) - ALL Sources
  // ============================================
  TIMELINE_ALL_ALL = 'timeline:all:all',
  TIMELINE_ALL_SHORT = 'timeline:all:short',
  TIMELINE_ALL_LONG = 'timeline:all:long',
  TIMELINE_ALL_IMAGE = 'timeline:all:image',
  TIMELINE_ALL_VIDEO = 'timeline:all:video',
  TIMELINE_ALL_LINK = 'timeline:all:link',
  TIMELINE_ALL_FILE = 'timeline:all:file',
  TIMELINE_ALL_COLLECTION = 'timeline:all:collection',

  // ============================================
  // TIMELINE (Recent) - FOLLOWING Source
  // ============================================
  TIMELINE_FOLLOWING_ALL = 'timeline:following:all',
  TIMELINE_FOLLOWING_SHORT = 'timeline:following:short',
  TIMELINE_FOLLOWING_LONG = 'timeline:following:long',
  TIMELINE_FOLLOWING_IMAGE = 'timeline:following:image',
  TIMELINE_FOLLOWING_VIDEO = 'timeline:following:video',
  TIMELINE_FOLLOWING_LINK = 'timeline:following:link',
  TIMELINE_FOLLOWING_FILE = 'timeline:following:file',
  TIMELINE_FOLLOWING_COLLECTION = 'timeline:following:collection',

  // ============================================
  // TIMELINE (Recent) - FRIENDS Source
  // ============================================
  TIMELINE_FRIENDS_ALL = 'timeline:friends:all',
  TIMELINE_FRIENDS_SHORT = 'timeline:friends:short',
  TIMELINE_FRIENDS_LONG = 'timeline:friends:long',
  TIMELINE_FRIENDS_IMAGE = 'timeline:friends:image',
  TIMELINE_FRIENDS_VIDEO = 'timeline:friends:video',
  TIMELINE_FRIENDS_LINK = 'timeline:friends:link',
  TIMELINE_FRIENDS_FILE = 'timeline:friends:file',
  TIMELINE_FRIENDS_COLLECTION = 'timeline:friends:collection',

  // ============================================
  // TIMELINE (Recent) - BOOKMARKS Source
  // ============================================
  // The bookmarks route uses a single fixed stream (it has no content/sort filter
  // UI). ALL is the main bookmarks feed; COLLECTION backs the FollowedCollections
  // section (see buildFollowedCollectionsStreamId). Kind-specific and popularity
  // bookmark variants were removed with the legacy filter coupling.
  TIMELINE_BOOKMARKS_ALL = 'timeline:bookmarks:all',
  TIMELINE_BOOKMARKS_COLLECTION = 'timeline:bookmarks:collection',

  // ============================================
  // POPULARITY (Total Engagement) - ALL Sources
  // ============================================
  POPULARITY_ALL_ALL = 'total_engagement:all:all',
  POPULARITY_ALL_SHORT = 'total_engagement:all:short',
  POPULARITY_ALL_LONG = 'total_engagement:all:long',
  POPULARITY_ALL_IMAGE = 'total_engagement:all:image',
  POPULARITY_ALL_VIDEO = 'total_engagement:all:video',
  POPULARITY_ALL_LINK = 'total_engagement:all:link',
  POPULARITY_ALL_FILE = 'total_engagement:all:file',
  POPULARITY_ALL_COLLECTION = 'total_engagement:all:collection',

  // ============================================
  // POPULARITY (Total Engagement) - FOLLOWING Source
  // ============================================
  POPULARITY_FOLLOWING_ALL = 'total_engagement:following:all',
  POPULARITY_FOLLOWING_SHORT = 'total_engagement:following:short',
  POPULARITY_FOLLOWING_LONG = 'total_engagement:following:long',
  POPULARITY_FOLLOWING_IMAGE = 'total_engagement:following:image',
  POPULARITY_FOLLOWING_VIDEO = 'total_engagement:following:video',
  POPULARITY_FOLLOWING_LINK = 'total_engagement:following:link',
  POPULARITY_FOLLOWING_FILE = 'total_engagement:following:file',
  POPULARITY_FOLLOWING_COLLECTION = 'total_engagement:following:collection',

  // ============================================
  // POPULARITY (Total Engagement) - FRIENDS Source
  // ============================================
  POPULARITY_FRIENDS_ALL = 'total_engagement:friends:all',
  POPULARITY_FRIENDS_SHORT = 'total_engagement:friends:short',
  POPULARITY_FRIENDS_LONG = 'total_engagement:friends:long',
  POPULARITY_FRIENDS_IMAGE = 'total_engagement:friends:image',
  POPULARITY_FRIENDS_VIDEO = 'total_engagement:friends:video',
  POPULARITY_FRIENDS_LINK = 'total_engagement:friends:link',
  POPULARITY_FRIENDS_FILE = 'total_engagement:friends:file',
  POPULARITY_FRIENDS_COLLECTION = 'total_engagement:friends:collection',
}

export type ReplyStreamCompositeId = `${StreamSource.REPLIES}:${string}`;
export type AuthorStreamCompositeId = `${StreamSource.AUTHOR}:${string}`;
export type AuthorRepliesStreamCompositeId = `${StreamSource.AUTHOR_REPLIES}:${string}`;

// Collections feature (see `.plans/2026/may/collections-feature-foundation.md`).
//
// Stream id shapes:
// - Author's own collections (kind=collection filter on author endpoint):
//     `<authorPubky>:author:collection`
// - Bookmarked collections (current viewer's bookmarks filtered by kind):
//     `timeline:bookmarks:collection`
//   The bookmarks endpoint pulls observer_id from `viewer_id` at fetch time,
//   so the stream id does not embed the observer pubky (matches existing
//   `TIMELINE_BOOKMARKS_*` shapes).
// - Discover collections (popularity, all sources, kind=collection):
//     `total_engagement:all:collection`
// - Single-collection items (posts inside one collection):
//     `collection:<authorPubky>:<postId>` (source-first composite, mirrors REPLIES).
export type AuthorCollectionsStreamId = `${string}:${StreamSource.AUTHOR}:${StreamKind.COLLECTION}`;
export type FollowedCollectionsStreamId =
  `${StreamSorting.TIMELINE}:${StreamSource.BOOKMARKS}:${StreamKind.COLLECTION}`;
export type DiscoverCollectionsStreamId = `${StreamSorting.ENGAGEMENT}:${StreamSource.ALL}:${StreamKind.COLLECTION}`;
export type CollectionItemsStreamCompositeId = `${StreamSource.COLLECTION}:${string}:${string}`;

export function buildPostReplyStreamId(compositePostId: string): ReplyStreamCompositeId {
  return `${StreamSource.REPLIES}:${compositePostId}`;
}

export function buildAuthorCollectionsStreamId(authorPubky: Pubky): AuthorCollectionsStreamId {
  return `${authorPubky}:${StreamSource.AUTHOR}:${StreamKind.COLLECTION}`;
}

/**
 * Author-scoped profile streams intentionally include posts from muted users
 * (viewing someone's profile shows their full timeline, same as bookmarks #1804).
 */
export function isAuthorStreamSkippingMuteFilter(streamId: string): boolean {
  if (streamId.startsWith(`${StreamSource.AUTHOR}:`)) {
    return true;
  }
  if (streamId.startsWith(`${StreamSource.AUTHOR_REPLIES}:`)) {
    return true;
  }
  return streamId.endsWith(`:${StreamSource.AUTHOR}:${StreamKind.COLLECTION}`);
}

export function buildFollowedCollectionsStreamId(): FollowedCollectionsStreamId {
  return `${StreamSorting.TIMELINE}:${StreamSource.BOOKMARKS}:${StreamKind.COLLECTION}`;
}

export function buildDiscoverCollectionsStreamId(): DiscoverCollectionsStreamId {
  return `${StreamSorting.ENGAGEMENT}:${StreamSource.ALL}:${StreamKind.COLLECTION}`;
}

/** The global "Discover Collections" stream (engagement-sorted, all sources, collection kind). */
export function isDiscoverCollectionsStream(streamId: string): boolean {
  return streamId === buildDiscoverCollectionsStreamId();
}

export function buildCollectionItemsStreamId(authorPubky: Pubky, postId: string): CollectionItemsStreamCompositeId {
  return `${StreamSource.COLLECTION}:${authorPubky}:${postId}`;
}

export function isCollectionItemsStream(streamId: string): streamId is CollectionItemsStreamCompositeId {
  return streamId.startsWith(`${StreamSource.COLLECTION}:`);
}

/**
 * Single-collection item feeds (`collection:<author>:<postId>`) and the
 * bookmarks post feeds (`<sorting>:bookmarks:<kind>`) intentionally keep deleted
 * posts in the stream so the feed still renders the saved/collected slot with the
 * post component's deleted-state placeholder, rather than silently dropping it.
 * Every other stream filters deleted posts out entirely.
 *
 * The collection-kind bookmark stream (`<sorting>:bookmarks:collection`) is
 * excluded: it is not a bookmarks post feed but the seed for the
 * `FollowedCollections` section, which deliberately hides deleted collections
 * (its live query filters them out). Keeping stream-level filtering here stays
 * consistent with that, rather than surfacing deleted collections in that section.
 */
export function isDeletedRetainingStream(streamId: string): boolean {
  if (isCollectionItemsStream(streamId)) return true;
  return streamId.includes(`:${StreamSource.BOOKMARKS}:`) && !streamId.endsWith(`:${StreamKind.COLLECTION}`);
}

export type PostStreamId =
  | PostStreamTypes
  | ReplyStreamCompositeId
  | AuthorStreamCompositeId
  | AuthorRepliesStreamCompositeId
  | AuthorCollectionsStreamId
  | FollowedCollectionsStreamId
  | DiscoverCollectionsStreamId
  | CollectionItemsStreamCompositeId;

/**
 * Streams that paginate by offset (`skip`) rather than a timestamp/score cursor.
 *
 * Nexus returns `last_post_score: null` for these, so a timestamp cursor never advances —
 * they must page by `skip` and bypass the timestamp-based local stream cache:
 * - Engagement streams (`total_engagement:…`) — popularity-ranked, no stable score cursor.
 * - Single-collection item streams (`collection:…`) — returned in the collection's own
 *   item order, paginated by index.
 */
export function isSkipPaginatedStream(streamId: string): boolean {
  const head = streamId.split(':')[0];
  return head === StreamSorting.ENGAGEMENT || isCollectionItemsStream(streamId);
}

/**
 * Advance a stream's pagination cursor by RAW backend data only, never by the post-filter
 * visible count - so a fully-filtered page still moves forward and never re-requests posts.
 * Skip streams: advance the `skip` offset by the raw page size. Score streams: resume from
 * the last raw `last_post_score` (hold position when it's absent, e.g. an empty page).
 */
export function advanceCursor(
  streamId: string,
  prevCursor: number,
  rawPage: { ids: string[]; lastScore: number | null | undefined },
): number {
  if (isSkipPaginatedStream(streamId)) {
    return prevCursor + rawPage.ids.length;
  }
  return rawPage.lastScore ?? prevCursor;
}

/**
 * Bookmark post streams (`…:bookmarks:…`) — e.g. `timeline:bookmarks:all` and
 * `timeline:bookmarks:collection`.
 *
 * Nexus orders these by *bookmark* time (the bookmark's `indexed_at`, stored
 * locally as `bookmarks.created_at`), not the post's own `indexed_at`. Pagination
 * cursors for them must therefore be derived from the local bookmarks table.
 */
export function isBookmarkStream(streamId: string): boolean {
  return streamId.includes(`:${StreamSource.BOOKMARKS}:`);
}
