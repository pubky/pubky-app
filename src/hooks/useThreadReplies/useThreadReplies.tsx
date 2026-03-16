'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import * as Core from '@/core';
// Direct import to avoid circular dependency (this hook is exported from @/hooks)
import { useReplyStream } from '@/hooks/useReplyStream';
import { DEFAULT_MAX_THREAD_REPLIES } from './useThreadReplies.constants';
import type { UseThreadRepliesOptions, UseThreadRepliesResult } from './useThreadReplies.types';

/**
 * Hook for fetching Level 1 replies with a max-3 + show-more pattern.
 *
 * This hook:
 * - Delegates core reply stream logic to `useReplyStream`
 * - Adds Level 1-specific concern: detecting whether any reply has sub-replies
 *   (used by the global expand/collapse toggle)
 *
 * @param postId - The composite post ID to get replies for
 * @param options - Configuration options
 * @returns Reply IDs, counts, show-more state, and expand function
 */
export function useThreadReplies(
  postId: string | null | undefined,
  options: UseThreadRepliesOptions = {},
): UseThreadRepliesResult {
  const { maxReplies = DEFAULT_MAX_THREAD_REPLIES } = options;

  const { replyIds, adjustedTotalCount, hasMore, showAll, isExpandingAll, expandAll, loading } = useReplyStream(
    postId,
    { maxReplies },
  );

  const replyIdsDependencyKey = replyIds.join('|');

  // Check if any reply has sub-replies (for rendering the global toggle)
  const hasAnyNestedReplies = useLiveQuery(
    async () => {
      try {
        if (!postId || replyIds.length === 0) return false;

        const replyCounts = await Core.PostCountsModel.findByIds(replyIds);
        return replyCounts.some((counts) => counts.replies > 0);
      } catch {
        return false;
      }
    },
    [postId, replyIdsDependencyKey],
    false,
  );

  return {
    replyIds,
    totalCount: adjustedTotalCount,
    hasMore,
    showAll,
    isExpandingAll,
    expandAll,
    loading,
    hasAnyNestedReplies: hasAnyNestedReplies ?? false,
  };
}
