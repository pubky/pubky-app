import type { NexusUserDetails } from '@/services/nexus/nexus.types';

// ============================================================================
// Constants
// ============================================================================

export const CONNECTION_TYPE = {
  FOLLOWERS: 'followers',
  FOLLOWING: 'following',
  FRIENDS: 'friends',
} as const;

export type ConnectionType = (typeof CONNECTION_TYPE)[keyof typeof CONNECTION_TYPE];

// ============================================================================
// Types
// ============================================================================

export interface UserConnectionData extends NexusUserDetails {
  /** Avatar URL computed from user ID, null if user has no avatar */
  avatarUrl: string | null;
  tags?: string[];
  stats?: {
    tags: number;
    posts: number;
  };
  /** Whether the current user is following this connection */
  isFollowing?: boolean;
}

export interface UseProfileConnectionsResult {
  /** Array of user connection data */
  connections: UserConnectionData[];
  /** Total count of connections loaded */
  count: number;
  /** Whether the initial load is in progress */
  isLoading: boolean;
  /** Whether loading more connections (pagination) */
  isLoadingMore: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Whether there are more connections to load */
  hasMore: boolean;
  /** Function to trigger loading more connections */
  loadMore: () => Promise<void>;
  /** Function to manually trigger a refresh */
  refresh: () => Promise<void>;
}
