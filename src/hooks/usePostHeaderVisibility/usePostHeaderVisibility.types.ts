export interface UsePostHeaderVisibilityResult {
  /** Whether to show the repost header (undo button) */
  showRepostHeader: boolean;
  /** Whether to show the post header (author info) */
  shouldShowPostHeader: boolean;
  /** Composite ID of the reposted original, or null when unavailable */
  originalPostId: string | null;
}
