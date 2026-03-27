'use client';

// Direct import to avoid circular dependency (this hook is exported from @/hooks)
import { useReplyStream } from '@/hooks/useReplyStream/useReplyStream';
import { DEFAULT_MAX_NESTED, DEFAULT_MAX_DEPTH } from './useNestedReplies.constants';
import type { UseNestedRepliesOptions, UseNestedRepliesResult } from './useNestedReplies.types';

/**
 * Hook for fetching and displaying nested replies for a post.
 *
 * This hook:
 * - Delegates core reply stream logic to `useReplyStream`
 * - Adds depth gating: disables fetching when `depth >= maxDepth`
 * - Returns replies in chronological order (oldest first)
 *
 * @param replyId - The composite post ID to get nested replies for
 * @param options - Configuration options
 * @returns Nested reply IDs, counts, and status flags
 *
 * @example
 * ```tsx
 * const { nestedReplyIds, hasMoreReplies, replyCount } = useNestedReplies(postId, {
 *   maxNestedReplies: 3,
 *   depth: 0,
 *   maxDepth: 1
 * });
 * ```
 */
export function useNestedReplies(
  replyId: string | null | undefined,
  options: UseNestedRepliesOptions = {},
): UseNestedRepliesResult {
  const { maxNestedReplies = DEFAULT_MAX_NESTED, depth = 0, maxDepth = DEFAULT_MAX_DEPTH } = options;

  const enabled = depth < maxDepth;

  const { replyIds, adjustedTotalCount, hasMore, showAll, isExpandingAll, expandAll } = useReplyStream(replyId, {
    maxReplies: maxNestedReplies,
    enabled,
  });

  return {
    nestedReplyIds: replyIds,
    hasMoreReplies: hasMore,
    hasNestedReplies: replyIds.length > 0,
    replyCount: adjustedTotalCount,
    showAll,
    isExpandingAll,
    expandAll,
  };
}
