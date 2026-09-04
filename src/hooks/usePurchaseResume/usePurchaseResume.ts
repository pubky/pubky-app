'use client';

import { useEffect } from 'react';
import { LocksController } from '@/controllers/locks/locks';
import { LockContentParser } from '@/pipes/locks/locks.parser';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { UsePurchaseResumeParams } from './usePurchaseResume.types';

/**
 * Finishes a purchase the reader already paid for but never received.
 *
 * The payment completes on the server whether or not the browser is watching, so a reader who
 * closed the tab mid-wait would come back to a post still offering Unlock over content they own.
 *
 * Never spends money: it reads the saved bundle id, asks the server its status, and downloads.
 * No branch here mints an id or submits a proof.
 */
export function usePurchaseResume({
  lock,
  lockFile,
  isPurchased,
  hasContent,
  isResolvingContent,
  onResumed,
}: UsePurchaseResumeParams): void {
  const readerPubky = useAuthStore((state) => state.currentUserPubky);
  const session = useAuthStore((state) => state.session);

  useEffect(() => {
    const lockId = lock ? LockContentParser.lockIdFromUrl(lock) : null;
    if (!lock || !lockFile || !lockId || !readerPubky || !session) return;
    // Waiting out the replica read is what keeps a slow connection from looking like "never
    // unlocked" and paying the download cost twice.
    if (isResolvingContent || hasContent || !isPurchased) return;

    let cancelled = false;

    // Failures are already reported by the Err factory; the next mount of this post tries again.
    void LocksController.fetchPaidContentIfCompleted({ lockFile, lockUrl: lock, readerPubky })
      .catch(() => null)
      .then((content) => {
        if (content && !cancelled) onResumed(content);
      });

    return () => {
      cancelled = true;
    };
    // `onResumed` changes identity every render; the inputs that decide a run are the deps above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lock, lockFile, readerPubky, session, isPurchased, hasContent, isResolvingContent]);
}
