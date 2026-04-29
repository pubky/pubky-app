'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as Config from '@/config';
import type { ConnectionType, UserConnectionData, UseProfileConnectionsResult } from './useProfileConnections.types';
import { Logger } from '@/libs/logger/logger';
import { isAppError } from '@/libs/error/error.utils';
import { FileController } from '@/controllers/file/file';
import { StreamUserController } from '@/controllers/stream/users/users';
import { UserController } from '@/controllers/user/user';
import type { Pubky } from '@/models/models.types';
import type { UserStreamCompositeId } from '@/models/stream/user/userStream.types';
import type { UserRelationshipsModelSchema } from '@/models/user/relationships/userRelationships.schema';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import type { NexusTag, NexusUserCounts, NexusUserDetails } from '@/services/nexus/nexus.types';
import { useAuthStore } from '@/stores/auth/auth.store';
export type { ConnectionType, UserConnectionData, UseProfileConnectionsResult };
export { CONNECTION_TYPE } from './useProfileConnections.types';

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * useProfileConnections
 *
 * Hook for fetching and managing profile connections (followers, following, friends).
 * Uses StreamUserController for pagination and Dexie for reactive user details.
 *
 * @param type - Type of connections to fetch: 'followers', 'following', or 'friends'
 * @param userId - Optional user ID (defaults to current authenticated user)
 * @returns Connections array with full user details, pagination state, and handlers
 *
 * @example
 * ```tsx
 * const { connections, isLoading, loadMore, hasMore } = useProfileConnections(
 *   CONNECTION_TYPE.FOLLOWERS
 * );
 * ```
 */
