import type { Pubky } from '@/core';

export interface GroupedRepostHeaderProps {
  /** List of user IDs who reposted */
  reposterIds: Pubky[];
  /** Whether the current user's repost is in this group */
  includesCurrentUser: boolean;
  /** Earliest timestamp among all reposts (for display) */
  earliestTimestamp: number;
  /** Whether the reposter list is expanded (controlled mode) */
  isExpanded?: boolean;
  /** Callback when avatar group is clicked to toggle expand state */
  onExpandToggle?: () => void;
}

export interface GetFirstReposterNameParams {
  includesCurrentUser: boolean;
  isFirstReposterLoading: boolean;
  firstReposterProfile: { name?: string } | null | undefined;
  firstReposterId: Pubky;
  youLabel: string;
}
