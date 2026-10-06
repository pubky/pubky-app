'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileController } from '@/controllers/file/file';
import { StreamUserController } from '@/controllers/stream/users/users';
import { UserController } from '@/controllers/user/user';
import { isAppError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import { resolveUserDisplayName } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import type { UserRelationshipsModelSchema } from '@/models/user/relationships/userRelationships.schema';
import type { NexusTag, NexusUserCounts, NexusUserDetails } from '@/services/nexus/nexus.types';
import {
  DEFAULT_USER_STREAM_BUFFER_SIZE,
  DEFAULT_USER_STREAM_LIMIT,
  DEFAULT_USER_STREAM_REFILL_THRESHOLD,
} from './useUserStream.constants';
import type {
  FetchUserStreamSliceOptions,
  UserStreamUser,
  UseUserStreamParams,
  UseUserStreamResult,
} from './useUserStream.types';

const EMPTY_PRESERVED_FOLLOWED_USER_IDS: Pubky[] = [];
const EMPTY_DETAILS_MAP = new Map<Pubky, NexusUserDetails>();
const EMPTY_RELATIONSHIPS_MAP = new Map<Pubky, UserRelationshipsModelSchema>();

/**
 * A live-query result tagged with the `userIds` it was computed for. `useLiveQuery` yields
 * `undefined` before the first resolve and keeps returning the previous result while deps change,
 * so the tag is the only reliable way to tell "settled for these ids" apart from both "not yet"
 * and "stale from the previous ids" — including when the settled result is legitimately empty
 * (nothing cached, or the read failed).
 */
interface LiveQuerySnapshot<T> {
  forIds: Pubky[];
  map: Map<Pubky, T>;
}

/**
 * useUserStream
 *
 * Hook for fetching users from a user stream (e.g., influencers, recommended).
 * Uses StreamUserController for fetching IDs and useLiveQuery for reactive details.
 *
 * With `excludeFollowing`, followed users are hidden and the list is refilled once from the
 * cached stream beyond the first read, then once from Nexus when that was still short.
 *
 * @example
 * ```tsx
 * const { users, isLoading } = useUserStream({
 *   streamId: UserStreamTypes.RECOMMENDED,
 *   limit: 3,
 *   bufferSize: 10,
 *   excludeFollowing: true,
 * });
 * ```
 */
export function useUserStream({
  streamId,
  limit,
  includeCounts = false,
  includeRelationships = false,
  includeTags = false,
  excludeFollowing = false,
  showAll = false,
  preserveFollowedUserIds = EMPTY_PRESERVED_FOLLOWED_USER_IDS,
  bufferSize,
  refillThreshold,
}: UseUserStreamParams): UseUserStreamResult {
  const effectiveLimit = limit ?? DEFAULT_USER_STREAM_LIMIT;
  const fetchLimit = Math.max(
    effectiveLimit,
    bufferSize ?? (excludeFollowing ? DEFAULT_USER_STREAM_BUFFER_SIZE : effectiveLimit),
  );
  const effectiveRefillThreshold =
    refillThreshold ?? (excludeFollowing ? DEFAULT_USER_STREAM_REFILL_THRESHOLD : effectiveLimit);

  // Stream state
  const [userIds, setUserIds] = useState<Pubky[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExhausted, setIsExhausted] = useState(false);
  // Whether the live queries have settled once since the initial read; only that first wait
  // shows skeletons, a refill keeps the settled list on screen while its ids hydrate
  const [hasHydratedOnce, setHasHydratedOnce] = useState(false);

  // Track how far into the stream the reads have gone
  const skipRef = useRef(0);
  // Refill steps: 1 reads the cached tail of the stream, 2 asks Nexus when that was not enough
  const refillStepRef = useRef(0);
  const lastSliceFromCacheRef = useRef(false);

  // Tags state (not reactive via useLiveQuery since it requires fetch)
  const [userTagsMap, setUserTagsMap] = useState<Map<Pubky, NexusTag[]>>(new Map());

  // ============================================================================
  // Reactive Data Queries
  // ============================================================================

  const userDetailsSnapshot = useLiveQuery<LiveQuerySnapshot<NexusUserDetails> | undefined>(async () => {
    if (userIds.length === 0) return { forIds: userIds, map: EMPTY_DETAILS_MAP };
    try {
      return { forIds: userIds, map: await UserController.getManyDetails({ userIds }) };
    } catch (err) {
      Logger.error('[useUserStream] Failed to query user details', { error: err });
      // Settled-but-empty: consumers must fall through to their empty/error state, not spin forever
      return { forIds: userIds, map: EMPTY_DETAILS_MAP };
    }
  }, [userIds]);
  const userDetailsMap = userDetailsSnapshot?.map ?? EMPTY_DETAILS_MAP;

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

  const userRelationshipsSnapshot = useLiveQuery<
    LiveQuerySnapshot<UserRelationshipsModelSchema> | undefined
  >(async () => {
    if (!includeRelationships || userIds.length === 0) return { forIds: userIds, map: EMPTY_RELATIONSHIPS_MAP };
    try {
      return { forIds: userIds, map: await UserController.getManyRelationships({ userIds }) };
    } catch (err) {
      Logger.error('[useUserStream] Failed to query user relationships', { error: err });
      return { forIds: userIds, map: EMPTY_RELATIONSHIPS_MAP };
    }
  }, [userIds, includeRelationships]);
  const userRelationshipsMap = userRelationshipsSnapshot?.map ?? EMPTY_RELATIONSHIPS_MAP;

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
  // With `excludeFollowing`, an id counts only once the relationships live query covers it, so a
  // user the viewer follows never shows for the tick between the details and relationships
  // updates after a refill appends ids (the initial read is gated by `isHydrating` instead)
  const relationshipsCoveredIds =
    excludeFollowing && includeRelationships ? new Set(userRelationshipsSnapshot?.forIds ?? []) : null;

  for (const id of userIds) {
    const details = userDetailsMap.get(id);
    if (!details) continue;
    if (relationshipsCoveredIds && !relationshipsCoveredIds.has(id)) continue;

    const counts = userCountsMap.get(id);
    const relationship = userRelationshipsMap.get(id);
    if (excludeFollowing && relationship?.following && !preservedFollowedUsers.has(id)) continue;

    const userTags = userTagsMap.get(id);

    eligible.push({
      id: details.id,
      name: resolveUserDisplayName(details),
      bio: details.bio,
      image: details.image,
      avatarUrl: details.image ? FileController.getAvatarUrl(id, details.indexed_at) : null,
      status: details.status,
      counts: counts
        ? {
            posts: counts.posts,
            tags: counts.tagged,
            followers: counts.followers,
            following: counts.following,
          }
        : undefined,
      isFollowing: relationship?.following ?? false,
      tags: userTags?.map((tag) => tag.label),
    });
  }

  const eligibleCount = eligible.length;
  const users = excludeFollowing && !showAll ? eligible.slice(0, effectiveLimit) : eligible;

  // Track whether the live queries that feed eligibility have settled for the current `userIds`.
  // `useLiveQuery` yields `undefined` synchronously and only resolves on the next tick, so we use
  // these flags to avoid two visible UX issues:
  //   1. an unnecessary force-network refill while `eligibleCount` is transiently 0 (refill effect),
  //   2. a "first three users blink to a different three" when `excludeFollowing` is on and the
  //      relationships map hydrates a tick after the details map (consumer-facing `isLoading`).
  // A settled-but-empty snapshot (nothing cached, or the read failed) counts as hydrated so the
  // consumer falls through to its empty/error state instead of showing a skeleton forever.
  const detailsHydrated = userIds.length === 0 || userDetailsSnapshot?.forIds === userIds;
  const relationshipsHydrated =
    !includeRelationships || userIds.length === 0 || userRelationshipsSnapshot?.forIds === userIds;

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
        refillStepRef.current = 0;
        setIsExhausted(false);
        setHasHydratedOnce(false);
      } else {
        setIsLoadingMore(true);
      }

      try {
        // A failed read must not pass for the cached slice before it (see the refill effect)
        lastSliceFromCacheRef.current = false;

        // Showing every eligible user starts from the whole cached row, which can have grown past
        // one slice over earlier visits; a shorter row takes the slice read below instead.
        if (isInitial && showAll) {
          const cachedIds = await StreamUserController.getStreamUserIds(streamId);
          if (cachedIds.length > fetchLimit) {
            await StreamUserController.getOrFetchUsers({ userIds: cachedIds });
            lastSliceFromCacheRef.current = true;
            setUserIds(cachedIds);
            skipRef.current = cachedIds.length;
            return;
          }
        }

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
        // A slice without a `skip` came from the cache (see `UserStreamApplication.getOrFetchStreamSlice`)
        lastSliceFromCacheRef.current = nextSkip === undefined && nextPageIds.length > 0;

        // Update user IDs
        if (isInitial) {
          setUserIds(nextPageIds);
          skipRef.current = nextSkip ?? nextPageIds.length;
        } else if (nextPageIds.length > 0) {
          setUserIds((prev) => {
            const existingIds = new Set(prev);
            const newIds = nextPageIds.filter((id) => !existingIds.has(id));
            // A page of known ids keeps the array, so the live queries do not run again for nothing
            return newIds.length === 0 ? prev : [...prev, ...newIds];
          });
          skipRef.current = nextSkip ?? skipRef.current + nextPageIds.length;
        }
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
    [streamId, fetchLimit, excludeFollowing, showAll],
  );

  const refetch = useCallback(async () => {
    await fetchStreamSlice(true);
  }, [fetchStreamSlice]);

  // Initial fetch on mount or when streamId changes
  useEffect(() => {
    void fetchStreamSlice(true);
  }, [fetchStreamSlice]);

  useEffect(() => {
    if (!excludeFollowing || isLoading || isLoadingMore || isExhausted) return;
    if (userIds.length === 0) return;

    // Wait for the live queries that feed `eligibleCount` to hydrate before deciding to refill
    // (see the comment on `detailsHydrated` / `relationshipsHydrated` above).
    if (!detailsHydrated || !relationshipsHydrated) return;

    const shouldRefill = eligibleCount < effectiveRefillThreshold || eligibleCount < effectiveLimit;

    if (!shouldRefill) return;

    // Read the cached tail of the stream first: users an earlier visit fetched past this slice
    // stay eligible when the viewer followed some of the slice elsewhere. Ask Nexus for fresh
    // candidates only when that tail was still short, and only once.
    if (refillStepRef.current === 0) {
      refillStepRef.current = 1;
      void fetchStreamSlice(false);
      return;
    }
    if (refillStepRef.current === 1 && lastSliceFromCacheRef.current) {
      refillStepRef.current = 2;
      void fetchStreamSlice(false, { forceNetwork: true });
    }
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
    relationshipsHydrated,
    userIds.length,
  ]);

  const hydrated = detailsHydrated && relationshipsHydrated;
  useEffect(() => {
    if (hydrated && userIds.length > 0) setHasHydratedOnce(true);
  }, [hydrated, userIds.length]);

  // When `excludeFollowing` is on, the visible users depend on the relationships live query.
  // Keep skeletons up until BOTH details and relationships are hydrated after the initial read,
  // otherwise the consumer briefly sees an unfiltered slice of the buffer that gets reshuffled
  // once relationships arrive. A refill append keeps the settled list instead (see
  // `relationshipsCoveredIds`), so the list never drops to skeletons once shown.
  const isHydrating = excludeFollowing && userIds.length > 0 && !hasHydratedOnce && !hydrated;

  return {
    users,
    userIds,
    isLoading: isLoading || isHydrating,
    isLoadingMore,
    error,
    refetch,
  };
}