export function useProfileConnections(type: ConnectionType, userId?: Pubky): UseProfileConnectionsResult {
  // Get current user from auth store if userId not provided
  const { currentUserPubky } = useAuthStore();
  const targetUserId = userId ?? currentUserPubky;

  // State for user IDs (pagination)
  const [userIds, setUserIds] = useState<Pubky[]>([]);
  const [skip, setSkip] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Refs for stable callbacks
  const userIdsRef = useRef<Pubky[]>([]);

  // Build stream ID: userId:connectionType (e.g., 'user123:followers')
  const streamId = targetUserId ? (`${targetUserId}:${type}` as UserStreamCompositeId) : null;

  // Subscribe to stream changes for reactive updates (follow/unfollow)
  const cachedStream = useLiveQuery(
    async () => {
      try {
        if (!streamId) return null;
        return (await LocalStreamUsersService.findById(streamId))?.stream ?? null;
      } catch (error) {
        Logger.error('[useProfileConnections] Failed to query cached stream', { streamId, error });
        return null;
      }
    },
    [streamId],
    null,
  );

  // Sync userIds when stream changes in cache (e.g., after follow/unfollow)
  useEffect(() => {
    if (cachedStream !== null && !isLoading) {
      const hasPaginated = skip > Config.NEXUS_USERS_PER_PAGE;
      if (hasPaginated) return;

      // For own following list: only sync when cache has MORE users (new follows)
      // Block sync when cache has fewer users (unfollows) to preserve UI state
      // This allows new follows to appear reactively while keeping unfollowed users visible
      const isOwnFollowing = targetUserId === currentUserPubky && type === 'following';
      if (isOwnFollowing && cachedStream.length <= userIdsRef.current.length) return;

      userIdsRef.current = cachedStream;
      setUserIds(cachedStream);
    }
  }, [cachedStream, isLoading, skip, targetUserId, currentUserPubky, type]);

  // Subscribe to user details from local database (reactive via Controller)
  const userDetailsMap = useLiveQuery(
    async () => {
      try {
        if (userIds.length === 0) return new Map<Pubky, NexusUserDetails>();
        return await UserController.getManyDetails({ userIds });
      } catch (error) {
        Logger.error('[useProfileConnections] Failed to query user details', { userIds, error });
        return new Map<Pubky, NexusUserDetails>();
      }
    },
    [userIds],
    new Map<Pubky, NexusUserDetails>(),
  );

  // Subscribe to user counts from local database (reactive via Controller)
  const userCountsMap = useLiveQuery(
    async () => {
      try {
        if (userIds.length === 0) return new Map<Pubky, NexusUserCounts>();
        return await UserController.getManyCounts({ userIds });
      } catch (error) {
        Logger.error('[useProfileConnections] Failed to query user counts', { userIds, error });
        return new Map<Pubky, NexusUserCounts>();
      }
    },
    [userIds],
    new Map<Pubky, NexusUserCounts>(),
  );

  // Subscribe to relationships from local database (reactive via Controller)
  // This tracks whether the current user is following each connection
  const userRelationshipsMap = useLiveQuery(
    async () => {
      try {
        if (userIds.length === 0) return new Map<Pubky, UserRelationshipsModelSchema>();
        return await UserController.getManyRelationships({ userIds });
      } catch (error) {
        Logger.error('[useProfileConnections] Failed to query user relationships', { userIds, error });
        return new Map<Pubky, UserRelationshipsModelSchema>();
      }
    },
    [userIds],
    new Map<Pubky, UserRelationshipsModelSchema>(),
  );

  // State for user tags (fetched with local-first strategy + API fallback)
  const [userTagsMap, setUserTagsMap] = useState<Map<Pubky, NexusTag[]>>(new Map());

  // Fetch user tags (local-first with API fallback for missing)
  useEffect(() => {
    if (userIds.length === 0) {
      setUserTagsMap(new Map());
      return;
    }

    const fetchTags = async () => {
      try {
        const tagsMap = await UserController.getManyTagsOrFetch({ userIds });
        setUserTagsMap(tagsMap);
      } catch (err) {
        Logger.error('[useProfileConnections] Failed to fetch user tags:', err);
        setUserTagsMap(new Map());
      }
    };

    void fetchTags();
  }, [userIds]);

  // Combine user IDs with their details, tags, and computed avatar URLs
  const connections = useMemo((): UserConnectionData[] => {
    return userIds.map((id) => {
      const details = userDetailsMap.get(id);
      const counts = userCountsMap.get(id);
      const relationship = userRelationshipsMap.get(id);
      const userTags = userTagsMap.get(id);
      // Only compute CDN avatar URL if user has an image set
      const avatarUrl = details?.image ? FileController.getAvatarUrl(id) : null;
      // Extract tag labels from NexusTag objects
      const tags = userTags?.map((tag) => tag.label) ?? [];

      if (!details) {
        // Return minimal data if details not yet loaded
        return {
          id,
          name: '',
          bio: '',
          image: null,
          status: null,
          links: null,
          indexed_at: 0,
          avatarUrl: null,
          tags,
          stats: { tags: 0, posts: 0 },
          isFollowing: relationship?.following ?? false,
        } as UserConnectionData;
      }

      return {
        ...details,
        avatarUrl,
        tags,
        stats: {
          tags: counts?.unique_tags ?? 0,
          posts: counts?.posts ?? 0,
        },
        isFollowing: relationship?.following ?? false,
      } as UserConnectionData;
    });
    // Note: We no longer filter out users with empty names - they will appear
    // with placeholder data while their details are being fetched in background
  }, [userIds, userDetailsMap, userCountsMap, userRelationshipsMap, userTagsMap]);

  /**
   * Fetches a slice from the user stream
   */
  const fetchStreamSlice = useCallback(
    async (isInitialLoad: boolean) => {
      if (!streamId) {
        setIsLoading(false);
        return;
      }

      if (isInitialLoad) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      setError(null);

      try {
        const currentSkip = isInitialLoad ? 0 : skip;

        // For own following list, snapshot the cache BEFORE fetch
        // The fetch may pollute the cache with stale API data
        const isOwnFollowing = targetUserId === currentUserPubky && type === 'following';
        const preFetchCache = isOwnFollowing ? await LocalStreamUsersService.findById(streamId) : null;

        const result = await StreamUserController.getOrFetchStreamSlice({
          streamId,
          skip: currentSkip,
          limit: Config.NEXUS_USERS_PER_PAGE,
        });

        let pageIds = result.nextPageIds;

        // Filter API results against pre-fetch cache snapshot
        // This handles eventual consistency where API returns unfollowed users
        if (preFetchCache) {
          const cachedSet = new Set(preFetchCache.stream);
          pageIds = pageIds.filter((id) => cachedSet.has(id));

          // Get current cache after fetch (may contain new follows added during session)
          const postFetchCache = await LocalStreamUsersService.findById(streamId);

          // Merge: start with pre-fetch snapshot, then add any NEW follows from post-fetch
          // that weren't in the pre-fetch (these are new follows made during the session)
          const preFetchSet = new Set(preFetchCache.stream);
          const newFollows = postFetchCache?.stream.filter((id) => !preFetchSet.has(id)) ?? [];
          const mergedStream = [...preFetchCache.stream, ...newFollows];

          // Reset cache to merged state (preserves new follows while undoing API pollution)
          await LocalStreamUsersService.upsert({ streamId, stream: mergedStream });
        }

        // Handle empty results
        if (pageIds.length === 0) {
          Logger.debug('[useProfileConnections] Empty result, no more connections');
          setHasMore(false);
          return;
        }

        // Deduplicate user IDs
        const existingIds = new Set(userIdsRef.current);
        const newUniqueIds = pageIds.filter((id) => !existingIds.has(id));

        // Update skip cursor for next pagination
        const nextSkip = result.skip ?? currentSkip + pageIds.length;
        setSkip(nextSkip);

        // Check hasMore based on response length
        const hasMoreConnections = pageIds.length >= Config.NEXUS_USERS_PER_PAGE;
        setHasMore(hasMoreConnections);

        // Update state with all IDs (including duplicates for cursor tracking)
        const updatedIds = isInitialLoad ? pageIds : [...userIdsRef.current, ...newUniqueIds];
        userIdsRef.current = updatedIds;
        setUserIds(updatedIds);
      } catch (err) {
        const errorMessage = isAppError(err) ? err.message : 'Failed to fetch connections';
        setError(errorMessage);
        setHasMore(false);
        Logger.error('[useProfileConnections] Failed to fetch stream slice:', err);
      } finally {
        if (isInitialLoad) {
          setIsLoading(false);
        } else {
          setIsLoadingMore(false);
        }
      }
    },
    [streamId, skip, targetUserId, currentUserPubky, type],
  );

  /**
   * Clears all state
   */
  const clearState = useCallback(() => {
    userIdsRef.current = [];
    setUserIds([]);
    setSkip(0);
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
    if (isLoadingMore || !hasMore) return;
    await fetchStreamSlice(false);
  }, [isLoadingMore, hasMore, fetchStreamSlice]);

  // Initial load and reset when streamId changes
  useEffect(() => {
    clearState();
    fetchStreamSlice(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId]);

  return {
    connections,
    count: connections.length,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
  };
}
