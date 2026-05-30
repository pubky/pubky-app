'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileController } from '@/controllers/file/file';
import { StreamUserController } from '@/controllers/stream/users/users';
import { UserController } from '@/controllers/user/user';
import { isAppError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import type { UserRelationshipsModelSchema } from '@/models/user/relationships/userRelationships.schema';
import type { NexusTag, NexusUserCounts, NexusUserDetails } from '@/services/nexus/nexus.types';
import {
  DEFAULT_USER_STREAM_BUFFER_SIZE,
  DEFAULT_USER_STREAM_LIMIT,
  DEFAULT_USER_STREAM_PAGE_SIZE,
  DEFAULT_USER_STREAM_REFILL_THRESHOLD,
} from './useUserStream.constants';
import type {
  FetchUserStreamSliceOptions,
  UserStreamUser,
  UseUserStreamParams,
  UseUserStreamResult,
} from './useUserStream.types';

const EMPTY_PRESERVED_FOLLOWED_USER_IDS: Pubky[] = [];

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
 *   streamId: UserStreamTypes.RECOMMENDED,
 *   limit: 3,
 * });
 *
 * // Full page with infinite scroll
 * const { users, hasMore, loadMore } = useUserStream({
 *   streamId: UserStreamTypes.RECOMMENDED,
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
  excludeFollowing = false,
  preserveFollowedUserIds = EMPTY_PRESERVED_FOLLOWED_USER_IDS,
  bufferSize,
  refillThreshold,
}: UseUserStreamParams): UseUserStreamResult {
  const effectiveLimit = limit ?? (paginated ? DEFAULT_USER_STREAM_PAGE_SIZE : DEFAULT_USER_STREAM_LIMIT);
  const fetchLimit = Math.max(
    effectiveLimit,
    bufferSize ?? (excludeFollowing ? DEFAULT_USER_STREAM_BUFFER_SIZE : effectiveLimit),
  );
  const effectiveRefillThreshold =
    refillThreshold ?? (excludeFollowing ? DEFAULT_USER_STREAM_REFILL_THRESHOLD : effectiveLimit);

  // Pagination state
  const [userIds, setUserIds] = useState<Pubky[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(paginated);
  const [error, setError] = useState<string | null>(null);
  const [isExhausted, setIsExhausted] = useState(false);

  // Track skip position for pagination
  const skipRef = useRef(0);
  const refillAttemptedRef = useRef(false);

  // Tags state (not reactive via useLiveQuery since it requires fetch)
  const [userTagsMap, setUserTagsMap] = useState<Map<Pubky, NexusTag[]>>(new Map());

  // ============================================================================
  // Reactive Data Queries
  // ============================================================================

  const userDetailsMap = useLiveQuery(
    async () => {
      if (userIds.length === 0) return new Map<Pubky, NexusUserDetails>();
      try {
        return await UserController.getManyDetails({ userIds });
      } catch (err) {
        Logger.error('[useUserStream] Failed to query user details', { error: err });
        return new Map<Pubky, NexusUserDetails>();
      }
    },
    [userIds],
    new Map<Pubky, NexusUserDetails>(),
  );

  const userCountsMap = useLiveQuery(
    async () => {
      if (!includeCounts || userIds.length === 0) return new Map<Pubky, NexusUserCounts>();
      try {
        return await UserController.getManyCounts({ userIds });
      } catch (err) {
        Logger.error('[useUserStream] Failed to query user counts', { error: err });
        return new Map<Pubky, NexusUserCounts>();
      }
    },
    [userIds, includeCounts],
    new Map<Pubky, NexusUserCounts>(),
  );

  const userRelationshipsMap = useLiveQuery(
    async () => {
      if (!includeRelationships || userIds.length === 0) return new Map<Pubky, UserRelationshipsModelSchema>();
      try {
        return await UserController.getManyRelationships({ userIds });
      } catch (err) {
        Logger.error('[useUserStream] Failed to query user relationships', { error: err });
        return new Map<Pubky, UserRelationshipsModelSchema>();
      }
    },
    [userIds, includeRelationships],
    new Map<Pubky, UserRelationshipsModelSchema>(),
  );

  // Fetch tags when userIds change (requires API call, not just DB query)
  useEffect(() => {
    if (!includeTags || userIds.length === 0) {
      setUserTagsMap(new Map());
      return;
    }

    const fetchTags = async () => {
      try {
        const tagsMap = await UserController.getManyTagsOrFetch({ userIds });
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

  const eligible: UserStreamUser[] = [];
  const preservedFollowedUsers = new Set(preserveFollowedUserIds);

  for (const id of userIds) {
    const details = userDetailsMap.get(id);
    if (!details) continue;

    const counts = userCountsMap.get(id);
    const relationship = userRelationshipsMap.get(id);
    if (excludeFollowing && relationship?.following && !preservedFollowedUsers.has(id)) continue;

    const userTags = userTagsMap.get(id);

    eligible.push({
      id: details.id,
      name: details.name,
      bio: details.bio,
      image: details.image,
      avatarUrl: details.image ? FileController.getAvatarUrl(id) : null,
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

  const eligibleCount = eligible.length;
  const users = excludeFollowing && !paginated ? eligible.slice(0, effectiveLimit) : eligible;

  // Track whether the live queries that feed eligibility have hydrated for the current `userIds`.
  // `useLiveQuery` returns its default empty Map synchronously and only fills it on the next tick,
  // so we use these flags to avoid two visible UX issues:
  //   1. an unnecessary force-network refill while `eligibleCount` is transiently 0 (refill effect),
  //   2. a "first three users blink to a different three" when `excludeFollowing` is on and the
  //      relationships map hydrates a tick after the details map (consumer-facing `isLoading`).
  const detailsHydrated = userIds.length === 0 || userIds.some((id) => userDetailsMap.has(id));
  const relationshipsHydrated =
    !includeRelationships || userIds.length === 0 || userIds.some((id) => userRelationshipsMap.has(id));

  // ============================================================================
  // Fetch Logic
  // ============================================================================

  const fetchStreamSlice = useCallback(
    async (isInitial: boolean, options: FetchUserStreamSliceOptions = {}) => {
      // Set loading state
      if (isInitial) {
        setIsLoading(true);
        setError(null);
        skipRef.current = 0;
        refillAttemptedRef.current = false;
        setIsExhausted(false);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const readStreamSlice = options.forceNetwork
          ? StreamUserController.refreshStreamSlice
          : StreamUserController.getOrFetchStreamSlice;

        const {
          nextPageIds,
          skip: nextSkip,
          isExhausted: streamExhausted,
        } = await readStreamSlice({
          streamId,
          limit: fetchLimit,
          skip: isInitial ? 0 : skipRef.current,
          ...(excludeFollowing && !options.forceNetwork && { allowPartialCache: true }),
        });

        if (streamExhausted) {
          setIsExhausted(true);
        }

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
        setHasMore(paginated && !streamExhausted && nextPageIds.length >= fetchLimit);
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
    [streamId, fetchLimit, paginated, excludeFollowing],
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

  useEffect(() => {
    if (!excludeFollowing || isLoading || isLoadingMore || isExhausted || refillAttemptedRef.current) return;
    if (userIds.length === 0) return;

    // Wait for the live queries that feed `eligibleCount` to hydrate before deciding to refill
    // (see the comment on `detailsHydrated` / `relationshipsHydrated` above).
    if (!detailsHydrated || !relationshipsHydrated) return;

    const shouldRefill = eligibleCount < effectiveRefillThreshold || (!paginated && eligibleCount < effectiveLimit);

    if (!shouldRefill) return;

    refillAttemptedRef.current = true;
    void fetchStreamSlice(false, { forceNetwork: true });
  }, [
    detailsHydrated,
    eligibleCount,
    effectiveLimit,
    effectiveRefillThreshold,
    excludeFollowing,
    fetchStreamSlice,
    isExhausted,
    isLoading,
    isLoadingMore,
    paginated,
    relationshipsHydrated,
    userIds.length,
  ]);

  // When `excludeFollowing` is on, the visible users depend on the relationships live query.
  // Keep skeletons up until BOTH details and relationships are hydrated, otherwise the consumer
  // briefly sees an unfiltered slice of the buffer that gets reshuffled once relationships arrive.
  const isHydrating = excludeFollowing && userIds.length > 0 && !(detailsHydrated && relationshipsHydrated);

  return {
    users,
    userIds,
    isLoading: isLoading || isHydrating,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    refetch,
  };
}
