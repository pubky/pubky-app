export interface UseDeletePostResult {
  /** Whether deletion is in progress */
  isDeleting: boolean;
  /** Deletes the post with the given ID */
  deletePost: (postId: string) => Promise<void>;
}
