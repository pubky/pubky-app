'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { NEXUS_POSTS_PER_PAGE } from '@/config/nexus';
import { NOT_FOUND_CACHED_STREAM } from '@/controllers/stream/posts/post.constants';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import type { TReadPostStreamChunkResponse } from '@/controllers/stream/posts/posts.types';
import { isAppError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import { isCollectionItemsStream, isSkipPaginatedStream } from '@/models/stream/post/postStream.types';
import { sortPostIdsByTimestamp } from '@/utils/sorting';
import type { UseStreamPaginationOptions, UseStreamPaginationResult } from './useStreamPagination.types';

function resolveDisplayedPostIds(streamPostIds: string[], optimisticPostIds: string[]) {
  const streamPostIdsSet = new Set(streamPostIds);
  const filteredOptimisticPostIds = optimisticPostIds.filter((id) => !streamPostIdsSet.has(id));

  return {
    optimisticPostIds: filteredOptimisticPostIds,
    displayedPostIds: [...filteredOptimisticPostIds, ...streamPostIds],
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

        // Advance from the response, even on a fully-filtered (empty) page.
        if (result.nextCursor != null) {
          setStreamTail(result.nextCursor);
        }

        // hasMore reflects the stream end, not the filtered count: a mute/filter-emptied page
        // keeps hasMore so the advanced cursor is re-requested. This can't spin IN PLACE (the
        // cursor always advances by raw count, and a short raw page forces reachedEnd), but an
        // auto-loading caller (useInfiniteScroll) will chain rounds through a filtered region
        // until the true stream end, with no per-user-action bound or feedback. Known
        // limitation, deliberately unchanged here — any remedy (toast + backoff, manual
        // load-more) is a product-visible UX change tracked as follow-up.
        if (result.nextPageIds.length === 0) {
          setHasMore(!result.reachedEnd);
          setLoadingState(isInitialLoad, false);
          return;
        }

        // Deduplicate posts
        const existingIds = new Set(postIdsRef.current);
        const newUniquePostIds = result.nextPageIds.filter((id) => !existingIds.has(id));

        // Update last-returned id even if all posts are duplicates (we need to move forward)
        const lastId = result.nextPageIds[result.nextPageIds.length - 1];
        setLastPostId(lastId);
        setHasMore(result.reachedEnd !== true);

        // If all posts were duplicates, don't update the UI but keep hasMore state
        if (newUniquePostIds.length === 0) {
          setLoadingState(isInitialLoad, false);
          return;
        }

        // Update state with unique posts only
        const updatedPostIds = isInitialLoad ? newUniquePostIds : [...postIdsRef.current, ...newUniquePostIds];
        postIdsRef.current = updatedPostIds;
        const displayedState = resolveDisplayedPostIds(updatedPostIds, optimisticPostIdsRef.current);
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
  const clearState = useCallback(({ preserveOptimisticPostIds = false } = {}) => {
    postIdsRef.current = [];
    if (!preserveOptimisticPostIds) {
      optimisticPostIdsRef.current = [];
    }
    setPostIds(optimisticPostIdsRef.current);
    setLastPostId(undefined);
    setStreamTail(0);
    setHasMore(true);
    setError(null);
  }, []);

  /**
   * Refresh function - clears state and fetches from beginning
   */
  const refresh = useCallback(async () => {
    clearState({ preserveOptimisticPostIds: isCollectionItemsStream(streamId) });
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
      const displayedState = resolveDisplayedPostIds(sortedIds, optimisticPostIdsRef.current);
      optimisticPostIdsRef.current = displayedState.optimisticPostIds;
      setPostIds(displayedState.displayedPostIds);
    } catch (err) {
      Logger.error('Failed to prepend posts:', err);
      // Fallback: add without sorting
      postIdsRef.current = allIds;
      const displayedState = resolveDisplayedPostIds(allIds, optimisticPostIdsRef.current);
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
    const displayedState = resolveDisplayedPostIds(postIdsRef.current, optimisticPostIds);
    optimisticPostIdsRef.current = displayedState.optimisticPostIds;
    setPostIds(displayedState.displayedPostIds);
  };

  /**
   * Remove post(s) from the timeline
   * Used when posts are deleted to immediately remove them from the UI
   * @param postIds - A single post ID or array of post IDs to remove
   */
  const removePosts = useCallback((postIds: string | string[]) => {
    const idsToRemove = Array.isArray(postIds) ? postIds : [postIds];
    const idsToRemoveSet = new Set(idsToRemove);

    optimisticPostIdsRef.current = optimisticPostIdsRef.current.filter((id) => !idsToRemoveSet.has(id));
    const updatedPostIds = postIdsRef.current.filter((id) => !idsToRemoveSet.has(id));
    postIdsRef.current = updatedPostIds;
    const displayedState = resolveDisplayedPostIds(updatedPostIds, optimisticPostIdsRef.current);
    optimisticPostIdsRef.current = displayedState.optimisticPostIds;
    setPostIds(displayedState.displayedPostIds);
  }, []);

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
  };
}
