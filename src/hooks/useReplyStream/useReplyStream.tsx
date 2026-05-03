'use client';

import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { NEXUS_POSTS_PER_PAGE } from '@/config/nexus';
import { useMutedUsers } from '@/hooks/useMutedUsers/useMutedUsers';
import { usePostCounts } from '@/hooks/usePostCounts/usePostCounts';
import { MAX_EXPAND_PAGES } from './useReplyStream.constants';
import type { UseReplyStreamOptions, UseReplyStreamResult } from './useReplyStream.types';
import { Logger } from '@/libs/logger/logger';
import { MuteFilter } from '@/application/stream/posts/muting/mute-filter';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import { buildPostReplyStreamId } from '@/models/stream/post/postStream.types';
import { StreamOrder } from '@/services/nexus/stream/posts/postStream.types';
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
  const isFetchingAllRef = useRef(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Reset all local state when postId changes so stale flags from a
  // previous post don't leak into the new one (defensive — the primary
  // fix is key={postId} on <ThreadTree />, but this covers standalone usage).
  useEffect(() => {
    setHasFetched(false);
    setShowAll(false);
    setStreamExhausted(false);
    setIsExpandingAll(false);
    isFetchingAllRef.current = false;
  }, [postId]);

  const { mutedUserIdSet } = useMutedUsers();
  const { postCounts } = usePostCounts(enabled ? postId : null);
  const totalReplyCount = postCounts?.replies ?? 0;

  // Get replies and muted count from local cache in a single read.
  // Stream is stored newest-first; we reverse for chronological display.
  // ADR-0004 temporary exception:
  // We currently use MuteFilter directly from UI hooks for pure post-ID filtering.
  // A follow-up should move this behind a controller/pipes facade.
  const { replyIds, mutedRepliesCount, localTotalCount } = useLiveQuery(
    async () => {
      try {
        if (!postId || !enabled) return { replyIds: [], mutedRepliesCount: 0, localTotalCount: 0 };

        const streamId = buildPostReplyStreamId(postId);
        const stream = await StreamPostsController.getLocalStream({ streamId });

        if (!stream || stream.stream.length === 0) return { replyIds: [], mutedRepliesCount: 0, localTotalCount: 0 };

        const chronological = [...stream.stream].reverse();
        const filtered = MuteFilter.filterPostsSafe(chronological, mutedUserIdSet);
        const mutedCount = chronological.length - filtered.length;

        return {
          replyIds: showAll ? filtered : filtered.slice(0, maxReplies),
          mutedRepliesCount: mutedCount,
          localTotalCount: filtered.length,
        };
      } catch (error) {
        Logger.error('[useReplyStream] Failed to query replies', { postId, error });
        return { replyIds: [], mutedRepliesCount: 0, localTotalCount: 0 };
      }
    },
    [postId, maxReplies, mutedUserIdSet, showAll, enabled],
    { replyIds: [], mutedRepliesCount: 0, localTotalCount: 0 },
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
        const streamId = buildPostReplyStreamId(postId);

        await StreamPostsController.getOrFetchStreamSlice({
          streamId,
          streamTail: 0,
          lastPostId: undefined,
          limit: maxReplies,
          order: StreamOrder.ASCENDING,
        });

        if (!isCancelled) {
          setHasFetched(true);
        }
      } catch (error) {
        Logger.error('[useReplyStream] Failed to fetch replies:', error);
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

  /**
   * Expand to show all remaining replies inline.
   *
   * Fetches all replies using paginated requests to handle cases where the
   * Nexus API returns fewer items than requested due to server-side page limits.
   */
  async function expandAll() {
    if (!postId || streamExhausted || isFetchingAllRef.current) return;
    isFetchingAllRef.current = true;
    setIsExpandingAll(true);
    setShowAll(true);
    let completed = false;
    let reachedEnd = false;

    try {
      const streamId = buildPostReplyStreamId(postId);
      const pageSize = NEXUS_POSTS_PER_PAGE;
      let cursor = 0;
      let pagesLoaded = 0;

      // Fetch pages until we reach the end of the stream
      while (pagesLoaded < MAX_EXPAND_PAGES) {
        pagesLoaded++;

        const result = await StreamPostsController.getOrFetchStreamSlice({
          streamId,
          streamTail: cursor,
          lastPostId: undefined,
          limit: pageSize,
          order: StreamOrder.ASCENDING,
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
      Logger.error('[useReplyStream] Failed to fetch all replies:', error);
    } finally {
      isFetchingAllRef.current = false;
      if (isMountedRef.current) {
        setIsExpandingAll(false);
      }
    }
    if (!isMountedRef.current || !completed) return;
    setStreamExhausted(reachedEnd);
  }

  // Reactively prune muted replies.
  // Use the higher of server count vs local cache count — postCounts can be stale
  // (e.g. new replies added since last count sync).
  const serverAdjusted = Math.max(0, totalReplyCount - mutedRepliesCount);
  const adjustedTotalCount = Math.max(serverAdjusted, localTotalCount);
  // Don't show "+N more" if we've already exhausted the Nexus stream
  // (postCounts.replies may include deleted replies that Nexus no longer returns)
  const hasMore = !streamExhausted && adjustedTotalCount > replyIds.length;

  return {
    replyIds,
    adjustedTotalCount,
    hasMore,
    showAll,
    isExpandingAll,
    expandAll,
  };
}
