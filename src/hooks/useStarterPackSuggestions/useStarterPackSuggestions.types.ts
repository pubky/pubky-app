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
  isLoading: boolean;
  error: string | null;
  /** Per-card follow toggle with optimistic list preservation */
  handleFollowClick: (userId: Pubky, isCurrentlyFollowing: boolean) => Promise<void>;
  isUserLoading: (userId: Pubky) => boolean;
  /** True while any follow toggle is still committing; relationship-derived state lags until it clears */
  isFollowPending: boolean;
  /** Keep a user visible before a follow committed outside `handleFollowClick` lands locally */
  preserveFollowedUser: (userId: Pubky) => void;
  /** Undo `preserveFollowedUser` when that external follow failed */
  unpreserveFollowedUser: (userId: Pubky) => void;
}
