import type { Pubky } from '@/models/models.types';

export const FOLLOW_ACTIONS = {
  FOLLOW: 'follow',
  UNFOLLOW: 'unfollow',
} as const;

export type FollowAction = (typeof FOLLOW_ACTIONS)[keyof typeof FOLLOW_ACTIONS];

export interface UseFollowUserResult {
  /** Toggles follow status for a user */
  toggleFollow: (userId: Pubky, isCurrentlyFollowing: boolean, displayName?: string) => Promise<void>;
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
