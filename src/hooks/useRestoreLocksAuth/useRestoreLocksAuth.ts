'use client';

import { useEffect } from 'react';
import { getLockServer } from '@/config/network';
import { LocksController } from '@/controllers/locks/locks';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';

/**
 * Restores the Locks session from the persisted bearer secret once the store has hydrated.
 *
 * No-ops while the Lock Server is unconfigured (Locks disabled). Mounted once in
 * `RouteGuardProvider`, alongside the homeserver restore.
 */
export function useRestoreLocksAuth(): void {
  const hasHydrated = useLocksAuthStore((state) => state.hasHydrated);

  useEffect(() => {
    if (!hasHydrated || !getLockServer()) return;
    void LocksController.restorePersistedLocksSession();
  }, [hasHydrated]);
}
