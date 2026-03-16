'use client';

import * as Core from '@/core';
import { useLocalFirstQuery } from '@/hooks/useLocalFirstQuery';
import type { UseIsFollowingResult } from './useIsFollowing.types';

/**
 * useIsFollowing
 *
 * Hook that checks if the current user is following a target user.
 * If the relationship data is not in cache, it will trigger a fetch from Nexus.
 *
 * Uses the local-first query pattern (ADR-0011) via `useLocalFirstQuery`:
 * 1. fetchFn (useEffect): Ensures data exists (fetch full entity from Nexus if missing)
 * 2. queryFn (useLiveQuery): Reads current data reactively from local DB
 *
 * @param targetUserId - The user ID to check if the current user is following
 * @returns Whether the current user is following the target user and loading state
 *
 * @example
 * ```tsx
 * const { isFollowing, isLoading } = useIsFollowing('pubkyabc123');
 *
 * if (isLoading) return <Spinner />;
 * return isFollowing ? <UnfollowButton /> : <FollowButton />;
 * ```
 */
export function useIsFollowing(targetUserId: string): UseIsFollowingResult {
  const { currentUserPubky } = Core.useAuthStore();

  // Don't fetch or query if targeting yourself or if either ID is missing
  const enabled = !!targetUserId && !!currentUserPubky && targetUserId !== currentUserPubky;

  const { data: relationship, isLoading } = useLocalFirstQuery<Core.NexusUserRelationship>({
    queryFn: () => Core.UserController.getRelationships({ userId: targetUserId }),
    fetchFn: () => Core.UserController.fetch({ userId: targetUserId }),
    deps: [targetUserId, currentUserPubky],
    enabled,
  });

  // If no relationship record exists, default to not following
  const isFollowing = relationship?.following ?? false;

  return {
    isFollowing,
    isLoading,
  };
}
