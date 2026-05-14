'use client';

import { UserController } from '@/controllers/user/user';
import { useLocalFirstQuery } from '@/hooks/useLocalFirstQuery/useLocalFirstQuery';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { UseCurrentUserProfileResult } from './useCurrentUserProfile.types';

/**
 * Hook to get the current logged-in user's profile details.
 * Combines authentication state with live database queries.
 *
 * Uses the local-first query pattern (ADR-0011) via `useLocalFirstQuery`:
 * 1. fetchFn (useEffect): Ensures data exists (fetch full entity from Nexus if missing)
 * 2. queryFn (useLiveQuery): Reads current data reactively from local DB
 *
 * @returns Object containing userDetails and currentUserPubky
 *
 * @example
 * ```tsx
 * const { userDetails, currentUserPubky } = useCurrentUserProfile();
 * if (!userDetails) return <div>Not logged in</div>;
 * return <div>{userDetails.name}</div>;
 * ```
 */
export function useCurrentUserProfile(): UseCurrentUserProfileResult {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);

  const { data: userDetails } = useLocalFirstQuery<NexusUserDetails>({
    queryFn: () => UserController.getDetails({ userId: currentUserPubky! }),
    fetchFn: () => UserController.fetchDetails({ userId: currentUserPubky! }),
    deps: [currentUserPubky],
    enabled: !!currentUserPubky,
  });

  return { userDetails, currentUserPubky };
}
