import type { Pubky } from '@/models/models.types';
import type { UserStreamId } from '@/models/stream/user/userStream.types';

export interface UserStreamUserCounts {
  posts: number;
  /** Tags applied by this user (Nexus `tagged`), not tags received on their profile/posts */
  tags: number;
  followers: number;
  following: number;
}

export interface UserStreamUser {
  id: Pubky;
  name: string;
  bio: string;
  image: string | null;
  /** Avatar URL computed from user ID (CDN URL), null if user has no avatar */
  avatarUrl: string | null;
  status: string | null;
  counts?: UserStreamUserCounts;
  /** Whether the current user is following this user */
  isFollowing?: boolean;
  /** User tags (labels only) */
  tags?: string[];
}

export interface UseUserStreamParams {
  /** Stream ID to fetch (e.g., UserStreamTypes.TODAY_INFLUENCERS_ALL) */
  streamId: UserStreamId;
  /** Number of users to show. Default: 3 */
  limit?: number;
  /** Whether to also fetch user counts (posts, tags, etc). Default: false */
  includeCounts?: boolean;
  /** Whether to include relationship data (isFollowing). Default: false */
  includeRelationships?: boolean;
  /** Whether to include user tags. Default: false */
  includeTags?: boolean;
  /** Hide users whose local relationship says the viewer already follows them. Default: false */
  excludeFollowing?: boolean;
  /**
   * Show every eligible user the stream holds instead of the first `limit`, reading the whole
   * cached row at once; `limit` then only sets how many to keep available. Default: false
   */
  showAll?: boolean;
  /** Followed users to keep visible even when excludeFollowing is enabled. */
  preserveFollowedUserIds?: Pubky[];
  /** Minimum candidate IDs to request/cache per stream fetch. Defaults to the visible limit. */
  bufferSize?: number;
  /** Refill once when the local candidate buffer drops below this size. */
  refillThreshold?: number;
}

export interface UseUserStreamResult {
  /** Array of user details */
  users: UserStreamUser[];
  /** User IDs in the stream */
  userIds: Pubky[];
  /** Whether the initial load is in progress */
  isLoading: boolean;
  /** Whether a refill of hidden followed users is in flight */
  isLoadingMore: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Re-fetch the users */
  refetch: () => Promise<void>;
}

export type FetchUserStreamSliceOptions = {
  forceNetwork?: boolean;
};
