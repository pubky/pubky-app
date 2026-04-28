import type { PostStreamId } from '@/models/stream/post/postStream.types';
export interface UseUnreadPostsOptions {
  /**
   * Stream ID to watch for unread posts
   */
  streamId: PostStreamId | null;
}

export interface UseUnreadPostsResult {
  /**
   * Array of unread post IDs
   */
  unreadPostIds: string[];
  /**
   * Number of unread posts
   */
  unreadCount: number;
}
