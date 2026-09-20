export interface UseRepostInfoResult {
  /** Whether the post is a repost (used by PostContent, PostMain) */
  isRepost: boolean;
  /** Whether this post also belongs to a reply thread */
  isReply: boolean;
  /** ID of the user who reposted (derived from postId) */
  repostAuthorId: string | null;
  /** Whether the current user is the one who reposted (used by PostMain) */
  isCurrentUserRepost: boolean;
  /** Original post ID if this is a repost (used by PostContent) */
  originalPostId: string | null;
  /** Loading state - true while relationships are being fetched */
  isLoading: boolean;
  /** Error state - true if there was an error fetching relationships or parsing data */
  hasError: boolean;
}
