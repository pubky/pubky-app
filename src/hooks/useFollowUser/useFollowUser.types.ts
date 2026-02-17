import type { Pubky } from '@/core';

export type FollowAction = 'follow' | 'unfollow';

export interface UseFollowUserResult {
  /** Toggles follow status for a user */
  toggleFollow: (userId: Pubky, isCurrentlyFollowing: boolean) => Promise<void>;
  /** Whether a follow/unfollow action is in progress */
  isLoading: boolean;
  /** Current action in progress (follow/unfollow), null if idle */
  loadingAction: FollowAction | null;
  /** The user ID currently being followed/unfollowed (null if none) */
  loadingUserId: Pubky | null;
  /** Helper to check if a specific user is loading */
  isUserLoading: (userId: Pubky) => boolean;
  /** Error message if the action failed */
  error: string | null;
}
