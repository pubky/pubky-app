'use client';

import { useEffect, useState } from 'react';
import { useFollowUser } from '@/hooks/useFollowUser/useFollowUser';
import type { Pubky } from '@/models/models.types';

type UseWhoToFollowFollowPreservationParams = {
  resetKey?: string;
};

export function useWhoToFollowFollowPreservation({ resetKey }: UseWhoToFollowFollowPreservationParams = {}) {
  const [preservedFollowedUserIds, setPreservedFollowedUserIds] = useState<Pubky[]>([]);
  // Counted here rather than reusing `useFollowUser().isLoading`: that flag is a single boolean
  // shared by concurrent toggles, so the first completion would clear it while another is in flight.
  const [pendingFollowCount, setPendingFollowCount] = useState(0);
  const { toggleFollow, isUserLoading } = useFollowUser();

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

  const handleFollowClick = async (userId: Pubky, isCurrentlyFollowing: boolean, displayName: string) => {
    updatePreservedUserIds(userId, isCurrentlyFollowing);
    setPendingFollowCount((count) => count + 1);

    try {
      const ok = await toggleFollow(userId, isCurrentlyFollowing, displayName);
      if (!ok) {
        rollbackPreservedUserIds(userId, isCurrentlyFollowing);
      }
    } finally {
      setPendingFollowCount((count) => count - 1);
    }
  };

  return {
    preservedFollowedUserIds,
    handleFollowClick,
    isUserLoading,
    /**
     * True while any `handleFollowClick` is still committing (concurrent clicks included).
     * Relationship-derived state (e.g. `isFollowing`, followed counts) lags behind the click
     * until the local write lands, so callers that act on that state should wait for this to clear.
     */
    isFollowPending: pendingFollowCount > 0,
    /** Keep a user visible after a follow committed outside `handleFollowClick` (e.g. Follow All). */
    preserveFollowedUser: (userId: Pubky) => updatePreservedUserIds(userId, false),
  };
}
