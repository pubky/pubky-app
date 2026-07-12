'use client';

import { useRestoreLocksAuth } from '@/hooks/useRestoreLocksAuth/useRestoreLocksAuth';
import { Env } from '@/libs/env/env';

/**
 * Rebuilds the Locks session from the persisted bearer secret on app load, so the composer's lock
 * switch sees an authenticated creator across reloads. No UI. No-op when `NEXT_PUBLIC_LOCK_SERVER`
 * is unset (Locks disabled) — restore itself is local, no network.
 */
export function LocksSessionRestore() {
  useRestoreLocksAuth(Env.NEXT_PUBLIC_LOCK_SERVER ?? null);
  return null;
}
