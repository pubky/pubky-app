import { PostStreamTypes } from '@/models/stream/post/postStream.types';

/**
 * Timeline stream groups for invalidation
 * Grouped by reach type (following/friends) for efficient cache clearing
 *
 * Note: Only TIMELINE (recent) streams are cached locally.
 * POPULARITY (engagement) streams are not cached, so no need to invalidate them.
 */
export const FOLLOWING_TIMELINE_STREAMS = [
  PostStreamTypes.TIMELINE_FOLLOWING_ALL,
  PostStreamTypes.TIMELINE_FOLLOWING_SHORT,
  PostStreamTypes.TIMELINE_FOLLOWING_LONG,
  PostStreamTypes.TIMELINE_FOLLOWING_IMAGE,
  PostStreamTypes.TIMELINE_FOLLOWING_VIDEO,
  PostStreamTypes.TIMELINE_FOLLOWING_LINK,
  PostStreamTypes.TIMELINE_FOLLOWING_FILE,
] as const;

export const FRIENDS_TIMELINE_STREAMS = [
  PostStreamTypes.TIMELINE_FRIENDS_ALL,
  PostStreamTypes.TIMELINE_FRIENDS_SHORT,
  PostStreamTypes.TIMELINE_FRIENDS_LONG,
  PostStreamTypes.TIMELINE_FRIENDS_IMAGE,
  PostStreamTypes.TIMELINE_FRIENDS_VIDEO,
  PostStreamTypes.TIMELINE_FRIENDS_LINK,
  PostStreamTypes.TIMELINE_FRIENDS_FILE,
] as const;
