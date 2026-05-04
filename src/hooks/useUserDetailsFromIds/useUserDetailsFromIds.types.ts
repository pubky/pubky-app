import type { Pubky } from '@/models/models.types';
export interface AutocompleteUserData {
  id: Pubky;
  name: string;
  avatarUrl?: string;
}

export interface UseUserDetailsFromIdsParams {
  /** Array of user IDs to fetch details for */
  userIds: Pubky[];
  /** Whether to prefetch user details into cache (default: true) */
  prefetch?: boolean;
}

export interface UseUserDetailsFromIdsResult {
  /** Array of user data with details loaded from cache */
  users: AutocompleteUserData[];
  /** Whether we're waiting for user details to load into cache */
  isLoading: boolean;
}
