'use client';

import { DEFAULT_URL } from '@/config/metadata';
import { useLocalFirstQuery } from '@/hooks/useLocalFirstQuery/useLocalFirstQuery';
import { withPubkyPrefix } from '@/libs/utils/utils';
import { FileController } from '@/controllers/file/file';
import { UserController } from '@/controllers/user/user';
import type { NexusUserDetails, NexusUserLink } from '@/services/nexus/nexus.types';
export interface UserProfile {
  name: string;
  bio: string;
  publicKey: string;
  emoji: string;
  status: string;
  avatarUrl?: string;
  link: string;
  /** User's external links (social media, websites, etc.) */
  links?: NexusUserLink[] | null;
}

export interface UseUserProfileResult {
  profile: UserProfile | null;
  isLoading: boolean;
}

/**
 * Hook for fetching and transforming user profile data.
 * Pure data fetching - no side effects or actions.
 *
 * Uses the local-first query pattern (ADR-0011) via `useLocalFirstQuery`:
 * 1. fetchFn (useEffect): Ensures data exists in local DB (fetch if missing)
 * 2. queryFn (useLiveQuery): Reads current data reactively from local DB
 *
 * Note: Data freshness is managed by TTL Coordinator via useTtlSubscription
 * in the consuming component (e.g., ProfilePageHeader)
 *
 * @param userId - The user ID to fetch profile for
 * @returns Profile data and loading state
 */
export function useUserProfile(userId: string): UseUserProfileResult {
  const { data: userDetails, isLoading } = useLocalFirstQuery<NexusUserDetails>({
    queryFn: () => UserController.getDetails({ userId }),
    fetchFn: () => UserController.fetchDetails({ userId }),
    deps: [userId],
    enabled: !!userId,
  });

  if (!userDetails) {
    return { profile: null, isLoading };
  }

  const avatarUrl = userDetails.image ? FileController.getAvatarUrl(userDetails.id, userDetails.indexed_at) : undefined;

  // Build public key with proper format
  const publicKey = withPubkyPrefix(userId);

  // Build profile link using config (SSR-safe)
  // Use DEFAULT_URL from config to avoid window.location.origin which breaks SSR
  const link = `${DEFAULT_URL}/profile/${userId}`;

  const profile: UserProfile = {
    name: userDetails.name ?? '',
    bio: userDetails.bio ?? '',
    publicKey,
    emoji: '🌴', // Default emoji, TODO: get from user data when available
    status: userDetails.status ?? '',
    avatarUrl,
    link,
    links: userDetails.links,
  };

  return {
    profile,
    isLoading: false,
  };
}
