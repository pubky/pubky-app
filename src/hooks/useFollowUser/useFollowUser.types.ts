import type { Pubky } from '@/models/models.types';

export const FOLLOW_ACTIONS = {
  FOLLOW: 'follow',
  UNFOLLOW: 'unfollow',
} as const;

export type FollowAction = (typeof FOLLOW_ACTIONS)[keyof typeof FOLLOW_ACTIONS];

export interface UseFollowUserResult {
  /** Toggles follow status for a user. Resolves `true` on success, `false` on failure (feedback is handled internally). */
  toggleFollow: (userId: Pubky, isCurrentlyFollowing: boolean) => Promise<boolean>;
  /** Whether any follow/unfollow action is in progress (concurrent toggles included) */
  isLoading: boolean;
  /** Most recent action in progress (follow/unfollow), null if idle */
  loadingAction: FollowAction | null;
  /** The user ID most recently toggled and still in flight (null if none) */
  loadingUserId: Pubky | null;
  /** Whether a follow/unfollow for this specific user is still in flight */
  isUserLoading: (userId: Pubky) => boolean;
  /** Error message if the action failed */
  error: string | null;
}
