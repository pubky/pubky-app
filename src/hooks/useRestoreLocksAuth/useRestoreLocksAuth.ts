'use client';

import { useEffect } from 'react';
import { LocksController } from '@/controllers/locks/locks';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';

/**
 * Restores the Locks session from the persisted bearer secret once the store has hydrated.
 *
 * `lockServerPubky` is null when Locks is unconfigured; restore no-ops then. Mounted once high in
 * the app tree via `LocksSessionRestore`, alongside the homeserver restore.
 */
export function useRestoreLocksAuth(lockServerPubky: string | null): void {
  const hasHydrated = useLocksAuthStore((state) => state.hasHydrated);

  useEffect(() => {
    if (!hasHydrated || !lockServerPubky) return;
    void LocksController.restorePersistedLocksSession({ lockServerPubky });
  }, [hasHydrated, lockServerPubky]);
}
