'use client';

import { useEffect, useState } from 'react';
import { useFollowUser } from '@/hooks/useFollowUser/useFollowUser';
import type { Pubky } from '@/models/models.types';

type UseWhoToFollowFollowPreservationParams = {
  resetKey?: string;
};

export function useWhoToFollowFollowPreservation({ resetKey }: UseWhoToFollowFollowPreservationParams = {}) {
  const [preservedFollowedUserIds, setPreservedFollowedUserIds] = useState<Pubky[]>([]);
  const { toggleFollow, isUserLoading, isLoading: isFollowPending } = useFollowUser();

  useEffect(() => {
    setPreservedFollowedUserIds((prev) => (prev.length > 0 ? [] : prev));
  }, [resetKey]);

  const updatePreservedUserIds = (userId: Pubky, isCurrentlyFollowing: boolean) => {
    setPreservedFollowedUserIds((prev) => {
      if (isCurrentlyFollowing) {
        return prev.filter((id) => id !== userId);
      }
      return prev.includes(userId) ? prev : [...prev, userId];
    });
  };

  const rollbackPreservedUserIds = (userId: Pubky, wasFollowing: boolean) => {
    setPreservedFollowedUserIds((prev) => {
      if (wasFollowing) {
        return prev.includes(userId) ? prev : [...prev, userId];
      }
      return prev.filter((id) => id !== userId);
    });
  };

  const handleFollowClick = async (userId: Pubky, isCurrentlyFollowing: boolean) => {
    updatePreservedUserIds(userId, isCurrentlyFollowing);

    const ok = await toggleFollow(userId, isCurrentlyFollowing);
    if (!ok) {
      rollbackPreservedUserIds(userId, isCurrentlyFollowing);
    }
  };

  return {
    preservedFollowedUserIds,
    handleFollowClick,
    isUserLoading,
    /**
     * True while any follow toggle is still committing (concurrent clicks included).
     * Relationship-derived state (e.g. `isFollowing`, followed counts) lags behind the click
     * until the local write lands, so callers that act on that state should wait for this to clear.
     */
    isFollowPending,
    /** Drop a user from preservation after a follow committed outside `handleFollowClick` failed. */
    unpreserveFollowedUser: (userId: Pubky) => rollbackPreservedUserIds(userId, false),
    /** Keep a user visible after a follow committed outside `handleFollowClick` (e.g. Follow All). */
    preserveFollowedUser: (userId: Pubky) => updatePreservedUserIds(userId, false),
  };
}
