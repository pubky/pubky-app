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

function resolveDisplayedPostIds(streamPostIds: string[], optimisticPostIds: string[]) {
  const streamPostIdsSet = new Set(streamPostIds);
  const filteredOptimisticPostIds = optimisticPostIds.filter((id) => !streamPostIdsSet.has(id));

  return {
    optimisticPostIds: filteredOptimisticPostIds,
    displayedPostIds: [...filteredOptimisticPostIds, ...streamPostIds],
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

  const isCurrentRequest = useCallback(
    (generation: number, requestStreamId: PostStreamId) =>
      requestGenerationRef.current === generation && renderedStreamIdRef.current === requestStreamId,
    [],
  );

  const commitPage = useCallback(
    (result: TReadPostStreamChunkResponse, isInitialLoad: boolean) => {
      // Advance from the response even when stream filters remove the entire page.
      if (result.nextCursor != null) {
        streamTailRef.current = result.nextCursor;
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

      const updatedPostIds = isInitialLoad ? newUniquePostIds : [...postIdsRef.current, ...newUniquePostIds];
      postIdsRef.current = updatedPostIds;
      const displayedState = resolveDisplayedPostIds(updatedPostIds, optimisticPostIdsRef.current);
      optimisticPostIdsRef.current = displayedState.optimisticPostIds;
      setPostIds(displayedState.displayedPostIds);
    },
    [setHasMoreState],
  );

  const commitNetworkReplacement = useCallback(
    (result: TReadPostStreamChunkResponse) => {
      const refreshedPostIds = Array.from(new Set(result.nextPageIds));
      postIdsRef.current = refreshedPostIds;
      lastPostIdRef.current = refreshedPostIds.at(-1);
      streamTailRef.current = result.nextCursor ?? NOT_FOUND_CACHED_STREAM;
      setHasMoreState(result.reachedEnd !== true);

      const displayedState = resolveDisplayedPostIds(refreshedPostIds, optimisticPostIdsRef.current);
      optimisticPostIdsRef.current = displayedState.optimisticPostIds;
      setPostIds(displayedState.displayedPostIds);
    },
    [setHasMoreState],
  );

  /**
   * Clears all state
   */
  const clearState = useCallback(
    ({ preserveOptimisticPostIds = false } = {}) => {
      postIdsRef.current = [];
      if (!preserveOptimisticPostIds) {
        optimisticPostIdsRef.current = [];
      }
      setPostIds(optimisticPostIdsRef.current);
      lastPostIdRef.current = undefined;
      streamTailRef.current = NOT_FOUND_CACHED_STREAM;
      setHasMoreState(true);
      setError(null);
    },
    [setHasMoreState],
  );

  const runReplacementLoad = useCallback(
    async ({
      mode,
      clearBeforeLoad = false,
      preserveOptimisticPostIds = false,
    }: {
      mode: ReplacementLoadMode;
      clearBeforeLoad?: boolean;
      preserveOptimisticPostIds?: boolean;
    }) => {
      const requestStreamId = streamId;
      const owner = Symbol('stream-replacement');
      replacementOwnerRef.current = owner;
      loadMoreOwnerRef.current = null;
      setLoadingMore(false);

      if (clearBeforeLoad) {
        clearState({ preserveOptimisticPostIds });
      }

      const generation = ++requestGenerationRef.current;
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
          commitNetworkReplacement(result);
        } else {
          commitPage(result, true);
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
      commitPage(result, false);
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
  };
}
