'use client';

import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { PostController } from '@/controllers/post/post';
import { useLocalFirstQuery } from '@/hooks/useLocalFirstQuery/useLocalFirstQuery';
import type { UsePostDetailsResult } from './usePostDetails.types';

/**
 * Hook to get post details from local database with live updates.
 * If the post is not in cache, it will trigger a fetch from Nexus.
 *
 * Uses the local-first query pattern (ADR-0011) via `useLocalFirstQuery`:
 * 1. fetchFn (useEffect): Ensures data exists (fetch from Nexus if missing)
 * 2. queryFn (useLiveQuery): Reads current data reactively from local DB
 */
export function usePostDetails(compositeId: string | null | undefined): UsePostDetailsResult {
  const { data, isLoading } = useLocalFirstQuery<EnrichedPostDetails>({
    queryFn: () => PostController.getDetails({ compositeId: compositeId! }),
    fetchFn: () => PostController.fetch({ compositeId: compositeId! }),
    deps: [compositeId],
    enabled: !!compositeId,
  });

  return {
    postDetails: data,
    isLoading,
  };
}
