import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';

export interface UsePostDetailsOptions {
  /**
   * When false, skips the local-first query and network fetch while keeping the hook rules-of-hooks-safe.
   * Use for composite IDs that fail URL shape validation.
   */
  enabled?: boolean;
}

export interface UsePostDetailsResult {
  /** Post details from local database, null if not found, undefined if loading */
  postDetails: EnrichedPostDetails | null | undefined;
  /** True while the query is loading */
  isLoading: boolean;
}
