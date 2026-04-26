'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as Core from '@/core';
import type { UseUserStreamParams, UseUserStreamResult, UserStreamUser } from './useUserStream.types';
import { DEFAULT_USER_STREAM_LIMIT, DEFAULT_USER_STREAM_PAGE_SIZE } from './useUserStream.constants';
import { Logger } from '@/libs/logger/logger';
import { isAppError } from '@/libs/error/error.utils';

/**
 * useUserStream
 *
 * Hook for fetching users from a user stream (e.g., influencers, recommended).
 * Uses StreamUserController for fetching IDs and useLiveQuery for reactive details.
 *
 * @example
 * ```tsx
 * // Sidebar usage (fixed limit)
 * const { users, isLoading } = useUserStream({
 *   streamId: Core.UserStreamTypes.RECOMMENDED,
 *   limit: 3,
 * });
 *
 * // Full page with infinite scroll
 * const { users, hasMore, loadMore } = useUserStream({
 *   streamId: Core.UserStreamTypes.RECOMMENDED,
 *   paginated: true,
 * });
 * ```
 */
export function useUserStream({
  streamId,
  limit,
  includeCounts = false,
  includeRelationships = false,
  includeTags = false,
  paginated = false,
}: UseUserStreamParams): UseUserStreamResult {
  const effectiveLimit = limit ?? (paginated ? DEFAULT_USER_STREAM_PAGE_SIZE : DEFAULT_USER_STREAM_LIMIT);

  // Pagination state
  const [userIds, setUserIds] = useState<Core.Pubky[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(paginated);
  const [error, setError] = useState<string | null>(null);

  // Track skip position for pagination
  const skipRef = useRef(0);

  // Tags state (not reactive via useLiveQuery since it requires fetch)
  const [userTagsMap, setUserTagsMap] = useState<Map<Core.Pubky, Core.NexusTag[]>>(new Map());

  // ============================================================================
  // Reactive Data Queries
  // ============================================================================

  const userDetailsMap = useLiveQuery(
    async () => {
      if (userIds.length === 0) return new Map<Core.Pubky, Core.NexusUserDetails>();
      try {
        return await Core.UserController.getManyDetails({ userIds });
      } catch (err) {
        Logger.error('[useUserStream] Failed to query user details', { error: err });
        return new Map<Core.Pubky, Core.NexusUserDetails>();
      }
    },
    [userIds],
    new Map<Core.Pubky, Core.NexusUserDetails>(),
  );

  const userCountsMap = useLiveQuery(
    async () => {
      if (!includeCounts || userIds.length === 0) return new Map<Core.Pubky, Core.NexusUserCounts>();
      try {
        return await Core.UserController.getManyCounts({ userIds });
      } catch (err) {
        Logger.error('[useUserStream] Failed to query user counts', { error: err });
        return new Map<Core.Pubky, Core.NexusUserCounts>();
      }
    },
    [userIds, includeCounts],
    new Map<Core.Pubky, Core.NexusUserCounts>(),
  );

  const userRelationshipsMap = useLiveQuery(
    async () => {
      if (!includeRelationships || userIds.length === 0)
        return new Map<Core.Pubky, Core.UserRelationshipsModelSchema>();
      try {
        return await Core.UserController.getManyRelationships({ userIds });
      } catch (err) {
        Logger.error('[useUserStream] Failed to query user relationships', { error: err });
        return new Map<Core.Pubky, Core.UserRelationshipsModelSchema>();
      }
    },
    [userIds, includeRelationships],
    new Map<Core.Pubky, Core.UserRelationshipsModelSchema>(),
  );

  // Fetch tags when userIds change (requires API call, not just DB query)
  useEffect(() => {
    if (!includeTags || userIds.length === 0) {
      setUserTagsMap(new Map());
      return;
    }

    const fetchTags = async () => {
      try {
        const tagsMap = await Core.UserController.getManyTagsOrFetch({ userIds });
        setUserTagsMap(tagsMap);
      } catch (err) {
        Logger.error('[useUserStream] Failed to fetch user tags:', err);
        setUserTagsMap(new Map());
      }
    };

    void fetchTags();
  }, [userIds, includeTags]);

  // ============================================================================
  // Computed Users Array
  // ============================================================================

  const users = useMemo((): UserStreamUser[] => {
    const result: UserStreamUser[] = [];

    for (const id of userIds) {
      const details = userDetailsMap.get(id);
      if (!details) continue;

      const counts = userCountsMap.get(id);
      const relationship = userRelationshipsMap.get(id);
      const userTags = userTagsMap.get(id);

      result.push({
        id: details.id,
        name: details.name,
        bio: details.bio,
        image: details.image,
        avatarUrl: details.image ? Core.FileController.getAvatarUrl(id) : null,
        status: details.status,
        counts: counts
          ? {
              posts: counts.posts,
              tags: counts.tags,
              followers: counts.followers,
              following: counts.following,
            }
          : undefined,
        isFollowing: relationship?.following ?? false,
        tags: userTags?.map((tag) => tag.label),
      });
    }

    return result;
  }, [userIds, userDetailsMap, userCountsMap, userRelationshipsMap, userTagsMap]);

  // ============================================================================
  // Fetch Logic
  // ============================================================================

  const fetchStreamSlice = useCallback(
    async (isInitial: boolean) => {
      // Set loading state
      if (isInitial) {
        setIsLoading(true);
        setError(null);
        skipRef.current = 0;
      } else {
        setIsLoadingMore(true);
      }

      try {
        const { nextPageIds, skip: nextSkip } = await Core.StreamUserController.getOrFetchStreamSlice({
          streamId,
          limit: effectiveLimit,
          skip: isInitial ? 0 : skipRef.current,
        });

        // Update user IDs
        if (isInitial) {
          setUserIds(nextPageIds);
          skipRef.current = nextSkip ?? nextPageIds.length;
        } else if (nextPageIds.length > 0) {
          setUserIds((prev) => {
            const existingIds = new Set(prev);
            const newIds = nextPageIds.filter((id) => !existingIds.has(id));
            return [...prev, ...newIds];
          });
          skipRef.current = nextSkip ?? skipRef.current + nextPageIds.length;
        }

        // Update hasMore based on whether we got a full page
        setHasMore(paginated && nextPageIds.length >= effectiveLimit);
      } catch (err) {
        if (isInitial) {
          setError(isAppError(err) ? err.message : 'Failed to fetch users');
        }
        Logger.error('[useUserStream] Failed to fetch users:', err);
      } finally {
        if (isInitial) {
          setIsLoading(false);
        } else {
          setIsLoadingMore(false);
        }
      }
    },
    [streamId, effectiveLimit, paginated],
  );

  const loadMore = useCallback(async () => {
    if (!paginated || isLoadingMore || !hasMore) return;
    await fetchStreamSlice(false);
  }, [paginated, isLoadingMore, hasMore, fetchStreamSlice]);

  const refetch = useCallback(async () => {
    if (paginated) {
      setUserIds([]);
      setHasMore(true);
    }
    await fetchStreamSlice(true);
  }, [paginated, fetchStreamSlice]);

  // Initial fetch on mount or when streamId changes
  useEffect(() => {
    void fetchStreamSlice(true);
  }, [fetchStreamSlice]);

  return {
    users,
    userIds,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    refetch,
  };
}
