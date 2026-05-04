'use client';

import { useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { UseMutedUsersResult } from './useMutedUsers.types';
import { stripPubkyPrefix } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
const EMPTY_ARRAY: Pubky[] = [];

/**
 * useMutedUsers
 *
 * Hook for accessing muted user IDs from the local muted stream.
 * Uses liveQuery for reactive updates when the muted stream changes.
 *
 * IMPORTANT: Both the array and Set are memoized to maintain referential stability.
 * This prevents infinite re-renders when components use these values as dependencies.
 */
export function useMutedUsers(): UseMutedUsersResult {
  // TODO: Use the controller instead of the service
  const mutedStream = useLiveQuery(async () => LocalStreamUsersService.findById(UserStreamTypes.MUTED), []);

  // Use stable empty array reference to avoid dependency instability
  const mutedUserIds = mutedStream?.stream ?? EMPTY_ARRAY;

  // Memoize the Set to maintain referential stability across renders.
  // Only recreate when the actual user IDs change.
  const mutedUserIdSet = useMemo(() => new Set(mutedUserIds), [mutedUserIds]);

  // Memoize the callback to maintain referential stability.
  // Normalize userId to handle both prefixed (pubky:xxx, pk:xxx) and raw formats
  const isMuted = useCallback(
    (userId: Pubky) => mutedUserIdSet.has(stripPubkyPrefix(userId) as Pubky),
    [mutedUserIdSet],
  );

  return {
    mutedUserIds,
    mutedUserIdSet,
    isMuted,
    isLoading: mutedStream === undefined,
  };
}
