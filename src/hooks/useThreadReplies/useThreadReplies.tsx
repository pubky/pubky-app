'use client';

import { useReplyStream } from '@/hooks/useReplyStream/useReplyStream';
import { DEFAULT_MAX_THREAD_REPLIES } from './useThreadReplies.constants';
import type { UseThreadRepliesOptions, UseThreadRepliesResult } from './useThreadReplies.types';

/**
 * Hook for fetching Level 1 replies with a max-3 + show-more pattern.
 *
 * Delegates core reply stream logic to `useReplyStream`.
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

  const { replyIds, adjustedTotalCount, hasMore, showAll, isExpandingAll, expandAll } = useReplyStream(postId, {
    maxReplies,
  });

  return {
    replyIds,
    totalCount: adjustedTotalCount,
    hasMore,
    showAll,
    isExpandingAll,
    expandAll,
  };
}
