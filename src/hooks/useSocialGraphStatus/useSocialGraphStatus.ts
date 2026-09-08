'use client';

import type { TUserSocialGraphStatusResult } from '@/application/user/user.types';
import { UserController } from '@/controllers/user/user';
import { isLocalFirstQueryEnabled, useLocalFirstQuery } from '@/hooks/useLocalFirstQuery/useLocalFirstQuery';
import type { UseSocialGraphStatusResult } from './useSocialGraphStatus.types';

/**
 * Hook that resolves a user's social graph badge tier.
 *
 * The tier lives on the full Nexus user view, so a profile cached from a details-only
 * fetch does not carry it yet. Uses the local-first query pattern (ADR-0011) via
 * `useLocalFirstQuery`:
 * 1. queryFn (useLiveQuery): Reads the tier reactively from the local details row
 * 2. fetchFn (useEffect): Fetches and persists the full user view when the tier is unknown
 *    (`UserController.fetch` scopes the request to the signed-in viewer)
 *
 * `status` is `null` both while unknown and when Nexus has no ranking, so callers can
 * simply hide the badge on `null`.
 *
 * @param userId - The user whose tier to resolve (can be null/undefined)
 * @returns Badge tier and loading state
 *
 * @example
 * ```tsx
 * const { status } = useSocialGraphStatus(pubky);
 * return status ? <SocialGraphBadge status={status} /> : null;
 * ```
 */
export function useSocialGraphStatus(userId: string | null | undefined): UseSocialGraphStatusResult {
  const enabled = isLocalFirstQueryEnabled(userId);

  const { data, isLoading } = useLocalFirstQuery<TUserSocialGraphStatusResult>({
    queryFn: () => UserController.getSocialGraphStatus({ userId: userId! }),
    fetchFn: () => UserController.fetch({ userId: userId! }),
    deps: [userId],
    enabled,
  });

  return {
    status: data?.status ?? null,
    isLoading,
  };
}
