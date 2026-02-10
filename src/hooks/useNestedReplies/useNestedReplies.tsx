'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as Core from '@/core';
import * as Config from '@/config';
import * as Libs from '@/libs';
// Direct imports to avoid circular dependency (this hook is exported from @/hooks)
import { useMutedUsers } from '@/hooks/useMutedUsers';
import { usePostCounts } from '@/hooks/usePostCounts';
import { DEFAULT_MAX_NESTED, DEFAULT_MAX_DEPTH } from './useNestedReplies.constants';
import type { UseNestedRepliesOptions, UseNestedRepliesResult } from './useNestedReplies.types';

/**
 * Hook for fetching and displaying nested replies for a post.
 *
 * This hook:
 * - Gets reply count from local cache (with live updates)
 * - Gets nested reply IDs from local stream cache (with live updates)
 * - Fetches from Nexus if replies exist but aren't cached locally
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

  const [hasFetched, setHasFetched] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [streamExhausted, setStreamExhausted] = useState(false);
  const [isExpandingAll, setIsExpandingAll] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Mute filtering for nested replies.
   * This ensures nested reply previews are consistent with timeline mute behavior.
   */
  const { mutedUserIdSet } = useMutedUsers();

  // Get post counts to check reply count
  const { postCounts } = usePostCounts(depth < maxDepth ? replyId : null);
  const replyCount = postCounts?.replies ?? 0;

  // Get nested replies from local cache (chronological order - oldest first).
  // When showAll is true, return all cached replies instead of slicing to max.
  const nestedReplyIds = useLiveQuery(
    async () => {
      try {
        if (!replyId || depth >= maxDepth) return [];

        const streamId = Core.buildPostReplyStreamId(replyId);
        const stream = await Core.LocalStreamPostsService.read({ streamId });

        if (!stream || stream.stream.length === 0) return [];

        // Stream is stored newest-first, reverse for chronological
        // Apply mute filter so nested previews match timeline mute behavior.
        // ADR-0004 temporary exception:
        // We currently use MuteFilter directly from UI hooks for pure post-ID filtering.
        // A follow-up should move this behind a controller/pipes facade.
        const chronological = [...stream.stream].reverse();
        const filtered = Core.MuteFilter.filterPostsSafe(chronological, mutedUserIdSet);
        return showAll ? filtered : filtered.slice(0, maxNestedReplies);
      } catch (error) {
        Libs.Logger.error('[useNestedReplies] Failed to query nested replies', { replyId, error });
        return [];
      }
    },
    [replyId, maxNestedReplies, depth, maxDepth, mutedUserIdSet, showAll],
    [],
  );

  /**
   * Track muted replies count to adjust "View more replies" counter.
   * This ensures the UI shows accurate counts excluding muted users.
   */
  const mutedRepliesCount = useLiveQuery(
    async () => {
      if (!replyId) return 0;
      if (mutedUserIdSet.size === 0) return 0;
      const streamId = Core.buildPostReplyStreamId(replyId);
      const stream = await Core.LocalStreamPostsService.read({ streamId });
      if (!stream || stream.stream.length === 0) return 0;
      // Count how many replies are from muted users
      return stream.stream.filter((id) => Core.MuteFilter.isPostMuted(id, mutedUserIdSet)).length;
    },
    [replyId, mutedUserIdSet],
    0,
  );

  // Fetch from Nexus if post has replies but we don't have them locally
  useEffect(() => {
    if (!replyId) return;
    if (depth >= maxDepth) return;
    if (hasFetched) return;
    if (replyCount === 0) return;
    // Only skip if we already have enough items for the initial display
    if (nestedReplyIds.length >= Math.min(maxNestedReplies, replyCount)) return;

    let isCancelled = false;

    const fetchNestedReplies = async () => {
      try {
        const streamId = Core.buildPostReplyStreamId(replyId);

        // Fetch from Nexus in ascending order (oldest first)
        await Core.StreamPostsController.getOrFetchStreamSlice({
          streamId,
          streamTail: 0,
          lastPostId: undefined,
          limit: maxNestedReplies,
          order: Core.StreamOrder.ASCENDING,
        });

        if (!isCancelled) {
          setHasFetched(true);
        }
      } catch (error) {
        Libs.Logger.error('Failed to fetch nested replies:', error);
        // Silently fail - nested replies are optional
        if (!isCancelled) {
          setHasFetched(true);
        }
      }
    };

    fetchNestedReplies();

    return () => {
      isCancelled = true;
    };
  }, [replyId, replyCount, nestedReplyIds.length, depth, maxDepth, maxNestedReplies, hasFetched]);

  // Ref to prevent concurrent expandAll calls
  const isFetchingAllRef = useRef(false);

  /**
   * Expand to show all remaining nested replies inline.
   *
   * Fetches all replies using paginated requests to handle cases where the
   * Nexus API returns fewer items than requested due to server-side page limits.
   * Sets showAll to true so the live query returns all cached replies.
   */
  const expandAll = useCallback(async () => {
    if (!replyId || streamExhausted || isExpandingAll || isFetchingAllRef.current) return;
    isFetchingAllRef.current = true;
    setIsExpandingAll(true);
    setShowAll(true);
    let completed = false;
    let reachedEnd = false;

    try {
      const streamId = Core.buildPostReplyStreamId(replyId);
      const pageSize = Config.NEXUS_POSTS_PER_PAGE;
      let cursor = 0;

      // Safety limit to prevent infinite loops (e.g., 20 pages × 10 items = 200 max replies)
      const MAX_PAGES = 20;
      let pagesLoaded = 0;

      // Fetch pages until we reach the end of the stream
      while (pagesLoaded < MAX_PAGES) {
        pagesLoaded++;

        const result = await Core.StreamPostsController.getOrFetchStreamSlice({
          streamId,
          streamTail: cursor,
          lastPostId: undefined,
          limit: pageSize,
          order: Core.StreamOrder.ASCENDING,
        });

        if (result.reachedEnd) {
          reachedEnd = true;
          break;
        }

        // If fewer items than page size, we've exhausted the stream
        if (result.nextPageIds.length < pageSize) {
          reachedEnd = true;
          break;
        }

        // Advance cursor using the timestamp from this page
        if (result.timestamp && result.timestamp !== cursor) {
          cursor = result.timestamp;
        } else {
          reachedEnd = true;
          break; // No cursor advancement — stop to avoid infinite loop
        }
      }

      completed = true;
    } catch (error) {
      Libs.Logger.error('[useNestedReplies] Failed to fetch all nested replies:', error);
    } finally {
      isFetchingAllRef.current = false;
      if (isMountedRef.current) {
        setIsExpandingAll(false);
      }
    }
    if (!isMountedRef.current || !completed) return;
    setStreamExhausted(reachedEnd);
  }, [isExpandingAll, replyId, streamExhausted]);

  // Use adjusted count so "View more replies" excludes muted users.
  const adjustedReplyCount = Math.max(0, replyCount - mutedRepliesCount);
  // Don't show "+N more" if we've already exhausted the Nexus stream
  // (postCounts.replies may include deleted replies that Nexus no longer returns)
  const hasMoreReplies = !streamExhausted && adjustedReplyCount > nestedReplyIds.length;
  const hasNestedReplies = nestedReplyIds.length > 0;

  return {
    nestedReplyIds,
    hasMoreReplies,
    hasNestedReplies,
    replyCount: adjustedReplyCount,
    showAll,
    isExpandingAll,
    expandAll,
  };
}
