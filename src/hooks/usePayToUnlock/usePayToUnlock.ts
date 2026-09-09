'use client';

import { useEffect, useRef, useState } from 'react';
import { LocksController } from '@/controllers/locks/locks';
import { toast } from '@/molecules/Toaster/toast';
import { LockContentParser } from '@/pipes/locks/locks.parser';
import type { TUnlockedContent, TVerificationStatus } from '@/services/locks/locks.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { TPayToUnlockStage, UsePayToUnlockParams, UsePayToUnlockResult } from './usePayToUnlock.types';

/** Exported for tests (they advance fake timers by exactly these). */
export const POLL_INTERVAL_MS = 3000;
/**
 * When to park the polling, on the wall clock — a frozen background tab skips attempts, so
 * counting them would under-measure. Parking is NOT failing: the purchase and its stored bundle
 * id survive, the screen stays on "awaiting payment", and the tab becoming visible again grants
 * a fresh window. There is no server-side deadline to align with.
 */
export const STALL_AFTER_MS = 3 * 60 * 1000;

/** The 502 wraps both "wallet not ready" and "Paykit down" — the server cannot tell us which. */
const SUBMIT_FAILED_TOAST = 'The payment could not be started. Check that Bitkit is set up, or try again later.';
const FINISH_FAILED_TOAST =
  'Your payment went through, but the content could not be opened. Nothing is lost — try again.';

/**
 * State machine behind the Pay to Unlock modal.
 *
 * Opening resolves the saved bundle id first — the server is the source of truth for what that
 * id means (no status → the submission never landed → offer Pay with the SAME id). The button is
 * the start of the payment: nothing is submitted by merely opening or closing the modal.
 *
 * Waiting polls on a timer, re-checks immediately when the tab becomes visible again (background
 * tabs get frozen while the reader pays in Bitkit), and parks on a wall-clock deadline without
 * failing the purchase.
 */
