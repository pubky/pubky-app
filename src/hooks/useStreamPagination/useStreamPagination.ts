'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { STREAM_LOAD_MAX_RAW_SCAN } from '@/config/feed';
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
  // Monotonic token bumped by `clearState` (stream switch, refresh). A fetch snapshots it at
  // entry and drops ALL of its state writes — success and failure — if a reset happened during
  // its flight: a late-resolving request for a previous stream (or a pre-refresh cursor) must
  // not overwrite the fresh stream's posts, cursors, hasMore, error, or loading flags.
  const fetchGenerationRef = useRef(0);
  const activeStreamIdRef = useRef(streamId);
  // Written from an effect (not during render) for the React Compiler `refs`
  // rule; the removal finalizer that reads it only runs after a commit.
  useEffect(() => {
    activeStreamIdRef.current = streamId;
  }, [streamId]);

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
   * Fetches the next visible page of the stream.
   *
   * One load may take several stream-layer rounds: filtering is client-side, so a round
   * can come back with nothing new to show while the stream has more. Rather than
   * returning empty and letting the scroll sentinel refire (which unmounts and remounts the
   * loading block once per round and pulses the feed's height — #2523), the load keeps
   * scanning with both resume cursors advanced, up to `STREAM_LOAD_MAX_RAW_SCAN` raw posts,
   * until a visible post arrives, the stream ends, or a round makes no progress at all.
   */
  const fetchStreamSlice = useCallback(
    async (isInitialLoad: boolean) => {
      setLoadingState(isInitialLoad, true);
      setError(null);
      const generationAtRequest = fetchGenerationRef.current;
      const isStale = () => fetchGenerationRef.current !== generationAtRequest;

      try {
        // Resume positions for this load. Always resume from `streamTail`; never recompute
        // the cursor from the visible count. Held in locals across chained rounds because the
        // state writes below only land after this call completes.
        let anchor = lastPostId;
        let cursor = streamTail;

        if (isInitialLoad) {
          // Prepare stream for initial load: clear stale cache, merge unread posts, clear unread stream
          await StreamPostsController.prepareStreamForInitialLoad({ streamId });

          const cachedLastPostTimestamp = await StreamPostsController.getCachedLastPostTimestamp({ streamId });
          if (isStale()) return;
          setStreamTail(cachedLastPostTimestamp);
          anchor = undefined;
          // Skip streams always start at offset 0; score streams seed from the cached tail.
          cursor = isSkipPaginatedStream(streamId) ? 0 : cachedLastPostTimestamp;
        }

        // Resume positions and `hasMore` are committed once, after the scan: every round
        // reads the locals, and a state write per round would re-render the feed (and
        // re-create `loadMore`) once per round while nothing visible changes.
        let reachedEnd = false;
        let rawScanned = 0;
        for (;;) {
          const committedRemovalsAtRequest = committedRemovalsRef.current;
          const result: TReadPostStreamChunkResponse = await StreamPostsController.getOrFetchStreamSlice({
            streamId,
            lastPostId: anchor,
            streamTail: cursor,
            // Lets the cache walk re-anchor if `anchor` was removed from the cached row
            // (its post deleted or un-bookmarked) instead of skipping to the row tail.
            visiblePostIds: anchor === undefined ? undefined : postIdsRef.current,
            limit,
          });

          // A reset (stream switch or refresh) during the flight makes this response stale;
          // every write below belongs to state that no longer exists.
          if (isStale()) return;

          // Advance BOTH resume positions from the response, even on a fully-filtered (empty)
          // page: `streamTail` by the raw backend cursor, `lastPostId` (the local cache-walk
          // anchor) by the raw scan anchor. Both advance by raw scanned data, never by the
          // post-filter visible count — otherwise a fully-filtered round would restart the
          // cache walk at the head and spin in place on long filtered runs. A score cursor
          // is always Nexus's own position (persisted on the cached stream row), never a
          // post's local `indexed_at`, which Nexus bumps on edit/delete without moving the
          // post in the stream (#2523).
          let nextCursor = cursor;
          if (result.nextCursor != null) {
            // Skip streams: `nextCursor` extends the offset this request captured
            // at start, so removals committed during the flight are not in it —
            // re-apply them or the absolute write below would discard their
            // decrements. Clamped: a `clearState` during the flight resets the
            // counter, and a stale resolution must not over-correct a fresh one.
            const removalsDuringFlight = isSkipPaginatedStream(streamId)
              ? Math.max(0, committedRemovalsRef.current - committedRemovalsAtRequest)
              : 0;
            nextCursor = Math.max(0, result.nextCursor - removalsDuringFlight);
          }
          // Never overwrite a defined anchor with undefined.
          const nextAnchor = resolveResumeAnchor(result) ?? anchor;
          const consumed = result.rawScannedCount ?? 0;
          const progressed = consumed > 0 || nextAnchor !== anchor || nextCursor !== cursor;
          anchor = nextAnchor;
          cursor = nextCursor;
          // hasMore reflects the stream end, not the filtered count: a mute/filter-emptied page
          // keeps hasMore so the advanced cursors are re-requested.
          reachedEnd = result.reachedEnd === true;

          // Deduplicate posts
          const existingIds = new Set(postIdsRef.current);
          const newUniquePostIds = result.nextPageIds.filter((id) => !existingIds.has(id));
          if (newUniquePostIds.length > 0) {
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
            break;
          }

          // Nothing new to show (fully filtered, or only duplicates). Keep scanning while the
          // round consumed raw ids or moved a resume position and the raw-scan budget allows;
          // otherwise yield with hasMore true — the auto-loading renderer decides whether to
          // keep going (`TIMELINE_MAX_UNPRODUCTIVE_AUTO_LOADS`) or hand over to a manual
          // Load more.
          rawScanned += consumed;
          if (reachedEnd || !progressed || rawScanned >= STREAM_LOAD_MAX_RAW_SCAN) break;
        }

        // Written unconditionally: a removal committed while this call awaited a page may
        // have moved the live offset, so equality with the captured value does not mean the
        // state still holds it (React skips the render for an unchanged primitive anyway).
        setStreamTail(cursor);
        if (anchor !== undefined) setLastPostId(anchor);
        setHasMore(!reachedEnd);
      } catch (err) {
        Logger.error('Failed to fetch stream slice:', err);
        // A stale failure belongs to a discarded request: surfacing it (error banner,
        // hasMore=false, onError) would poison the fresh stream's state.
        if (isStale()) return;
        const errorMessage = isAppError(err) ? err.message : 'An unknown error occurred.';
        setError(errorMessage);
        setHasMore(false);
        onError?.(err);
      } finally {
        // The fresh stream's fetch owns the loading flags now; `clearState` already
        // reset `loadingMore` so a skipped write here cannot strand it.
        if (!isStale()) {
          setLoadingState(isInitialLoad, false);
        }
      }
    },
    [streamId, lastPostId, streamTail, limit, setLoadingState, onError],
  );

  /**
   * Clears all state
   */
  const clearState = useCallback(({ preserveOptimisticPostIds = false, preserveHiddenPostIds = false } = {}) => {
    // Invalidate in-flight fetches: their responses describe the state being cleared here.
    fetchGenerationRef.current += 1;
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
    // An in-flight loadMore just became stale and will skip its own finally-clear;
    // without this reset the stuck flag would permanently block `loadMore`.
    setLoadingMore(false);
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
