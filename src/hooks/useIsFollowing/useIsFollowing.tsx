'use client';

import { useEffect } from 'react';
import { UserController } from '@/controllers/user/user';
import { TtlCoordinator } from '@/coordinators/ttl/ttl';
import { useLocalFirstQuery } from '@/hooks/useLocalFirstQuery/useLocalFirstQuery';
import { isPubkyIdentifier } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import type { NexusUserRelationship } from '@/services/nexus/nexus.types';
import { useAuthStore } from '@/stores/auth/auth.store';
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
 * A cached relationship row is never re-fetched by the local-first query, so the target user is
 * also subscribed to the TTL coordinator while the hook is mounted. Rows that went stale (follow
 * from another device, or a row cached before the viewer-aware fetch existed) are refreshed once
 * the user TTL elapses (#1803).
 */
export function useIsFollowing(targetUserId: string): UseIsFollowingResult {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);

  // Don't fetch or query if targeting yourself or if either ID is missing
  const enabled = !!targetUserId && !!currentUserPubky && targetUserId !== currentUserPubky;

  const { data: relationship, isLoading } = useLocalFirstQuery<NexusUserRelationship>({
    queryFn: () => UserController.getRelationships({ userId: targetUserId }),
    fetchFn: () => UserController.fetch({ userId: targetUserId }),
    deps: [targetUserId, currentUserPubky],
    enabled,
  });

  // Keep a cached relationship fresh: the coordinator re-fetches the user (viewer-aware) once stale.
  useEffect(() => {
    if (!enabled || !isPubkyIdentifier(targetUserId)) return;

    const coordinator = TtlCoordinator.getInstance();
    const pubky = targetUserId as Pubky;
    coordinator.subscribeUser({ pubky });

    return () => {
      coordinator.unsubscribeUser({ pubky });
    };
  }, [enabled, targetUserId]);

  // If no relationship record exists, default to not following
  const isFollowing = relationship?.following ?? false;

  return {
    isFollowing,
    isLoading,
  };
}
