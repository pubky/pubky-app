'use client';

import { useUserProfile, UserProfile } from '@/hooks/useUserProfile/useUserProfile';
import type { ProfileStats } from '@/hooks/useProfileStats/useProfileStats.types';
import { useProfileStats } from '@/hooks/useProfileStats/useProfileStats';
import { useProfileActions, ProfileActions } from '@/hooks/useProfileActions/useProfileActions';

// Re-export types from composed hooks for backwards compatibility
export type { ProfileStats, UserProfile, ProfileActions };

/**
 * Default profile data used during loading state or when profile is unavailable.
 */
const DEFAULT_PROFILE: UserProfile = {
  name: '',
  bio: '',
  publicKey: '',
  emoji: '🌴',
  status: '',
  avatarUrl: undefined,
  link: '',
};

/**
 * Composite hook that combines user profile data, stats, and actions.
 * This hook composes three focused hooks following Single Responsibility Principle:
 *
 * - useUserProfile: Pure data fetching for user details
 * - useProfileStats: Pure data fetching for statistics
 * - useProfileActions: Action handlers for user interactions
 *
 * Note: This hook guarantees a non-null profile object by providing default values
 * during loading state. Consumers should check `isLoading` to determine data readiness.
 * Consumers should also check `userNotFound` to determine if the user does not exist.
 *
 * @param userId - The user ID to fetch profile data for
 * @returns Combined profile data (never null), stats, actions, loading state, and userNotFound flag
 */
export function useProfileHeader(userId: string) {
  // Fetch user profile data
  const { profile, isLoading: isProfileLoading } = useUserProfile(userId);

  // Fetch profile statistics
  const { stats, isLoading: isStatsLoading } = useProfileStats(userId);

  // Determine if loading is complete
  const isLoading = isProfileLoading || isStatsLoading;

  // Determine if user was not found (loading finished but no profile data)
  // This is true when the query has completed but returned null
  const userNotFound = !isLoading && profile === null;

  // Provide default profile values when profile is null (loading state or not found)
  // This centralizes the fallback logic and ensures type consistency
  const profileData = profile ?? DEFAULT_PROFILE;

  // Get action handlers (only when profile is available)
  const actions = useProfileActions({
    publicKey: profileData.publicKey,
    link: profileData.link,
  });

  return {
    profile: profileData,
    stats,
    actions,
    isLoading,
    userNotFound,
  };
}
