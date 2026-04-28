'use client';

import { useLocalFirstQuery } from '@/hooks/useLocalFirstQuery/useLocalFirstQuery';
import { ProfileStats, UseProfileStatsResult } from './useProfileStats.types';
import { UserController } from '@/controllers/user/user';
import type { NexusUserCounts } from '@/services/nexus/nexus.types';
import { useNotificationStore } from '@/stores/notification/notification.store';
/**
 * Hook for fetching and transforming user profile statistics.
 * Pure data fetching and transformation - no side effects or actions.
 *
 * Uses the local-first query pattern (ADR-0011) via `useLocalFirstQuery`:
 * 1. fetchFn (useEffect): Ensures data exists (fetch full entity from Nexus if missing)
 * 2. queryFn (useLiveQuery): Reads current data reactively from local DB
 *
 * Previously had a buggy fetch condition (`userCounts !== null`) that was inverted —
 * it fired prematurely when undefined and skipped when null. Now handled correctly
 * by `useLocalFirstQuery` which gates both arms via `enabled`.
 *
 * @param userId - The user ID to fetch stats for
 * @returns Profile statistics and loading state
 */
export function useProfileStats(userId: string): UseProfileStatsResult {
  // Fetch user counts using local-first pattern — replaces manual useLiveQuery + buggy useEffect
  const { data: userCounts, isLoading } = useLocalFirstQuery<NexusUserCounts>({
    queryFn: () => UserController.getCounts({ userId }),
    fetchFn: () => UserController.fetchCounts({ userId }),
    deps: [userId],
    enabled: !!userId,
  });

  // Get unread notifications count reactively from Zustand store
  const unreadNotificationsCount = useNotificationStore((state) => state.selectUnread());

  // Build stats object from user counts
  // IMPORTANT: Backend counts.posts includes replies, so we subtract to get actual posts
  const totalPosts = userCounts?.posts ?? 0;
  const repliesCount = userCounts?.replies ?? 0;
  const actualPostsCount = Math.max(0, totalPosts - repliesCount);

  const stats: ProfileStats = {
    notifications: unreadNotificationsCount,
    posts: actualPostsCount,
    replies: repliesCount,
    followers: userCounts?.followers ?? 0,
    following: userCounts?.following ?? 0,
    friends: userCounts?.friends ?? 0,
    uniqueTags: userCounts?.unique_tags ?? 0,
  };

  // Distinguish between:
  // - undefined: query hasn't run yet → loading
  // - null: query ran but counts not found → loaded, using default 0s
  // - object: query ran and found counts → loaded with data
  return {
    stats,
    isLoading,
  };
}
