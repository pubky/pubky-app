import type { Pubky } from '@/models/models.types';
export interface UseMutedUsersResult {
  /** Array of muted user IDs */
  mutedUserIds: Pubky[];
  /** Set of muted user IDs for fast lookup */
  mutedUserIdSet: Set<Pubky>;
  /** Helper to check if a user is muted */
  isMuted: (userId: Pubky) => boolean;
  /** Whether the muted list is loading */
  isLoading: boolean;
}
