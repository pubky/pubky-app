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
  /**
   * Optional callback invoked when a stream slice fetch fails. Fires after
   * the internal `error` state is set but before the `loading` / `loadingMore`
   * flags clear. Intended for surface-level UX (e.g. firing a toast in the
   * caller component) without forcing every consumer to subscribe to the
   * `error` field via `useEffect`.
   *
   * Defaults to a no-op, so existing callers are unaffected.
   *
   * @param error  The original thrown value from `getOrFetchStreamSlice`
   *               (not coerced to `Error` — may be an `AppError` or unknown).
   */
  onError?: (error: unknown) => void;
}

export interface OptimisticPostRemoval {
  commit: () => void;
  rollback: () => void;
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
   * Function to show membership-ordered posts at the top without timestamp sorting.
   * Used by bookmarks and single-collection optimistic inserts where membership
   * order differs from post creation time.
   *
   * This does not affect pagination cursors.
   *
   * @param postIds - A single post ID or array of post IDs to add
   */
  prependOptimisticPosts: (postIds: string | string[]) => void;
  /**
   * Function to permanently remove post(s) from the timeline.
   * @param postIds - A single post ID or array of post IDs to remove
   */
  removePosts: (postIds: string | string[]) => void;
  /**
   * Function to hide post(s) immediately while persistence is pending.
   * The returned transaction must be committed or rolled back.
   */
  removePostsOptimistically: (postIds: string | string[]) => OptimisticPostRemoval;
}
