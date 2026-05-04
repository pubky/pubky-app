'use client';

import { useLocalFirstQuery } from '@/hooks/useLocalFirstQuery/useLocalFirstQuery';
import type { UseUserDetailsResult } from './useUserDetails.types';
import { UserController } from '@/controllers/user/user';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
/**
 * Hook to get user details from local database with live updates.
 * If the user is not in cache, it will trigger a fetch from Nexus.
 *
 * Uses the local-first query pattern (ADR-0011) via `useLocalFirstQuery`:
 * 1. fetchFn (useEffect): Ensures data exists (fetch full entity from Nexus if missing)
 * 2. queryFn (useLiveQuery): Reads current data reactively from local DB
 *
 * @param userId - The user ID to fetch details for (can be null/undefined)
 * @returns User details and loading state
 *
 * @example
 * ```tsx
 * const { userDetails, isLoading } = useUserDetails(userId);
 * if (isLoading) return <Skeleton />;
 * return <span>{userDetails?.name ?? 'Unknown'}</span>;
 * ```
 */
export function useUserDetails(userId: string | null | undefined): UseUserDetailsResult {
  const { data, isLoading } = useLocalFirstQuery<NexusUserDetails>({
    queryFn: () => UserController.getDetails({ userId: userId! }),
    fetchFn: () => UserController.fetchDetails({ userId: userId! }),
    deps: [userId],
    enabled: !!userId,
  });

  return {
    userDetails: data,
    isLoading,
  };
}
