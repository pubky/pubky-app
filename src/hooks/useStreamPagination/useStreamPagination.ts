'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { NEXUS_POSTS_PER_PAGE } from '@/config/nexus';
import { NOT_FOUND_CACHED_STREAM } from '@/controllers/stream/posts/post.constants';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import type { TReadPostStreamChunkResponse } from '@/controllers/stream/posts/posts.types';
import { isAppError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import {
  isCollectionItemsStream,
  isSkipPaginatedStream,
  type PostStreamId,
} from '@/models/stream/post/postStream.types';
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

type ReplacementLoadMode = 'local_first' | 'network_refresh';

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
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const postIdsRef = useRef<string[]>([]);
  const optimisticPostIdsRef = useRef<string[]>([]);
  const hiddenPostCountsRef = useRef<Map<string, number>>(new Map());
  // Cumulative count of committed-removal stream rows on skip-paginated
  // streams. A page commit writes the cursor absolutely, derived from the
  // offset captured when the request STARTED, so a removal committing while a
  // fetch is in flight would be silently overwritten. Each request snapshots
  // this counter and the commit subtracts whatever accrued during the flight.
  const committedRemovalsRef = useRef(0);
  const lastPostIdRef = useRef<string | undefined>(undefined);
  const streamTailRef = useRef(NOT_FOUND_CACHED_STREAM);
  const hasMoreRef = useRef(true);
  const requestGenerationRef = useRef(0);
  const renderedStreamIdRef = useRef(streamId);
  const initializedStreamIdRef = useRef<PostStreamId | null>(null);
  const replacementOwnerRef = useRef<symbol | null>(null);
  const loadMoreOwnerRef = useRef<symbol | null>(null);
  renderedStreamIdRef.current = streamId;

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

  const setHasMoreState = useCallback((value: boolean) => {
    hasMoreRef.current = value;
    setHasMore(value);
  }, []);

  /**
   * Re-derives what the feed renders from the stream list, the optimistic list
   * and the pending-removal set. Every mutation ends here so a post hidden by
   * an in-flight removal can never be re-displayed by an unrelated update.
   */
  const syncDisplayedPosts = useCallback(() => {
    const displayedState = resolveDisplayedPostIds(
      postIdsRef.current,
      optimisticPostIdsRef.current,
      new Set(hiddenPostCountsRef.current.keys()),
    );
    optimisticPostIdsRef.current = displayedState.optimisticPostIds;
    setPostIds(displayedState.displayedPostIds);
  }, []);

  /**
   * Skip streams resume from a consumed-raw-rows offset, and a response's
   * `nextCursor` extends the offset its request captured at start — removals
   * committed mid-flight are not in it. Re-apply them, or the absolute write
   * discards their decrements and the next page skips one live row per
   * removal once the backend reindexes the shorter list. Clamped because a
   * `clearState` during the flight resets the tally, and a stale resolution
   * must not over-correct a fresh one.
   */
  const resolveStreamTailFromCursor = useCallback((nextCursor: number, committedRemovalsAtRequest: number) => {
    const removalsDuringFlight = isSkipPaginatedStream(renderedStreamIdRef.current)
      ? Math.max(0, committedRemovalsRef.current - committedRemovalsAtRequest)
      : 0;
    return Math.max(0, nextCursor - removalsDuringFlight);
  }, []);

  const isCurrentRequest = useCallback(
    (generation: number, requestStreamId: PostStreamId) =>
      requestGenerationRef.current === generation && renderedStreamIdRef.current === requestStreamId,
    [],
  );

  const commitPage = useCallback(
    (result: TReadPostStreamChunkResponse, isInitialLoad: boolean, committedRemovalsAtRequest: number) => {
      // Advance from the response even when stream filters remove the entire page.
      if (result.nextCursor != null) {
        streamTailRef.current = resolveStreamTailFromCursor(result.nextCursor, committedRemovalsAtRequest);
      }

      // Empty-but-not-ended pages keep pagination alive because the collector advanced
      // over raw backend data even though no visible posts survived filtering.
      if (result.nextPageIds.length === 0) {
        setHasMoreState(!result.reachedEnd);
        return;
      }

      const existingIds = new Set(postIdsRef.current);
      const newUniquePostIds = result.nextPageIds.filter((id) => !existingIds.has(id));
      lastPostIdRef.current = result.nextPageIds[result.nextPageIds.length - 1];
      setHasMoreState(result.reachedEnd !== true);

      if (newUniquePostIds.length === 0) return;

      postIdsRef.current = isInitialLoad ? newUniquePostIds : [...postIdsRef.current, ...newUniquePostIds];
      syncDisplayedPosts();
    },
    [resolveStreamTailFromCursor, setHasMoreState, syncDisplayedPosts],
  );

  const commitNetworkReplacement = useCallback(
    (result: TReadPostStreamChunkResponse, committedRemovalsAtRequest: number) => {
      const refreshedPostIds = Array.from(new Set(result.nextPageIds));
      postIdsRef.current = refreshedPostIds;
      lastPostIdRef.current = refreshedPostIds.at(-1);
      streamTailRef.current =
        result.nextCursor != null
          ? resolveStreamTailFromCursor(result.nextCursor, committedRemovalsAtRequest)
          : NOT_FOUND_CACHED_STREAM;
      // The replacement page recounts consumed rows from the top of the
      // stream, so every decrement up to now is already reflected in the
      // cursor just written — start the next flight's tally from scratch.
      committedRemovalsRef.current = 0;
      setHasMoreState(result.reachedEnd !== true);

      syncDisplayedPosts();
    },
    [resolveStreamTailFromCursor, setHasMoreState, syncDisplayedPosts],
  );

  /**
   * Clears all state
   */
  const clearState = useCallback(
    ({ preserveOptimisticPostIds = false, preserveHiddenPostIds = false } = {}) => {
      postIdsRef.current = [];
      if (!preserveHiddenPostIds) {
        hiddenPostCountsRef.current.clear();
      }
      if (!preserveOptimisticPostIds) {
        optimisticPostIdsRef.current = [];
      }
      syncDisplayedPosts();
      lastPostIdRef.current = undefined;
      streamTailRef.current = NOT_FOUND_CACHED_STREAM;
      committedRemovalsRef.current = 0;
      setHasMoreState(true);
      setError(null);
    },
    [setHasMoreState, syncDisplayedPosts],
  );

  const runReplacementLoad = useCallback(
    async ({
      mode,
      clearBeforeLoad = false,
      preserveOptimisticPostIds = false,
      preserveHiddenPostIds = false,
    }: {
      mode: ReplacementLoadMode;
      clearBeforeLoad?: boolean;
      preserveOptimisticPostIds?: boolean;
      preserveHiddenPostIds?: boolean;
    }) => {
      const requestStreamId = streamId;
      const owner = Symbol('stream-replacement');
      replacementOwnerRef.current = owner;
      loadMoreOwnerRef.current = null;
      setLoadingMore(false);

      if (clearBeforeLoad) {
        clearState({ preserveOptimisticPostIds, preserveHiddenPostIds });
      }

      const generation = ++requestGenerationRef.current;
      const committedRemovalsAtRequest = committedRemovalsRef.current;
      setLoadingState(true, true);
      setError(null);

      try {
        let result: TReadPostStreamChunkResponse;

        if (mode === 'network_refresh') {
          result = await StreamPostsController.refreshStreamSlice({ streamId: requestStreamId, limit });
        } else {
          await StreamPostsController.prepareStreamForInitialLoad({ streamId: requestStreamId });
          if (!isCurrentRequest(generation, requestStreamId)) return;

          const cachedTail = await StreamPostsController.getCachedLastPostTimestamp({ streamId: requestStreamId });
          if (!isCurrentRequest(generation, requestStreamId)) return;

          streamTailRef.current = cachedTail;
          result = await StreamPostsController.getOrFetchStreamSlice({
            streamId: requestStreamId,
            lastPostId: undefined,
            // Skip streams always start at offset 0; score streams seed from the cached tail.
            streamTail: isSkipPaginatedStream(requestStreamId) ? NOT_FOUND_CACHED_STREAM : cachedTail,
            limit,
          });
        }

        if (!isCurrentRequest(generation, requestStreamId)) return;

        if (mode === 'network_refresh') {
          commitNetworkReplacement(result, committedRemovalsAtRequest);
        } else {
          commitPage(result, true, committedRemovalsAtRequest);
        }
      } catch (err) {
        if (!isCurrentRequest(generation, requestStreamId)) return;

        const errorMessage = isAppError(err) ? err.message : 'An unknown error occurred.';
        setError(errorMessage);
        // Follow-driven refreshes leave the existing pagination snapshot usable.
        if (mode === 'local_first') {
          setHasMoreState(false);
        }
        Logger.error('Failed to fetch stream slice:', err);
        onError?.(err);
      } finally {
        if (isCurrentRequest(generation, requestStreamId)) {
          setLoadingState(true, false);
        }
        if (replacementOwnerRef.current === owner) {
          replacementOwnerRef.current = null;
        }
      }
    },
    [
      clearState,
      commitNetworkReplacement,
      commitPage,
      isCurrentRequest,
      limit,
      onError,
      setHasMoreState,
      setLoadingState,
      streamId,
    ],
  );

  /**
   * Refresh function - clears state and fetches from beginning
   */
  const refresh = useCallback(async () => {
    await runReplacementLoad({
      mode: 'local_first',
      clearBeforeLoad: true,
      preserveOptimisticPostIds: isCollectionItemsStream(streamId),
      // A removal still in flight stays hidden across the refetch; its
      // `finalize` recounts membership against the refreshed page.
      preserveHiddenPostIds: true,
    });
  }, [runReplacementLoad, streamId]);

  const refreshFromNetwork = useCallback(async () => {
    await runReplacementLoad({ mode: 'network_refresh' });
  }, [runReplacementLoad]);

  /**
   * Load more function - fetches next page
   */
  const loadMore = useCallback(async () => {
    if (
      replacementOwnerRef.current ||
      initializedStreamIdRef.current !== streamId ||
      loadMoreOwnerRef.current ||
      !hasMoreRef.current
    ) {
      return;
    }

    const owner = Symbol('stream-pagination');
    loadMoreOwnerRef.current = owner;
    const requestStreamId = streamId;
    const generation = ++requestGenerationRef.current;
    const committedRemovalsAtRequest = committedRemovalsRef.current;
    setLoadingState(false, true);
    setError(null);

    try {
      const result = await StreamPostsController.getOrFetchStreamSlice({
        streamId: requestStreamId,
        lastPostId: lastPostIdRef.current,
        streamTail: streamTailRef.current,
        limit,
      });

      if (!isCurrentRequest(generation, requestStreamId)) return;
      commitPage(result, false, committedRemovalsAtRequest);
    } catch (err) {
      if (!isCurrentRequest(generation, requestStreamId)) return;

      const errorMessage = isAppError(err) ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
      setHasMoreState(false);
      Logger.error('Failed to fetch stream slice:', err);
      onError?.(err);
    } finally {
      if (isCurrentRequest(generation, requestStreamId)) {
        setLoadingState(false, false);
      }
      if (loadMoreOwnerRef.current === owner) {
        loadMoreOwnerRef.current = null;
      }
    }
  }, [commitPage, isCurrentRequest, limit, onError, setHasMoreState, setLoadingState, streamId]);

  /**
   * Add post(s) to the timeline, sorted by timestamp
   * Maintains chronological order (most recent first) when adding posts
   * @param postIds - A single post ID or array of post IDs to add
   */
  const prependPosts = useCallback(
    async (postIds: string | string[]) => {
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
        postIdsRef.current = await sortPostIdsByTimestamp(allIds);
      } catch (err) {
        Logger.error('Failed to prepend posts:', err);
        // Fallback: add without sorting
        postIdsRef.current = allIds;
      }
      syncDisplayedPosts();
    },
    [syncDisplayedPosts],
  );

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

    optimisticPostIdsRef.current = [...newIds, ...optimisticPostIdsRef.current];
    syncDisplayedPosts();
  };

  /**
   * Remove post(s) from the timeline
   * Used when posts are deleted to immediately remove them from the UI
   * @param postIds - A single post ID or array of post IDs to remove
   */
  const removePosts = useCallback(
    (postIds: string | string[]) => {
      const existingPostIds = new Set([...postIdsRef.current, ...optimisticPostIdsRef.current]);
      const idsToRemove = [...new Set(Array.isArray(postIds) ? postIds : [postIds])].filter((id) =>
        existingPostIds.has(id),
      );
      const idsToRemoveSet = new Set(idsToRemove);
      idsToRemove.forEach((id) => hiddenPostCountsRef.current.delete(id));
      optimisticPostIdsRef.current = optimisticPostIdsRef.current.filter((id) => !idsToRemoveSet.has(id));
      postIdsRef.current = postIdsRef.current.filter((id) => !idsToRemoveSet.has(id));
      syncDisplayedPosts();
    },
    [syncDisplayedPosts],
  );

  const removePostsOptimistically = (postIds: string | string[]) => {
    const existingPostIds = new Set([...postIdsRef.current, ...optimisticPostIdsRef.current]);
    const idsToRemove = [...new Set(Array.isArray(postIds) ? postIds : [postIds])].filter((id) =>
      existingPostIds.has(id),
    );
    const removalStreamId = streamId;
    idsToRemove.forEach((id) => {
      hiddenPostCountsRef.current.set(id, (hiddenPostCountsRef.current.get(id) ?? 0) + 1);
    });
    syncDisplayedPosts();

    let hasFinalized = false;
    const finalize = (shouldCommit: boolean) => {
      if (hasFinalized || renderedStreamIdRef.current !== removalStreamId) return;
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
            // Also tallied in committedRemovalsRef so a fetch already in
            // flight re-applies this decrement to the cursor it writes back.
            committedRemovalsRef.current += removedStreamRowCount;
            streamTailRef.current = Math.max(0, streamTailRef.current - removedStreamRowCount);
          }
        }
        optimisticPostIdsRef.current = optimisticPostIdsRef.current.filter((id) => !idsToRemoveSet.has(id));
        postIdsRef.current = postIdsRef.current.filter((id) => !idsToRemoveSet.has(id));
      }
      syncDisplayedPosts();
    };

    return {
      commit: () => finalize(true),
      rollback: () => finalize(false),
    };
  };

  // Initial load and reset when streamId changes
  useEffect(() => {
    // Rendered identity changes before this effect runs. Invalidate older state
    // writers, mark the new stream initialized, then establish its replacement
    // owner synchronously before any pagination request can begin.
    requestGenerationRef.current += 1;
    initializedStreamIdRef.current = streamId;
    loadMoreOwnerRef.current = null;
    setLoadingMore(false);
    void runReplacementLoad({ mode: 'local_first', clearBeforeLoad: resetOnStreamChange });
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
    refreshFromNetwork,
    prependPosts,
    prependOptimisticPosts,
    removePosts,
    removePostsOptimistically,
  };
}
