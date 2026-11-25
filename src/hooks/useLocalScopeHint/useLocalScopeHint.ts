'use client';

import { hasLocalIndexSource } from '@/config/nexus';
import { useAuthStore } from '@/stores/auth/auth.store';

/** The hint next to a ranking or suggestion list that the local index answers. */
export const LOCAL_SCOPE_HINT = 'In your network';

/**
 * `LOCAL_SCOPE_HINT` while the local index answers the signed-in user's rankings and counts, which then range over
 * the people their network reaches rather than everyone; `undefined` otherwise. A visitor's index has no network, so
 * those reads go to Nexus or nowhere.
 */
export function useLocalScopeHint(): string | undefined {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  return hasLocalIndexSource() && currentUserPubky ? LOCAL_SCOPE_HINT : undefined;
}
