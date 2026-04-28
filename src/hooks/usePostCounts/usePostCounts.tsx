'use client';

import * as Core from '@/core';
import { useLocalFirstQuery } from '@/hooks/useLocalFirstQuery/useLocalFirstQuery';
import type { UsePostCountsResult } from './usePostCounts.types';

/**
 * Hook to get post counts from local database with live updates.
 * If the post counts are not in cache, it will trigger a fetch from Nexus.
 *
 * Uses the local-first query pattern (ADR-0011) via `useLocalFirstQuery`:
 * 1. fetchFn (useEffect): Ensures data exists (fetch full entity from Nexus if missing)
 * 2. queryFn (useLiveQuery): Reads current data reactively from local DB
 *
 * @param compositeId - Composite post ID in format "authorId:postId" (can be null/undefined)
 * @returns Post counts and loading state
 *
 * @example
 * ```tsx
 * const { postCounts, isLoading } = usePostCounts(postId);
 * if (isLoading) return <Skeleton />;
 * return <span>{postCounts?.replies ?? 0} replies</span>;
 * ```
 */
export function usePostCounts(compositeId: string | null | undefined): UsePostCountsResult {
  const { data, isLoading } = useLocalFirstQuery<Core.PostCountsModelSchema>({
    queryFn: () => Core.PostController.getCounts({ compositeId: compositeId! }),
    fetchFn: () => Core.PostController.fetch({ compositeId: compositeId! }),
    deps: [compositeId],
    enabled: !!compositeId,
  });

  return {
    postCounts: data,
    isLoading,
  };
}
