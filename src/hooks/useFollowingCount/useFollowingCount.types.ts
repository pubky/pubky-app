export interface UseFollowingCountResult {
  /** Accounts the viewer follows per the local follow cache, excluding the moderation bot's auto-follow */
  followingCount: number;
  /** True until the local follow cache has been read once for the current viewer */
  isLoading: boolean;
}
