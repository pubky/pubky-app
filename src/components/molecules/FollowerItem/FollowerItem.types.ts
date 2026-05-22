import type { UserConnectionData } from '@/hooks/useProfileConnections/useProfileConnections.types';
import type { Pubky } from '@/models/models.types';

export interface FollowerItemProps {
  follower: UserConnectionData;
  /** Whether the current user is following this user (reactive from database) */
  isFollowing?: boolean;
  /** Callback when follow/unfollow button is clicked */
  onFollow?: (userId: Pubky, isCurrentlyFollowing: boolean) => void;
  /** Whether this follower is the current logged-in user (hide follow button) */
  isCurrentUser?: boolean;
}