export function usePayToUnlock({
  open,
  lockUrl,
  lockFile,
  onCompleted,
  onPurchased,
}: UsePayToUnlockParams): UsePayToUnlockResult {
  const [stage, setStage] = useState<TPayToUnlockStage>('checking');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Surfaced because a reader who never leaves the tab gets no visibility event, so without a
  // manual way back the wait would be stuck for good.
  const [isStalled, setIsStalled] = useState(false);
  const readerPubky = useAuthStore((state) => state.currentUserPubky);
  // `currentUserPubky` is persisted and rehydrates first; the session is rebuilt asynchronously.
  // Without it the bundle id read silently reports "none" (the homeserver service refuses
  // sessionless reads with null), which would fail OPEN — so everything waits for the session.
  const session = useAuthStore((state) => state.session);

  // A saved id whose payment ended failed/expired — the one id the submit re-read must NOT reuse.
  // Deliberately not "null means dead": a concurrent tab's fresh id must survive the re-read.
  const deadBundleId = useRef<string | null>(null);
  // One generation per modal opening: every async continuation checks it, so a closed (or
  // reopened) modal can't apply stale results or keep polling.
  const generation = useRef(0);
  // The active poll loop's teardown (timer + visibility listener) — replaced on every loop start,
  // called on close/unmount. The generation makes a leaked loop inert; this makes it absent.
  const stopPolling = useRef<(() => void) | null>(null);
  // The bundle the current wait belongs to, so a manual re-check knows what to look up.
  const waitingBundleId = useRef<string | null>(null);
  // Held behind the paid confirmation screen until the reader explicitly chooses View Content.
  const completedContent = useRef<TUnlockedContent | null>(null);
  // A ref, not the state flag: two clicks in the same tick both read the pre-render state and
  // would each mint an id and submit — the shape of a double payment.
  const submitting = useRef(false);

  /**
   * Credential and guarded read together — a read failure has to reach the same retry and the same
   * parked state as a credential failure, or the reader is left on a spinner with nothing to press.
   */
  const finish = async (gen: number, bundleId: string) => {
    if (!lockFile) return;
    // The waiting screen owns this bundle from here on, even when the purchase was already
    // complete on open (no polling ran), so "Check again" has something to retry.
    waitingBundleId.current = bundleId;
    setStage('waiting');

    let content: TUnlockedContent;
    try {
      content = await LocksController.fetchPaidContent({ lockFile, bundleId });
    } catch {
      // Already reported by the Err factory. The payment stands — only the download failed — so
      // this gets its own stage rather than the waiting copy that asks the reader to go pay.
      if (generation.current !== gen) return;
      setStage('unopened');
      toast({ variant: 'error', description: FINISH_FAILED_TOAST });
      return;
    }
    if (generation.current !== gen) return;
    completedContent.current = content;
    setIsStalled(false);
    setStage('paid');
  };

  const applyStatus = (gen: number, bundleId: string, status: TVerificationStatus): boolean => {
    if (status === 'completed') {
      void finish(gen, bundleId);
      return false;
    }
    if (status === 'failed' || status === 'expired') {
      // Unretryable: the next submit mints a fresh id (the saved one is overwritten before it).
      deadBundleId.current = bundleId;
      toast({ variant: 'error', description: `The payment ${status}. You can try again.` });
      setStage('pay');
      return false;
    }
    setStage('waiting');
    return true;
  };

  const startPolling = (gen: number, bundleId: string, lookupNow = false) => {
    if (!lockFile) return;
    waitingBundleId.current = bundleId;
    setIsStalled(false);
    let windowStartedAt = Date.now();
    let timer: number | null = null;
    // One opening can start several loops (Check again, a re-submit), so `generation` cannot tell
    // them apart, and clearing `timer` does nothing to a lookup that is already awaiting the
    // server. This is what makes a superseded loop's continuations inert.
    let active = true;
    // A fired timer leaves `timer` holding its spent id, so this flag is the only way to see that
    // a lookup is still out.
    let inFlight = false;

    const poll = async () => {
      if (!active || generation.current !== gen) return;
      let status: TVerificationStatus | null;
      inFlight = true;
      try {
        status = await LocksController.fetchPaymentStatus({ lockFile, bundleId });
      } catch {
        // Already reported by the Err factory; a lookup blip is not worth surfacing mid-wait.
        inFlight = false;
        schedule();
        return;
      }
      inFlight = false;
      if (!active || generation.current !== gen) return;
      // A null mid-wait would mean the server lost the payment; treat like still-pending.
      if (status && !applyStatus(gen, bundleId, status)) {
        stop();
        return;
      }
      schedule();
    };

    const schedule = () => {
      if (!active || generation.current !== gen) return;
      if (Date.now() - windowStartedAt > STALL_AFTER_MS) {
        setIsStalled(true);
        return;
      }
      timer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };

    // The reader pays in Bitkit, so this tab is backgrounded (timers frozen) for most of the
    // wait. Returning is the real signal: look up immediately and, if the loop had parked,
    // grant a fresh wall-clock window so it truly resumes.
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !active || generation.current !== gen) return;
      windowStartedAt = Date.now();
      setIsStalled(false);
      // The lookup already out will schedule the next one. Starting a second here forks the loop
      // into two chains that both poll, both finish, and that `stop()` can only half tear down.
      if (inFlight) return;
      if (timer !== null) window.clearTimeout(timer);
      void poll();
    };
    document.addEventListener('visibilitychange', onVisible);

    const stop = () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
      if (timer !== null) window.clearTimeout(timer);
      if (stopPolling.current === stop) stopPolling.current = null;
    };
    // Retire the previous loop before this one starts, so only one is ever live.
    stopPolling.current?.();
    stopPolling.current = stop;

    // After submit/open the caller has just received a status, so the first lookup can wait one
    // interval; Check again is the reader asking for one now.
    if (lookupNow) void poll();
    else schedule();
  };

  // Modal opened: resolve the saved bundle id, then route. Closed: bump the generation so every
  // pending continuation goes quiet, and tear the poll loop down.
  useEffect(() => {
    if (!open || !lockFile || !readerPubky || !session) return;
    const gen = ++generation.current;
    setStage('checking');
    setIsStalled(false);
    completedContent.current = null;
    deadBundleId.current = null;

    void (async () => {
      try {
        const stored = await LocksController.fetchPurchaseBundleId({ lockUrl, readerPubky });
        if (generation.current !== gen) return;

        if (stored) {
          const status = await LocksController.fetchPaymentStatus({ lockFile, bundleId: stored });
          if (generation.current !== gen) return;
          if (!status) {
            // Saved id with no status behind it: the submission never landed. Pay again with the SAME id.
            setStage('pay');
            return;
          }
          if (applyStatus(gen, stored, status)) startPolling(gen, stored);
          return;
        }

        const hasWallet = await LocksController.hasPaykitReceiver(readerPubky);
        if (generation.current !== gen) return;
        setStage(hasWallet ? 'pay' : 'install');
      } catch {
        // Includes an unreadable saved bundle id: minting a fresh one could pay twice, so no Pay
        // button. Already reported by the Err factory that threw it.
        if (generation.current !== gen) return;
        setStage('blocked');
      }
    })();

    return () => {
      // Deliberate: invalidating the generation IS the cancellation mechanism (not a node ref).
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      stopPolling.current?.();
      stopPolling.current = null;
    };
    // startPolling/applyStatus/toast are stable for one opening; re-running on their identity would restart the flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lockUrl, lockFile, readerPubky, session]);

  const submit = () => {
    if (submitting.current || !lockFile || !readerPubky || !session) return;
    const gen = generation.current;
    submitting.current = true;
    setIsSubmitting(true);

    void (async () => {
      try {
        const { bundleId, status } = await LocksController.startPayment({
          lockFile,
          lockUrl,
          readerPubky,
          rejectBundleId: deadBundleId.current,
        });
        const lockId = LockContentParser.lockIdFromUrl(lockUrl);
        if (lockId) onPurchased(lockId);
        if (generation.current !== gen) return;
        if (applyStatus(gen, bundleId, status)) startPolling(gen, bundleId);
      } catch {
        // TODO:[Locks] a wallet that has no receiver and Paykit being down both arrive as the same
        // 502 (`paykit_invoice_creation_failed`); ask the locks side for a distinct code so this
        // toast can say which one it was. Already reported by the Err factory.
        if (generation.current !== gen) return;
        toast({ variant: 'error', description: SUBMIT_FAILED_TOAST });
      } finally {
        submitting.current = false;
        setIsSubmitting(false);
      }
    })();
  };

  const recheck = () => {
    const bundleId = waitingBundleId.current;
    if (!bundleId) return;
    // Take the retry screen away before the lookup goes out, so Check again cannot be pressed
    // again while it is still running.
    setStage('waiting');
    startPolling(generation.current, bundleId, true);
  };

  const viewContent = () => {
    const content = completedContent.current;
    if (!content) return;
    completedContent.current = null;
    onCompleted(content);
  };

  return { stage, isStalled, isSubmitting, submit, recheck, viewContent };
}
