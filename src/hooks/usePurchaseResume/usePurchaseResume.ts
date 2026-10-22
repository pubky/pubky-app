'use client';

import { useEffect, useState } from 'react';
import { LocksController } from '@/controllers/locks/locks';
import { LockContentParser } from '@/pipes/locks/locks.parser';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { PurchaseResumeStatus, UsePurchaseResumeParams } from './usePurchaseResume.types';

/**
 * Finishes a purchase the reader already paid for but never received.
 *
 * The payment completes on the server whether or not the browser is watching, so a reader who
 * closed the tab mid-wait would come back to a post still offering Unlock over content they own.
 *
 * Never spends money: it reads the saved bundle ids, asks the server their status, and downloads.
 * No branch here mints an id or submits a proof.
 */
export function usePurchaseResume({
  lock,
  lockFile,
  isPurchased,
  hasContent,
  isResolvingContent,
  onResumed,
}: UsePurchaseResumeParams): PurchaseResumeStatus {
  const readerPubky = useAuthStore((state) => state.currentUserPubky);
  const session = useAuthStore((state) => state.session);
  const [resolved, setResolved] = useState<{
    readerPubky: string;
    session: typeof session;
    lock: string;
    lockFile: typeof lockFile;
    status: PurchaseResumeStatus;
  } | null>(null);

  useEffect(() => {
    const lockId = lock ? LockContentParser.lockIdFromUrl(lock) : null;
    if (!lock || !lockFile || !lockId || !readerPubky || !session) return;
    // Waiting out the replica read is what keeps a slow connection from looking like "never
    // unlocked" and paying the download cost twice.
    if (isResolvingContent || hasContent || !isPurchased) return;

    let cancelled = false;
    const isCurrent = () => {
      const current = useAuthStore.getState();
      return !cancelled && current.currentUserPubky === readerPubky && current.session === session;
    };

    setResolved(null);
    const setStatus = (status: PurchaseResumeStatus) => {
      if (isCurrent()) setResolved({ readerPubky, session, lock, lockFile, status });
    };
    // Resolve once for both the region gate and paid-content recovery. A saved file alone does
    // not prove that a payment exists: the first submission may never have reached the server.
    void (async () => {
      try {
        const purchase = await LocksController.fetchResolvedPurchase({ lockFile, lockUrl: lock, readerPubky });
        if (!isCurrent()) return;
        if (purchase?.kind !== 'reusable' || !purchase.task) {
          setStatus('none');
          return;
        }
        setStatus('recoverable');
        if (purchase.task.status === 'completed') {
          // Preserve recoverability if only the download fails; the modal can retry that read.
          const content = await LocksController.fetchPaidContent({ lockFile, bundleId: purchase.bundleId }).catch(
            () => null,
          );
          if (content && isCurrent()) onResumed(content);
        }
      } catch {
        // An unknown task is not permission to pay. The modal may retry this read, but its
        // submission guard still applies if it turns out that a new payment would be needed.
        setStatus('unknown');
      }
    })();

    return () => {
      cancelled = true;
    };
    // `onResumed` changes identity every render; the inputs that decide a run are the deps above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lock, lockFile, readerPubky, session, isPurchased, hasContent, isResolvingContent]);

  if (!isPurchased || !readerPubky || !session || !lock || !lockFile) return 'none';
  if (hasContent) return 'recoverable';
  if (isResolvingContent) return 'checking';
  return resolved?.readerPubky === readerPubky &&
    resolved.session === session &&
    resolved.lock === lock &&
    resolved.lockFile === lockFile
    ? resolved.status
    : 'checking';
}
