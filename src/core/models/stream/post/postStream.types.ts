import { StreamSource } from '@/services/nexus/stream/posts/postStream.types';

// Post Stream ID Pattern: sorting:source:kind
// - SORTING: timeline (recent), total_engagement (popularity)
// - SOURCE: all, following, friends, me, bookmarks, post_replies, author, author_replies
// - KIND: all, short (posts), long (articles), image, video, link, file
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
}

export type ReplyStreamCompositeId = `${StreamSource.REPLIES}:${string}`;
export type AuthorStreamCompositeId = `${StreamSource.AUTHOR}:${string}`;
export type AuthorRepliesStreamCompositeId = `${StreamSource.AUTHOR_REPLIES}:${string}`;

export function buildPostReplyStreamId(compositePostId: string): ReplyStreamCompositeId {
  return `${StreamSource.REPLIES}:${compositePostId}`;
}

export type PostStreamId =
  | PostStreamTypes
  | ReplyStreamCompositeId
  | AuthorStreamCompositeId
  | AuthorRepliesStreamCompositeId;
