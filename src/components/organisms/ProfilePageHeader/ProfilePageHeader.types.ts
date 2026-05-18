import { FollowAction } from '@/hooks/useFollowUser/useFollowUser.types';
import type { ProfileStats } from '@/hooks/useProfileStats/useProfileStats.types';

/**
 * Profile data for the header
 */
export interface ProfileHeaderData {
  avatarUrl?: string;
  emoji?: string;
  name: string;
  bio?: string;
  publicKey: string;
  link: string;
  status: string;
}

/**
 * Action handlers for the header
 */
export interface ProfileHeaderActions {
  onEdit?: () => void;
  onCopyPublicKey?: () => void;
  onCopyLink: () => void;
  onSignOut?: () => void;
  onStatusChange?: (status: string) => void;
  onAvatarClick?: () => void;
  isLoggingOut?: boolean;
  /** Follow/unfollow action for other user's profiles */
  onFollowToggle?: () => void;
  /** Whether the follow action is in progress */
  isFollowLoading?: boolean;
  /** Which follow action is currently in progress */
  followLoadingAction: FollowAction | null;
  /** Whether the current user is following this profile */
  isFollowing?: boolean;
}

/**
 * Props for ProfilePageHeader component
 * Groups profile data and actions for better organization
 */
export interface ProfilePageHeaderProps {
  /** Profile information to display */
  profile: ProfileHeaderData;
  /** Action handlers for user interactions */
  actions: ProfileHeaderActions;
  /** Whether this is the logged-in user's own profile */
  isOwnProfile?: boolean;
  /** Raw user ID (without pubky prefix) for TTL tracking */
  userId: string;
  /** Statistics for the profile, used by the mobile header summary */
  stats?: ProfileStats;
}

/**
 * Legacy flat props interface for backward compatibility
 * @deprecated Use ProfilePageHeaderProps with grouped props instead
 */
export interface ProfilePageHeaderPropsFlat {
  avatarUrl?: string;
  emoji?: string;
  name: string;
  bio?: string;
  publicKey: string;
  link: string;
  status: string;
  onEdit?: () => void;
  onCopyPublicKey?: () => void;
  onCopyLink: () => void;
  onSignOut?: () => void;
  onStatusChange?: (status: string) => void;
}
