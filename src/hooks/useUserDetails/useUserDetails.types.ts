import type { NexusUserDetails } from '@/services/nexus/nexus.types';

export interface UseUserDetailsResult {
  /** User details from local database, null if not found, undefined if loading */
  userDetails: NexusUserDetails | null | undefined;
  /** True while the query is loading */
  isLoading: boolean;
}
