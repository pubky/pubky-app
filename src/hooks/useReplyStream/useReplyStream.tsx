'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as Core from '@/core';
import * as Config from '@/config';
import * as Libs from '@/libs';
// Direct imports to avoid circular dependency (this hook is exported from @/hooks)
import { useMutedUsers } from '@/hooks/useMutedUsers';
import { usePostCounts } from '@/hooks/usePostCounts';
import { MAX_EXPAND_PAGES } from './useReplyStream.constants';
import type { UseReplyStreamOptions, UseReplyStreamResult } from './useReplyStream.types';

/**
 * Shared base hook for fetching and displaying reply streams.
 *
 * Encapsulates the common logic used by both `useThreadReplies` (Level 1)
 * and `useNestedReplies` (Level 2):
 * - Reads reply IDs from the local stream cache via `useLiveQuery`
 * - Fetches from Nexus when the local cache is insufficient
 * - Provides `expandAll()` for paginated fetch of all remaining replies
 * - Tracks muted user filtering and adjusts counts accordingly
 *
 * @param postId - The composite post ID to get replies for
 * @param options - Configuration options
 * @returns Reply IDs, counts, show-more state, and expand function
 */
export function useReplyStream(
  postId: string | null | undefined,
  options: UseReplyStreamOptions,
): UseReplyStreamResult {
  const { maxReplies, enabled = true } = options;

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

  const { mutedUserIdSet } = useMutedUsers();
  const { postCounts } = usePostCounts(enabled ? postId : null);
  const totalReplyCount = postCounts?.replies ?? 0;

  // Get replies from local cache (chronological order - oldest first)
  const replyIds = useLiveQuery(
    async () => {
      try {
        if (!postId || !enabled) return [];

        const streamId = Core.buildPostReplyStreamId(postId);
        const stream = await Core.LocalStreamPostsService.read({ streamId });

        if (!stream || stream.stream.length === 0) return [];

        // Stream is stored newest-first, reverse for chronological
        const chronological = [...stream.stream].reverse();
        // ADR-0004 temporary exception:
        // We currently use MuteFilter directly from UI hooks for pure post-ID filtering.
        // A follow-up should move this behind a controller/pipes facade.
        const filtered = Core.MuteFilter.filterPostsSafe(chronological, mutedUserIdSet);
        return showAll ? filtered : filtered.slice(0, maxReplies);
      } catch (error) {
        Libs.Logger.error('[useReplyStream] Failed to query replies', { postId, error });
        return [];
      }
    },
    [postId, maxReplies, mutedUserIdSet, showAll, enabled],
    [],
  );

  // Track muted replies count to adjust "show more" counter
  const mutedRepliesCount = useLiveQuery(
    async () => {
      if (!postId || !enabled) return 0;
      if (mutedUserIdSet.size === 0) return 0;
      const streamId = Core.buildPostReplyStreamId(postId);
      const stream = await Core.LocalStreamPostsService.read({ streamId });
      if (!stream || stream.stream.length === 0) return 0;
      return stream.stream.filter((id) => Core.MuteFilter.isPostMuted(id, mutedUserIdSet)).length;
    },
    [postId, mutedUserIdSet, enabled],
    0,
  );

  // Fetch initial replies from Nexus if not enough are cached locally.
  // `hasFetched` is the primary guard against re-fetch loops; `replyIds.length`
  // is secondary and only used to skip the fetch when local data already suffices.
  useEffect(() => {
    if (!postId || !enabled) return;
    if (hasFetched) return;
    if (totalReplyCount === 0) return;
    if (replyIds.length >= Math.min(maxReplies, totalReplyCount)) return;

    let isCancelled = false;

    const fetchReplies = async () => {
      try {
        const streamId = Core.buildPostReplyStreamId(postId);

        await Core.StreamPostsController.getOrFetchStreamSlice({
          streamId,
          streamTail: 0,
          lastPostId: undefined,
          limit: maxReplies,
          order: Core.StreamOrder.ASCENDING,
        });

        if (!isCancelled) {
          setHasFetched(true);
        }
      } catch (error) {
        Libs.Logger.error('[useReplyStream] Failed to fetch replies:', error);
        if (!isCancelled) {
          setHasFetched(true);
        }
      }
    };

    fetchReplies();

    return () => {
      isCancelled = true;
    };
  }, [postId, totalReplyCount, replyIds.length, maxReplies, hasFetched, enabled]);

  // Ref to prevent concurrent expandAll calls
  const isFetchingAllRef = useRef(false);

  /**
   * Expand to show all remaining replies inline.
   *
   * Fetches all replies using paginated requests to handle cases where the
   * Nexus API returns fewer items than requested due to server-side page limits.
   */
  const expandAll = useCallback(async () => {
    if (!postId || streamExhausted || isFetchingAllRef.current) return;
    isFetchingAllRef.current = true;
    setIsExpandingAll(true);
    setShowAll(true);
    let completed = false;
    let reachedEnd = false;

    try {
      const streamId = Core.buildPostReplyStreamId(postId);
      const pageSize = Config.NEXUS_POSTS_PER_PAGE;
      let cursor = 0;
      let pagesLoaded = 0;

      // Fetch pages until we reach the end of the stream
      while (pagesLoaded < MAX_EXPAND_PAGES) {
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
      Libs.Logger.error('[useReplyStream] Failed to fetch all replies:', error);
    } finally {
      isFetchingAllRef.current = false;
      if (isMountedRef.current) {
        setIsExpandingAll(false);
      }
    }
    if (!isMountedRef.current || !completed) return;
    setStreamExhausted(reachedEnd);
  }, [postId, streamExhausted]);

  // Reactively prune muted replies
  const adjustedTotalCount = Math.max(0, totalReplyCount - mutedRepliesCount);
  // Don't show "+N more" if we've already exhausted the Nexus stream
  // (postCounts.replies may include deleted replies that Nexus no longer returns)
  const hasMore = !streamExhausted && adjustedTotalCount > replyIds.length;
  const loading = !hasFetched && totalReplyCount > 0 && replyIds.length === 0;

  return {
    replyIds,
    adjustedTotalCount,
    hasMore,
    showAll,
    isExpandingAll,
    expandAll,
    loading,
  };
}
