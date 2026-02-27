'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as Core from '@/core';
import * as Libs from '@/libs';
import type { UseBulkUserAvatarsResult, UserWithAvatar } from './useBulkUserAvatars.types';

/**
 * Hook to get user details with avatar URLs for multiple users.
 * Fetches user details from local DB and computes CDN avatar URLs.
 *
 * @param userIds - Array of user IDs to fetch details for
 * @returns Map of users with avatars and helper function
 *
 * @example
 * ```tsx
 * const { getUsersWithAvatars } = useBulkUserAvatars(allUserIds);
 *
 * // Get formatted users for a specific list
 * const taggers = getUsersWithAvatars(tag.taggers_id);
 * ```
 */
export function useBulkUserAvatars(userIds: Core.Pubky[]): UseBulkUserAvatarsResult {
  // Deduplicate user IDs
  const uniqueUserIds = useMemo(() => Array.from(new Set(userIds)), [userIds]);

  // Fetch user details from local DB (reactive)
  const userDetailsMap = useLiveQuery(
    async () => {
      try {
        if (uniqueUserIds.length === 0) return new Map<Core.Pubky, Core.NexusUserDetails>();
        return await Core.UserController.getManyDetails({ userIds: uniqueUserIds });
      } catch (error) {
        Libs.Logger.error('[useBulkUserAvatars] Failed to query user details', { userIds: uniqueUserIds, error });
        return new Map<Core.Pubky, Core.NexusUserDetails>();
      }
    },
    [uniqueUserIds],
    new Map<Core.Pubky, Core.NexusUserDetails>(),
  );

  useEffect(() => {
    if (uniqueUserIds.length > 0) {
      Core.StreamUserController.getOrFetchUsers({ userIds: uniqueUserIds });
    }
  }, [uniqueUserIds]);

  // Build map of users with computed avatar URLs
  const usersMap = useMemo(() => {
    const map = new Map<Core.Pubky, UserWithAvatar>();
    for (const id of uniqueUserIds) {
      const details = userDetailsMap.get(id);
      const avatarUrl = details?.image ? Core.FileController.getAvatarUrl(id) : undefined;
      map.set(id, {
        id,
        name: details?.name,
        avatarUrl,
      });
    }
    return map;
  }, [uniqueUserIds, userDetailsMap]);

  // Helper to get users with avatars for a list of IDs
  const getUsersWithAvatars = useCallback(
    (ids: Core.Pubky[]): UserWithAvatar[] => {
      return ids.map((id) => usersMap.get(id) ?? { id, name: undefined, avatarUrl: undefined });
    },
    [usersMap],
  );

  return {
    usersMap,
    getUsersWithAvatars,
    isLoading: userDetailsMap.size === 0 && uniqueUserIds.length > 0,
  };
}
