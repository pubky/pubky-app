import type { Pubky } from '@/models/models.types';
// =============================================================================
// Public Types (exported)
// =============================================================================

export interface UserListItemData {
  /** User ID (pubky) */
  id: Pubky;
  /** User display name */
  name?: string;
  /** User avatar URL */
  avatarUrl?: string | null;
  /** Alternative image field (for backward compatibility) */
  image?: string | null;
  /** User tags */
  tags?: string[];
  /** User stats */
  stats?: {
    tags: number;
    posts: number;
  };
  /** Alternative counts field (for backward compatibility) */
  counts?: {
    tags: number;
    posts: number;
  };
  /** Whether the current user is following this user */
  isFollowing?: boolean;
}

export interface UserListItemProps {
  /** User data */
  user: UserListItemData;
  /** Display variant */
  variant?: 'compact' | 'full';
  /** Whether the current user is following this user (overrides user.isFollowing) */
  isFollowing?: boolean;
  /** Whether follow action is loading for this specific user */
  isLoading?: boolean;
  /** Whether the follow status is still being loaded (shows loading state instead of default) */
  isStatusLoading?: boolean;
  /** Whether this is the current logged-in user (hide follow button) */
  isCurrentUser?: boolean;
  /** Show stats with icons in compact variant (for ActiveUsers) */
  showStats?: boolean;
  // TODO: followButtonVariant is currently unused only 'icon'. Consider removing this prop if we don't need to reuse 'iconWithText' variant in the future. (19 Mar 2026)
  // Keeping the prop for potential reuse of 'iconWithText' variant in the future.
  /** Override the follow button style (defaults to 'icon') */
  followButtonVariant?: 'icon' | 'iconWithText';
  /** Callback when user area is clicked */
  onUserClick?: (id: Pubky) => void;
  /** Callback when follow button is clicked */
  onFollowClick?: (id: Pubky, isCurrentlyFollowing: boolean) => void;
  /** Custom className */
  className?: string;
  /** Test ID */
  'data-testid'?: string;
}

// =============================================================================
// Internal Types (used by sub-components)
// =============================================================================

export interface FollowButtonProps {
  isFollowing: boolean;
  isLoading: boolean;
  isStatusLoading: boolean;
  displayName: string;
  variant: 'icon' | 'iconWithText';
  onClick: (e: React.MouseEvent) => void;
}

export interface StatsSubtitleProps {
  tags: number;
  posts: number;
}

export interface UserStatsProps {
  tags: number;
  posts: number;
}

export interface VariantProps {
  user: UserListItemProps['user'];
  avatarUrl: string | undefined;
  displayName: string;
  formattedPublicKey: string;
  tags: string[];
  stats: { tags: number; posts: number };
  isFollowing: boolean;
  isLoading: boolean;
  isStatusLoading: boolean;
  isCurrentUser: boolean;
  showStats: boolean;
  followButtonVariant: 'icon' | 'iconWithText';
  className?: string;
  dataTestId?: string;
  onUserClick: () => void;
  onFollowClick: (e: React.MouseEvent) => void;
  /** TTL viewport subscription ref for freshness tracking */
  ttlRef: (node: HTMLElement | null) => void;
}
