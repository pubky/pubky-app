'use client';

import { getLockServer } from '@/config/network';
import { useRestoreLocksAuth } from '@/hooks/useRestoreLocksAuth/useRestoreLocksAuth';

/**
 * Rebuilds the Locks session from the persisted bearer secret on app load, so the composer's lock
 * switch sees an authenticated creator across reloads. No UI. No-op when the Lock Server is
 * unconfigured (Locks disabled) — restore itself is local, no network.
 */
export function LocksSessionRestore() {
  useRestoreLocksAuth(getLockServer() ?? null);
  return null;
}
