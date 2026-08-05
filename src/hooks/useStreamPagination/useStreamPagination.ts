'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { NEXUS_POSTS_PER_PAGE } from '@/config/nexus';
import { NOT_FOUND_CACHED_STREAM } from '@/controllers/stream/posts/post.constants';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import type { TReadPostStreamChunkResponse } from '@/controllers/stream/posts/posts.types';
import { resolveResumeAnchor } from '@/controllers/stream/posts/posts.utils';
import { isAppError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import { isCollectionItemsStream, isSkipPaginatedStream } from '@/models/stream/post/postStream.types';
import { sortPostIdsByTimestamp } from '@/utils/sorting';
import type { UseStreamPaginationOptions, UseStreamPaginationResult } from './useStreamPagination.types';

function resolveDisplayedPostIds(
  streamPostIds: string[],
  optimisticPostIds: string[],
  hiddenPostIds = new Set<string>(),
) {
  const streamPostIdsSet = new Set(streamPostIds);
  const filteredOptimisticPostIds = optimisticPostIds.filter((id) => !streamPostIdsSet.has(id));

  return {
    optimisticPostIds: filteredOptimisticPostIds,
    displayedPostIds: [
      ...filteredOptimisticPostIds.filter((id) => !hiddenPostIds.has(id)),
      ...streamPostIds.filter((id) => !hiddenPostIds.has(id)),
    ],
  };
}

function decrementHiddenPostCounts(hiddenPostCounts: Map<string, number>, postIds: string[]) {
  postIds.forEach((id) => {
    const removalCount = hiddenPostCounts.get(id);
    if (removalCount === undefined) return;
    if (removalCount === 1) {
      hiddenPostCounts.delete(id);
    } else {
      hiddenPostCounts.set(id, removalCount - 1);
    }
  });
}

function revealPostIds(
  postIds: string[],
  hiddenPostCounts: Map<string, number>,
  streamPostIds: string[],
  optimisticPostIds: string[],
) {
  const revealedPostIds = new Set(postIds.filter((id) => hiddenPostCounts.delete(id)));
  if (revealedPostIds.size === 0) {
    return { streamPostIds, optimisticPostIds };
  }

  return {
    streamPostIds: streamPostIds.filter((id) => !revealedPostIds.has(id)),
    optimisticPostIds: optimisticPostIds.filter((id) => !revealedPostIds.has(id)),
  };
}

/**
 * useStreamPagination
 *
 * Shared hook for managing stream pagination state and logic.
 * Handles initial load, infinite scroll pagination, and state management.
 */
export function useStreamPagination({
  streamId,
  limit = NEXUS_POSTS_PER_PAGE,
  resetOnStreamChange = true,
  onError,
}: UseStreamPaginationOptions): UseStreamPaginationResult {
  const [postIds, setPostIds] = useState<string[]>([]);
  const [lastPostId, setLastPostId] = useState<string | undefined>(undefined);
  const [streamTail, setStreamTail] = useState<number>(NOT_FOUND_CACHED_STREAM);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const postIdsRef = useRef<string[]>([]);
  const optimisticPostIdsRef = useRef<string[]>([]);
  const hiddenPostCountsRef = useRef<Map<string, number>>(new Map());
  // Cumulative count of committed-removal stream rows on skip-paginated
  // streams. `setStreamTail(result.nextCursor)` is an absolute write derived
  // from the offset captured when the request STARTED, so a commit landing
  // while a fetch is in flight would be silently overwritten. Each fetch
  // snapshots this counter at entry and subtracts whatever accrued during its
  // flight from the cursor it writes back. Reset in `clearState` (a fresh
  // fetch recounts consumed rows from scratch).
  const committedRemovalsRef = useRef(0);
  const activeStreamIdRef = useRef(streamId);
  activeStreamIdRef.current = streamId;

  /**
   * Sets the appropriate loading state based on load type
   */
  const setLoadingState = useCallback((isInitialLoad: boolean, isLoading: boolean) => {
    if (isInitialLoad) {
      setLoading(isLoading);
    } else {
      setLoadingMore(isLoading);
    }
  }, []);

  /**
   * Fetches a slice from the stream
   */
  const fetchStreamSlice = useCallback(
    async (isInitialLoad: boolean) => {
      setLoadingState(isInitialLoad, true);
      setError(null);
      const committedRemovalsAtRequest = committedRemovalsRef.current;

      try {
        let result: TReadPostStreamChunkResponse;
        // Always resume from `streamTail`; never recompute the cursor from the visible count.

        if (isInitialLoad) {
          // Prepare stream for initial load: clear stale cache, merge unread posts, clear unread stream
          await StreamPostsController.prepareStreamForInitialLoad({ streamId });

          const cachedLastPostTimestamp = await StreamPostsController.getCachedLastPostTimestamp({ streamId });
          setStreamTail(cachedLastPostTimestamp);

          result = await StreamPostsController.getOrFetchStreamSlice({
            streamId,
            lastPostId: undefined,
            // Skip streams always start at offset 0; score streams seed from the cached tail.
            streamTail: isSkipPaginatedStream(streamId) ? 0 : cachedLastPostTimestamp,
            limit,
          });
        } else {
          result = await StreamPostsController.getOrFetchStreamSlice({
            streamId,
            lastPostId,
            streamTail,
            limit,
          });
        }

        // Advance BOTH resume cursors from the response, even on a fully-filtered (empty)
        // page: `streamTail` by the raw backend cursor, `lastPostId` (the local cache-walk
        // anchor) by the raw scan anchor. Both advance by raw scanned data, never by the
        // post-filter visible count — otherwise a fully-filtered round would restart the
        // cache walk at the head and spin in place on long filtered runs.
        if (result.nextCursor != null) {
          // Skip streams: `nextCursor` extends the offset this request captured
          // at start, so removals committed during the flight are not in it —
          // re-apply them or the absolute write below would discard their
          // decrements. Clamped: a `clearState` during the flight resets the
          // counter, and a stale resolution must not over-correct a fresh one.
          const removalsDuringFlight = isSkipPaginatedStream(streamId)
            ? Math.max(0, committedRemovalsRef.current - committedRemovalsAtRequest)
            : 0;
          setStreamTail(Math.max(0, result.nextCursor - removalsDuringFlight));
        }

        // Never overwrite a defined anchor with undefined.
        const nextAnchor = resolveResumeAnchor(result);
        if (nextAnchor !== undefined) {
          setLastPostId(nextAnchor);
        }

        // hasMore reflects the stream end, not the filtered count: a mute/filter-emptied page
        // keeps hasMore so the advanced cursors are re-requested. An auto-loading caller
        // (useInfiniteScroll) still chains bounded rounds through a filtered region until the
        // true stream end, with no per-user-action feedback. Known limitation, deliberately
        // unchanged here — any remedy (toast + backoff, manual load-more) is a
        // product-visible UX change tracked as follow-up.
        if (result.nextPageIds.length === 0) {
          setHasMore(!result.reachedEnd);
          setLoadingState(isInitialLoad, false);
          return;
        }

        // Deduplicate posts
        const existingIds = new Set(postIdsRef.current);
        const newUniquePostIds = result.nextPageIds.filter((id) => !existingIds.has(id));

        setHasMore(result.reachedEnd !== true);

        // If all posts were duplicates, don't update the UI but keep hasMore state
        if (newUniquePostIds.length === 0) {
          setLoadingState(isInitialLoad, false);
          return;
        }

        // Update state with unique posts only
        const updatedPostIds = isInitialLoad ? newUniquePostIds : [...postIdsRef.current, ...newUniquePostIds];
        postIdsRef.current = updatedPostIds;
        const displayedState = resolveDisplayedPostIds(
          updatedPostIds,
          optimisticPostIdsRef.current,
          new Set(hiddenPostCountsRef.current.keys()),
        );
        optimisticPostIdsRef.current = displayedState.optimisticPostIds;
        setPostIds(displayedState.displayedPostIds);
      } catch (err) {
        const errorMessage = isAppError(err) ? err.message : 'An unknown error occurred.';
        setError(errorMessage);
        setHasMore(false);
        Logger.error('Failed to fetch stream slice:', err);
        onError?.(err);
      } finally {
        setLoadingState(isInitialLoad, false);
      }
    },
    [streamId, lastPostId, streamTail, limit, setLoadingState, onError],
  );

  /**
   * Clears all state
   */
  const clearState = useCallback(({ preserveOptimisticPostIds = false, preserveHiddenPostIds = false } = {}) => {
    postIdsRef.current = [];
    if (!preserveHiddenPostIds) {
      hiddenPostCountsRef.current.clear();
    }
    if (!preserveOptimisticPostIds) {
      optimisticPostIdsRef.current = [];
    }
    const displayedState = resolveDisplayedPostIds(
      postIdsRef.current,
      optimisticPostIdsRef.current,
      new Set(hiddenPostCountsRef.current.keys()),
    );
    optimisticPostIdsRef.current = displayedState.optimisticPostIds;
    setPostIds(displayedState.displayedPostIds);
    setLastPostId(undefined);
    setStreamTail(0);
    committedRemovalsRef.current = 0;
    setHasMore(true);
    setError(null);
  }, []);

  /**
   * Refresh function - clears state and fetches from beginning
   */
  const refresh = useCallback(async () => {
    clearState({
      preserveOptimisticPostIds: isCollectionItemsStream(streamId),
      preserveHiddenPostIds: true,
    });
    await fetchStreamSlice(true);
  }, [clearState, fetchStreamSlice, streamId]);

  /**
   * Load more function - fetches next page
   */
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    await fetchStreamSlice(false);
  }, [loadingMore, hasMore, fetchStreamSlice]);

  /**
   * Add post(s) to the timeline, sorted by timestamp
   * Maintains chronological order (most recent first) when adding posts
   * @param postIds - A single post ID or array of post IDs to add
   */
  const prependPosts = useCallback(async (postIds: string | string[]) => {
    const idsToAdd = Array.isArray(postIds) ? postIds : [postIds];
    const revealedState = revealPostIds(
      idsToAdd,
      hiddenPostCountsRef.current,
      postIdsRef.current,
      optimisticPostIdsRef.current,
    );
    postIdsRef.current = revealedState.streamPostIds;
    optimisticPostIdsRef.current = revealedState.optimisticPostIds;

    // Filter out posts that already exist to avoid duplicates
    const existingIds = new Set(postIdsRef.current);
    const newIds = idsToAdd.filter((id) => !existingIds.has(id));

    if (newIds.length === 0) {
      return;
    }

    // Combine new and existing posts
    const allIds = [...newIds, ...postIdsRef.current];

    try {
      // Fetch post details to get timestamps and sort
      const sortedIds = await sortPostIdsByTimestamp(allIds);
      postIdsRef.current = sortedIds;
      const displayedState = resolveDisplayedPostIds(
        sortedIds,
        optimisticPostIdsRef.current,
        new Set(hiddenPostCountsRef.current.keys()),
      );
      optimisticPostIdsRef.current = displayedState.optimisticPostIds;
      setPostIds(displayedState.displayedPostIds);
    } catch (err) {
      Logger.error('Failed to prepend posts:', err);
      // Fallback: add without sorting
      postIdsRef.current = allIds;
      const displayedState = resolveDisplayedPostIds(
        allIds,
        optimisticPostIdsRef.current,
        new Set(hiddenPostCountsRef.current.keys()),
      );
      optimisticPostIdsRef.current = displayedState.optimisticPostIds;
      setPostIds(displayedState.displayedPostIds);
    }
  }, []);

  /**
   * Show membership-ordered posts at the top without changing pagination state.
   * Bookmarks and single collections have their own membership order, which can
   * differ from the post's `indexed_at` timestamp used by regular timelines.
   */
  const prependOptimisticPosts = (postIds: string | string[]) => {
    const idsToAdd = Array.isArray(postIds) ? postIds : [postIds];
    const revealedState = revealPostIds(
      idsToAdd,
      hiddenPostCountsRef.current,
      postIdsRef.current,
      optimisticPostIdsRef.current,
    );
    postIdsRef.current = revealedState.streamPostIds;
    optimisticPostIdsRef.current = revealedState.optimisticPostIds;
    const currentDisplayedIds = new Set([...optimisticPostIdsRef.current, ...postIdsRef.current]);
    const newIds = idsToAdd.filter((id) => {
      if (currentDisplayedIds.has(id)) {
        return false;
      }

      currentDisplayedIds.add(id);
      return true;
    });

    if (newIds.length === 0) {
      return;
    }

    const optimisticPostIds = [...newIds, ...optimisticPostIdsRef.current];
    const displayedState = resolveDisplayedPostIds(
      postIdsRef.current,
      optimisticPostIds,
      new Set(hiddenPostCountsRef.current.keys()),
    );
    optimisticPostIdsRef.current = displayedState.optimisticPostIds;
    setPostIds(displayedState.displayedPostIds);
  };

  /**
   * Remove post(s) from the timeline
   * Used when posts are deleted to immediately remove them from the UI
   * @param postIds - A single post ID or array of post IDs to remove
   */
  const removePosts = useCallback((postIds: string | string[]) => {
    const existingPostIds = new Set([...postIdsRef.current, ...optimisticPostIdsRef.current]);
    const idsToRemove = [...new Set(Array.isArray(postIds) ? postIds : [postIds])].filter((id) =>
      existingPostIds.has(id),
    );
    const idsToRemoveSet = new Set(idsToRemove);
    idsToRemove.forEach((id) => hiddenPostCountsRef.current.delete(id));
    optimisticPostIdsRef.current = optimisticPostIdsRef.current.filter((id) => !idsToRemoveSet.has(id));
    postIdsRef.current = postIdsRef.current.filter((id) => !idsToRemoveSet.has(id));
    const displayedState = resolveDisplayedPostIds(
      postIdsRef.current,
      optimisticPostIdsRef.current,
      new Set(hiddenPostCountsRef.current.keys()),
    );
    optimisticPostIdsRef.current = displayedState.optimisticPostIds;
    setPostIds(displayedState.displayedPostIds);
  }, []);

  const removePostsOptimistically = (postIds: string | string[]) => {
    const existingPostIds = new Set([...postIdsRef.current, ...optimisticPostIdsRef.current]);
    const idsToRemove = [...new Set(Array.isArray(postIds) ? postIds : [postIds])].filter((id) =>
      existingPostIds.has(id),
    );
    const removalStreamId = streamId;
    idsToRemove.forEach((id) => {
      hiddenPostCountsRef.current.set(id, (hiddenPostCountsRef.current.get(id) ?? 0) + 1);
    });
    const updateDisplayedPosts = () => {
      const displayedState = resolveDisplayedPostIds(
        postIdsRef.current,
        optimisticPostIdsRef.current,
        new Set(hiddenPostCountsRef.current.keys()),
      );
      optimisticPostIdsRef.current = displayedState.optimisticPostIds;
      setPostIds(displayedState.displayedPostIds);
    };
    updateDisplayedPosts();

    let hasFinalized = false;
    const finalize = (shouldCommit: boolean) => {
      if (hasFinalized || activeStreamIdRef.current !== removalStreamId) return;
      hasFinalized = true;

      decrementHiddenPostCounts(hiddenPostCountsRef.current, idsToRemove);
      if (shouldCommit) {
        const idsToRemoveSet = new Set(idsToRemove);
        if (isSkipPaginatedStream(removalStreamId)) {
          // Skip streams resume from a consumed-raw-rows offset. A committed
          // removal deletes one of those rows server-side, shifting every
          // later index down — so drop the removed stream rows from the
          // offset too, or the next loadMore skips one live row per removal
          // once the backend reindexes the shorter list. Membership is
          // checked at commit time: rows refetched after a refresh are
          // already recounted in the new offset, and optimistic prepends
          // never counted toward it.
          const removedStreamRowCount = postIdsRef.current.filter((id) => idsToRemoveSet.has(id)).length;
          if (removedStreamRowCount > 0) {
            // Also tallied in committedRemovalsRef so an in-flight fetch can
            // re-apply this decrement to the absolute cursor it writes back.
            committedRemovalsRef.current += removedStreamRowCount;
            setStreamTail((tail) => Math.max(0, tail - removedStreamRowCount));
          }
        }
        optimisticPostIdsRef.current = optimisticPostIdsRef.current.filter((id) => !idsToRemoveSet.has(id));
        postIdsRef.current = postIdsRef.current.filter((id) => !idsToRemoveSet.has(id));
      }
      updateDisplayedPosts();
    };

    return {
      commit: () => finalize(true),
      rollback: () => finalize(false),
    };
  };

  // Initial load and reset when streamId changes
  useEffect(() => {
    if (resetOnStreamChange) {
      clearState();
    }
    fetchStreamSlice(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId]);

  return {
    postIds,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
    prependPosts,
    prependOptimisticPosts,
    removePosts,
    removePostsOptimistically,
  };
}
