export interface UsePostHeaderVisibilityResult {
  /** Whether to show the repost header (undo button) */
  showRepostHeader: boolean;
  /** Whether to show the post header (author info) */
  shouldShowPostHeader: boolean;
  /** Composite ID of the reposted original, or null when unavailable */
  originalPostId: string | null;
  /**
   * Whether the post is a contentless repost (no text, no attachments, not a reply) by anyone.
   * Its tags and replies belong to the original, whoever is viewing.
   */
  isContentlessRepost: boolean;
}
