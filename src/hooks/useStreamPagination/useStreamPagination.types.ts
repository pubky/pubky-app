import type { PostStreamId } from '@/models/stream/post/postStream.types';
export interface UseStreamPaginationOptions {
  /**
   * Stream ID to fetch posts from
   */
  streamId: PostStreamId;
  /**
   * Optional limit for posts per page (defaults to NEXUS_POSTS_PER_PAGE)
   */
  limit?: number;
  /**
   * Whether to reset state when streamId changes
   */
  resetOnStreamChange?: boolean;
}

export interface UseStreamPaginationResult {
  /**
   * Array of post IDs in the current stream
   */
  postIds: string[];
  /**
   * Whether the initial load is in progress
   */
  loading: boolean;
  /**
   * Whether loading more posts (pagination)
   */
  loadingMore: boolean;
  /**
   * Error message if fetch failed
   */
  error: string | null;
  /**
   * Whether there are more posts to load
   */
  hasMore: boolean;
  /**
   * Function to trigger loading more posts
   */
  loadMore: () => Promise<void>;
  /**
   * Function to manually trigger a refresh
   */
  refresh: () => Promise<void>;
  /**
   * Function to add post(s) to the timeline, sorted by timestamp
   * @param postIds - A single post ID or array of post IDs to add
   */
  prependPosts: (postIds: string | string[]) => Promise<void>;
  /**
   * Function to remove post(s) from the timeline
   * @param postIds - A single post ID or array of post IDs to remove
   */
  removePosts: (postIds: string | string[]) => void;
}
