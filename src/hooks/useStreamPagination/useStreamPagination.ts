'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { NEXUS_POSTS_PER_PAGE } from '@/config/nexus';
import type { UseStreamPaginationOptions, UseStreamPaginationResult } from './useStreamPagination.types';
import { Logger } from '@/libs/logger/logger';
import { isAppError } from '@/libs/error/error.utils';
import { NOT_FOUND_CACHED_STREAM } from '@/controllers/stream/posts/post.constants';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import type { TReadPostStreamChunkResponse } from '@/controllers/stream/posts/posts.types';
import { SORT } from '@/stores/home/home.types';
import { sortPostIdsByTimestamp } from '@/utils/sorting';
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
}: UseStreamPaginationOptions): UseStreamPaginationResult {
  const [postIds, setPostIds] = useState<string[]>([]);
  const [lastPostId, setLastPostId] = useState<string | undefined>(undefined);
  const [streamTail, setStreamTail] = useState<number>(NOT_FOUND_CACHED_STREAM);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const postIdsRef = useRef<string[]>([]);

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

        if (isInitialLoad) {
          // Prepare stream for initial load: clear stale cache, merge unread posts, clear unread stream
          await StreamPostsController.prepareStreamForInitialLoad({ streamId });

          const cachedLastPostTimestamp = await StreamPostsController.getCachedLastPostTimestamp({ streamId });
          setStreamTail(cachedLastPostTimestamp);

          result = await StreamPostsController.getOrFetchStreamSlice({
            streamId,
            lastPostId: undefined,
            streamTail: cachedLastPostTimestamp,
            limit,
          });
        } else {
          const isEngagementStream = streamId.startsWith(SORT.ENGAGEMENT);
          const cursorValue = isEngagementStream ? postIdsRef.current.length : streamTail;

          result = await StreamPostsController.getOrFetchStreamSlice({
            streamId,
            lastPostId,
            streamTail: cursorValue,
            limit,
          });
        }

        // Handle empty results
        if (result.nextPageIds.length === 0) {
          // Update cursor even on empty results so subsequent loads can progress
          if (result.timestamp !== undefined) {
            setStreamTail(result.timestamp);
          }

          // Respect reachedEnd flag - only set hasMore to false if we actually
          // reached the end of stream, not just because filters removed all posts
          if (result.reachedEnd) {
            Logger.debug('[useStreamPagination] Empty result, reached end of stream');
            setHasMore(false);
          } else {
            Logger.debug('[useStreamPagination] Empty result after filtering, more posts may exist');
            setHasMore(true);
          }

          setLoadingState(isInitialLoad, false);
          return;
        }

        // Deduplicate posts
        const existingIds = new Set(postIdsRef.current);
        const newUniquePostIds = result.nextPageIds.filter((id) => !existingIds.has(id));

        // Update pagination cursors even if all posts are duplicates
        // (we need to move forward in the stream)
        const lastId = result.nextPageIds[result.nextPageIds.length - 1];
        setLastPostId(lastId);

        if (result.timestamp !== undefined) {
          setStreamTail(result.timestamp);
        }

        // Check hasMore based on reachedEnd flag from the response
        // This correctly handles cases where we hit MAX_FETCH_ITERATIONS due to mute filtering
        // vs actually reaching the end of the stream
        const hasMorePosts = result.reachedEnd !== true;
        setHasMore(hasMorePosts);

        // If all posts were duplicates, don't update the UI but keep hasMore state
        if (newUniquePostIds.length === 0) {
          setLoadingState(isInitialLoad, false);
          return;
        }

        // Update state with unique posts only
        const updatedPostIds = isInitialLoad ? newUniquePostIds : [...postIdsRef.current, ...newUniquePostIds];
        postIdsRef.current = updatedPostIds;
        setPostIds(updatedPostIds);
      } catch (err) {
        const errorMessage = isAppError(err) ? err.message : 'An unknown error occurred.';
        setError(errorMessage);
        setHasMore(false);
        Logger.error('Failed to fetch stream slice:', err);
      } finally {
        setLoadingState(isInitialLoad, false);
      }
    },
    [streamId, lastPostId, streamTail, limit, setLoadingState],
  );

  /**
   * Clears all state
   */
  const clearState = useCallback(() => {
    postIdsRef.current = [];
    setPostIds([]);
    setLastPostId(undefined);
    setStreamTail(0);
    setHasMore(true);
    setError(null);
  }, []);

  /**
   * Refresh function - clears state and fetches from beginning
   */
  const refresh = useCallback(async () => {
    clearState();
    await fetchStreamSlice(true);
  }, [clearState, fetchStreamSlice]);

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
      setPostIds(sortedIds);
    } catch (err) {
      Logger.error('Failed to prepend posts:', err);
      // Fallback: add without sorting
      postIdsRef.current = allIds;
      setPostIds(allIds);
    }
  }, []);

  /**
   * Remove post(s) from the timeline
   * Used when posts are deleted to immediately remove them from the UI
   * @param postIds - A single post ID or array of post IDs to remove
   */
  const removePosts = useCallback((postIds: string | string[]) => {
    const idsToRemove = Array.isArray(postIds) ? postIds : [postIds];
    const idsToRemoveSet = new Set(idsToRemove);

    const updatedPostIds = postIdsRef.current.filter((id) => !idsToRemoveSet.has(id));
    postIdsRef.current = updatedPostIds;
    setPostIds(updatedPostIds);
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
    removePosts,
  };
}
