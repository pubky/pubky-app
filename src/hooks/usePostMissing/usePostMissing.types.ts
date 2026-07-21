import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';

export interface UsePostMissingResult {
  /** True when the composite id is malformed or the local-first fetch settled without a post */
  postMissing: boolean;
  /** Post details from local database, null if not found, undefined if loading */
  postDetails: EnrichedPostDetails | null | undefined;
  /** True while the query is loading */
  isLoading: boolean;
}
