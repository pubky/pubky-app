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
  // TIMELINE (Recent) - BOOKMARKS ALL Source
  // ============================================
  TIMELINE_BOOKMARKS_ALL = 'timeline:bookmarks:all',
  TIMELINE_BOOKMARKS_SHORT = 'timeline:bookmarks:short',
  TIMELINE_BOOKMARKS_LONG = 'timeline:bookmarks:long',
  TIMELINE_BOOKMARKS_IMAGE = 'timeline:bookmarks:image',
  TIMELINE_BOOKMARKS_VIDEO = 'timeline:bookmarks:video',
  TIMELINE_BOOKMARKS_LINK = 'timeline:bookmarks:link',
  TIMELINE_BOOKMARKS_FILE = 'timeline:bookmarks:file',
  TIMELINE_BOOKMARKS_COLLECTION = 'timeline:bookmarks:collection',

  // ============================================
  // POPULARITY (Total Engagement) - BOOKMARKS Source
  // ============================================
  POPULARITY_BOOKMARKS_ALL = 'total_engagement:bookmarks:all',
  POPULARITY_BOOKMARKS_SHORT = 'total_engagement:bookmarks:short',
  POPULARITY_BOOKMARKS_LONG = 'total_engagement:bookmarks:long',
  POPULARITY_BOOKMARKS_IMAGE = 'total_engagement:bookmarks:image',
  POPULARITY_BOOKMARKS_VIDEO = 'total_engagement:bookmarks:video',
  POPULARITY_BOOKMARKS_LINK = 'total_engagement:bookmarks:link',
  POPULARITY_BOOKMARKS_FILE = 'total_engagement:bookmarks:file',
  POPULARITY_BOOKMARKS_COLLECTION = 'total_engagement:bookmarks:collection',

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

export function buildFollowedCollectionsStreamId(): FollowedCollectionsStreamId {
  return `${StreamSorting.TIMELINE}:${StreamSource.BOOKMARKS}:${StreamKind.COLLECTION}`;
}

export function buildDiscoverCollectionsStreamId(): DiscoverCollectionsStreamId {
  return `${StreamSorting.ENGAGEMENT}:${StreamSource.ALL}:${StreamKind.COLLECTION}`;
}

export function buildCollectionItemsStreamId(authorPubky: Pubky, postId: string): CollectionItemsStreamCompositeId {
  return `${StreamSource.COLLECTION}:${authorPubky}:${postId}`;
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
  return head === StreamSorting.ENGAGEMENT || head === StreamSource.COLLECTION;
}
