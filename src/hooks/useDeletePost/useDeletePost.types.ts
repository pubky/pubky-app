export interface UseDeletePostOptions {
  active?: boolean;
  /** Keep deleting after this component unmounts, for a toast action that outlives it (`useRequireAuth`). */
  outlivesOwner?: boolean;
  /**
   * Override the success / failure toast copy. Useful when the deleted post is
   * something other than a generic post (e.g. a collection) so the toast reads
   * naturally. Each field is independent: omitted fields fall back to the
   * generic `toast.post.*` copy.
   */
  toastMessages?: {
    deleted?: string;
    deleteFailed?: string;
  };
}

export interface UseDeletePostResult {
  /** Whether deletion is in progress */
  isDeleting: boolean;
  /** Deletes the post with the given ID */
  deletePost: (postId: string) => Promise<boolean>;
}
