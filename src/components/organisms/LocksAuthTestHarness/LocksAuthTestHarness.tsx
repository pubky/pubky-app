'use client';

// TODO:[Locks] #2040 — staging manual-test harness for the Lock-auth flow. Exposes
// `window.locksdk.start()` to open the auth modal (gated to dev/staging). Kept as a staging
// test aid now that the composer lock switch exists; delete before release.
import { useEffect, useState } from 'react';
import type { Session as LocksSdkSession } from '@pubky/locks-sdk';
import { Env } from '@/libs/env/env';
import { isLocksAuthTestEnabled } from '@/libs/locks/isLocksAuthTestEnabled';
import { Logger } from '@/libs/logger/logger';
import { DialogLocksAuth } from '@/organisms/DialogLocksAuth/DialogLocksAuth';

declare global {
  interface Window {
    locksdk?: { start: () => void };
  }
}

/** Masks a bearer secret to a safe prefix…suffix so it never lands in logs in full. */
const maskSecret = (secret: string): string =>
  secret.length <= 8 ? '***' : `${secret.slice(0, 4)}…${secret.slice(-4)}`;

export function LocksAuthTestHarness() {
  const enabled = isLocksAuthTestEnabled();
  const lockServer = Env.NEXT_PUBLIC_LOCK_SERVER ?? '';
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    window.locksdk = {
      start: () => {
        if (!lockServer) {
          Logger.warn('[locksdk] NEXT_PUBLIC_LOCK_SERVER is not set');
          return;
        }
        setOpen(true);
      },
    };
    return () => {
      delete window.locksdk;
    };
  }, [enabled, lockServer]);

  if (!enabled || !lockServer) return null;

  const handleSuccess = (session: LocksSdkSession) => {
    // Safe summary only — never the full bearer secret.
    Logger.info('[locksdk] authenticated', {
      lockServer: session.lockServer(),
      secret: maskSecret(session.exportSecret()),
    });
    setOpen(false);
  };

  return <DialogLocksAuth open={open} onOpenChange={setOpen} lockServerPubky={lockServer} onSuccess={handleSuccess} />;
}
