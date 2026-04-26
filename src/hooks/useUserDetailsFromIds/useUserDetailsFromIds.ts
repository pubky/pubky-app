'use client';

import { useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as Core from '@/core';
import type {
  UseUserDetailsFromIdsParams,
  UseUserDetailsFromIdsResult,
  AutocompleteUserData,
} from './useUserDetailsFromIds.types';
import { FALLBACK_USER_NAME } from './useUserDetailsFromIds.constants';
import { Logger } from '@/libs/logger/logger';

/**
 * Hook to fetch and transform user details from a list of user IDs.
 *
 * Uses useLiveQuery for reactive cache reads and optionally prefetches
 * user details into the cache.
 *
 * @example
 * ```tsx
 * const [userIds, setUserIds] = useState<Pubky[]>([]);
 * const { users, isLoading } = useUserDetailsFromIds({ userIds });
 * ```
 */
export function useUserDetailsFromIds({
  userIds,
  prefetch = true,
}: UseUserDetailsFromIdsParams): UseUserDetailsFromIdsResult {
  // Fetch user details from cache reactively
  const userDetailsMap = useLiveQuery(
    async () => {
      if (userIds.length === 0) return new Map<Core.Pubky, Core.NexusUserDetails>();
      return await Core.UserController.getManyDetails({ userIds });
    },
    [userIds],
    new Map<Core.Pubky, Core.NexusUserDetails>(),
  );

  // Transform user details map to AutocompleteUserData array
  // Memoized to provide stable reference
  const users = useMemo(() => {
    const result: AutocompleteUserData[] = [];
    if (userDetailsMap.size > 0) {
      for (const userId of userIds) {
        const details = userDetailsMap.get(userId);
        if (details) {
          const avatarUrl = details.image ? Core.FileController.getAvatarUrl(details.id) : undefined;
          result.push({
            id: userId,
            name: details.name || FALLBACK_USER_NAME,
            avatarUrl,
          });
        }
      }
    }
    return result;
  }, [userIds, userDetailsMap]);

  // Prefetch user details into cache
  useEffect(() => {
    if (!prefetch || userIds.length === 0) return;

    void Promise.all(
      userIds.map((userId) =>
        Core.UserController.getOrFetchDetails({ userId }).catch((error) => {
          Logger.error('[useUserDetailsFromIds] Failed to fetch user details:', { userId, error });
        }),
      ),
    );
  }, [userIds, prefetch]);

  // Loading state: waiting for user details to load
  const isLoading = userIds.length > 0 && userDetailsMap.size === 0;

  return {
    users,
    isLoading,
  };
}
