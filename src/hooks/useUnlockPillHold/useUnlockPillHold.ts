'use client';

import { useEffect, useState } from 'react';
import { useTimeout } from 'usehooks-ts';
import { UNLOCK_PILL_HOLD_MS } from '@/config/locks';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { UseUnlockPillHoldParams } from './useUnlockPillHold.types';

type HoldPhase = 'waiting' | 'timing' | 'released';

/**
 * Whether the Unlock pill of someone else's locked post stays busy because the reader may already own the
 * content (#2795). Clicking it then would open the pay dialog over content that is about to appear.
 *
 * The reader is waited on while:
 * - their replicated copy is read, unless the purchase list is in and does not name this lock (a failed
 *   list cannot rule anyone out);
 * - after that read, the purchase list is still loading, since it may yet name this lock;
 * - a listed purchase whose copy was not found is looked up by purchase recovery (`'checking'`).
 *
 * There is one hold per post and account, across all three. Its time limit runs from the first busy
 * moment with a session (a reload's session restore is bounded on its own and not counted), so a slow
 * read cannot add a second limit for the lookup after it. Once the pill is live, because nothing is left
 * to wait for, the limit passed, or the pay dialog opened, it is not taken back for that post and account.
 * Releasing early is safe: the pay dialog re-reads the saved bundle id before it offers to pay, and
 * recovery keeps running.
 */
export function useUnlockPillHold({
  lock,
  isPayableReader,
  isPayOpen,
  isResolvingReplica,
  purchasesStatus,
  isListedPurchase,
  purchaseStatus,
}: UseUnlockPillHoldParams): boolean {
  const readerPubky = useAuthStore((state) => state.currentUserPubky);
  const hasSession = useAuthStore((state) => state.session !== null);
  const key = lock && readerPubky ? `${readerPubky} ${lock}` : null;
  const [hold, setHold] = useState<{ key: string; phase: HoldPhase } | null>(null);
  const phase = key !== null && hold?.key === key ? hold.phase : null;

  const isWaiting =
    isPayableReader &&
    !isPayOpen &&
    (isResolvingReplica
      ? purchasesStatus !== 'ready' || isListedPurchase
      : purchasesStatus === 'loading' || purchaseStatus === 'checking');

  useEffect(() => {
    if (key === null || !isPayableReader || phase === 'released') return;
    if (!isWaiting) setHold({ key, phase: 'released' });
    else if (hasSession && phase !== 'timing') setHold({ key, phase: 'timing' });
    else if (phase === null) setHold({ key, phase: 'waiting' });
  }, [key, isPayableReader, isWaiting, hasSession, phase]);

  useTimeout(
    () => setHold((current) => (key !== null && current?.key === key ? { key, phase: 'released' } : current)),
    phase === 'timing' ? UNLOCK_PILL_HOLD_MS : null,
  );

  return isWaiting && phase !== 'released';
}
