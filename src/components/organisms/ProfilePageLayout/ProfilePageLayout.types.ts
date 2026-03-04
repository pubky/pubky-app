import { ProfileStats } from '@/hooks/useProfileHeader/useProfileHeader';
import { ProfilePageType, FilterBarPageType } from '@/app/profile/types';
import { FollowAction } from '@/hooks/useFollowUser/useFollowUser.types';

export interface ProfilePageLayoutActions {
  onEdit: () => void;
  onCopyPublicKey: () => void;
  onCopyLink: () => void;
  onSignOut: () => void;
  onStatusChange: (status: string) => void;
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

export interface ProfilePageLayoutProps {
  /** Child pages to render in the main content area */
  children: React.ReactNode;
  /** Profile data from the smart container */
  profile: {
    name: string;
    bio: string;
    publicKey: string;
    emoji: string;
    status: string;
    avatarUrl?: string;
    link: string;
  };
  /** Statistics for the profile */
  stats: ProfileStats;
  /** Actions handlers for profile interactions */
  actions: ProfilePageLayoutActions;
  /** Currently active page */
  activePage: ProfilePageType;
  /** Active page for filter bar (excludes PROFILE page type) */
  filterBarActivePage: FilterBarPageType;
  /** Navigation handler */
  navigateToPage: (page: ProfilePageType) => void;
  /** Loading state */
  isLoading: boolean;
  /** Whether this is the logged-in user's own profile */
  isOwnProfile?: boolean;
  /** Raw user ID (without pubky prefix) for TTL tracking */
  userId: string;
}
