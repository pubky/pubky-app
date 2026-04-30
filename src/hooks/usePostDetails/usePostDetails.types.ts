import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
export interface UsePostDetailsResult {
  /** Post details from local database, null if not found, undefined if loading */
  postDetails: EnrichedPostDetails | null | undefined;
  /** True while the query is loading */
  isLoading: boolean;
}
