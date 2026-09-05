import type { UserStreamUser } from '@/hooks/useUserStream/useUserStream.types';
import type { Pubky } from '@/models/models.types';

export interface SuggestedUser extends UserStreamUser {
  /** Profile tags that intersect the chosen interests, capped per design. Empty when none match. */
  matchingTags: string[];
}

export interface UseStarterPackSuggestionsResult {
  /** Suggestions in Nexus ranking order, followed cards preserved in place */
  users: SuggestedUser[];
  /** Suggestions the viewer does not follow yet (Follow All targets) */
  unfollowedUsers: SuggestedUser[];
  /** Number of suggestions the viewer currently follows */
  followedCount: number;
  isLoading: boolean;
  error: string | null;
  /** Per-card follow toggle with optimistic list preservation */
  handleFollowClick: (userId: Pubky, isCurrentlyFollowing: boolean, displayName: string) => Promise<void>;
  isUserLoading: (userId: Pubky) => boolean;
  /** True while a per-card follow is still committing; `followedCount` lags until it clears */
  isFollowPending: boolean;
  /** Keep a user visible after a follow committed outside `handleFollowClick` */
  preserveFollowedUser: (userId: Pubky) => void;
}
