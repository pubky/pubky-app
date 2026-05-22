'use client';

import { ProfileActions, useProfileActions } from '@/hooks/useProfileActions/useProfileActions';
import { useProfileStats } from '@/hooks/useProfileStats/useProfileStats';
import type { ProfileStats } from '@/hooks/useProfileStats/useProfileStats.types';
import { UserProfile, useUserProfile } from '@/hooks/useUserProfile/useUserProfile';

// Re-export types from composed hooks for backwards compatibility
export type { ProfileActions, ProfileStats, UserProfile };

interface UseProfileHeaderOptions {
  /** When false, skips profile and stats local-first queries (e.g. invalid pubky in URL). */
  enabled?: boolean;
}

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
 * @param options - Optional gate for local-first queries (defaults to enabled)
 * @returns Combined profile data (never null), stats, actions, `isLoading` (profile or stats),
 *   `isProfileLoading` (profile only), and `userNotFound`
 */
export function useProfileHeader(userId: string, options?: UseProfileHeaderOptions) {
  // Fetch user profile data
  const { profile, isLoading: isProfileLoading } = useUserProfile(userId, options);

  // Fetch profile statistics
  const { stats, isLoading: isStatsLoading } = useProfileStats(userId, options);

  // Determine if loading is complete (profile + stats — used for overall readiness)
  const isLoading = isProfileLoading || isStatsLoading;

  // User missing on Nexus: profile query settled with null — do not wait for counts
  const userNotFound = !isProfileLoading && profile === null;

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
    isProfileLoading,
    userNotFound,
  };
}
