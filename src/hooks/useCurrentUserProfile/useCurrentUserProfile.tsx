'use client';

import * as Core from '@/core';
import { useLocalFirstQuery } from '@/hooks/useLocalFirstQuery';
import * as Types from './index';

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
export function useCurrentUserProfile(): Types.UseCurrentUserProfileResult {
  const currentUserPubky = Core.useAuthStore((state) => state.currentUserPubky);

  const { data: userDetails } = useLocalFirstQuery<Core.NexusUserDetails>({
    queryFn: () => Core.UserController.getDetails({ userId: currentUserPubky! }),
    fetchFn: () => Core.UserController.fetchDetails({ userId: currentUserPubky! }),
    deps: [currentUserPubky],
    enabled: !!currentUserPubky,
  });

  return { userDetails, currentUserPubky };
}
