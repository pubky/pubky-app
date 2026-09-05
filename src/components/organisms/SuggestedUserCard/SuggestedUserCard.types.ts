import type { SuggestedUser } from '@/hooks/useStarterPackSuggestions/useStarterPackSuggestions.types';
import type { Pubky } from '@/models/models.types';

export interface SuggestedUserCardProps {
  user: SuggestedUser;
  /** Whether a follow/unfollow action is in flight for this user */
  isLoading?: boolean;
  /** Whether the follow status is still being resolved */
  isStatusLoading?: boolean;
  onFollowClick: (userId: Pubky, isCurrentlyFollowing: boolean, displayName: string) => void;
  className?: string;
  'data-testid'?: string;
}
