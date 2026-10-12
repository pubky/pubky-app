'use client';

import { useEffect } from 'react';
import { getLockServer } from '@/config/network';
import { LocksController } from '@/controllers/locks/locks';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';

/**
 * Restores the Locks session from the persisted bearer secret once the store has hydrated.
 *
 * No-ops while the Lock Server is unconfigured (Locks disabled). Mounted once in
 * `RouteGuardProvider`, alongside the homeserver restore.
 */
export function useRestoreLocksAuth(): void {
  const hasHydrated = useLocksAuthStore((state) => state.hasHydrated);
  const secret = useLocksAuthStore((state) => state.locksSessionSecret);
  const authHasHydrated = useAuthStore((state) => state.hasHydrated);
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const generation = useAuthStore((state) => state.generation);

  useEffect(() => {
    if (!hasHydrated || !authHasHydrated || !currentUserPubky || !getLockServer()) return;
    void LocksController.restorePersistedLocksSession();
  }, [hasHydrated, authHasHydrated, currentUserPubky, generation, secret]);
}
