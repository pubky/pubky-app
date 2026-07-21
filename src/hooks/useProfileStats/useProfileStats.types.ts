export interface ProfileStats {
  notifications: number;
  posts: number;
  replies: number;
  collections: number;
  followers: number;
  following: number;
  friends: number;
  uniqueTags: number;
}

export interface UseProfileStatsResult {
  stats: ProfileStats;
  isLoading: boolean;
}

export interface UseProfileStatsOptions {
  /** When false, skips local-first read/fetch (e.g. known-invalid pubky in URL). */
  enabled?: boolean;
}
