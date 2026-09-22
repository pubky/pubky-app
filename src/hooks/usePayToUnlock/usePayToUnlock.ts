'use client';

import { useEffect, useRef, useState } from 'react';
import { LocksController } from '@/controllers/locks/locks';
import { toast } from '@/molecules/Toaster/toast';
import { LockContentParser } from '@/pipes/locks/locks.parser';
import type { TPaykitConnectionState, TUnlockedContent, TVerificationStatus } from '@/services/locks/locks.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { TPayToUnlockStage, UsePayToUnlockParams, UsePayToUnlockResult } from './usePayToUnlock.types';

/** Exported for tests (they advance fake timers by exactly these). */
export const POLL_INTERVAL_MS = 3000;
/** Only the link read runs this fast — the reader is staring at the QR. The task stays on its own interval. */
export const CONNECTION_POLL_INTERVAL_MS = 1000;
/** How often the install screen re-checks for a wallet while the reader sets Bitkit up. */
export const WALLET_POLL_INTERVAL_MS = 3000;
/**
 * When to park the polling, on the wall clock — a frozen background tab skips attempts, so
 * counting them would under-measure. Parking is NOT failing: the purchase and its stored bundle
 * id survive, the screen stays on "awaiting payment", and the tab becoming visible again grants
 * a fresh window. There is no server-side deadline to align with.
 */
export const STALL_AFTER_MS = 3 * 60 * 1000;

/**
 * The 502 wraps both "wallet not ready" and "Paykit down" — the server cannot tell us which.
 * TODO:[Locks] ask the locks side for a distinct code, so this toast can name the cause.
 */
const SUBMIT_FAILED_TOAST = 'The payment could not be started. Check that Bitkit is set up, or try again later.';
const FINISH_FAILED_TOAST =
  'Your payment went through, but the content could not be opened. Nothing is lost — try again.';

/**
 * State machine behind the Pay to Unlock modal.
 *
 * Opening resolves the saved bundle id and submits automatically: a fresh purchase after the wallet
 * check, and a saved id only when the server holds no task for it. A task that already exists is
 * never submitted again — its status is read, and its Paykit link has a lookup of its own.
 *
 * Waiting runs those two reads as separate loops that never wait on each other: the task status
 * decides the payment, the link state decides the QR. Both re-check when the tab becomes visible
 * again (background tabs get frozen while the reader pays in Bitkit) and park together on a
 * wall-clock deadline without failing the purchase.
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
  const [connectionState, setConnectionState] = useState<TPaykitConnectionState | null>(null);
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
  // A ref, not the state flag: two clicks in the same tick both read the pre-render state and would
  // each submit. Keyed by generation so a reopen is not blocked by the previous opening's request.
  const submittingGeneration = useRef<number | null>(null);

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
      setConnectionState(null);
      void finish(gen, bundleId);
      return false;
    }
    if (status === 'failed' || status === 'expired') {
      // Unretryable: Try again mints a fresh id (the saved one is overwritten before it).
      deadBundleId.current = bundleId;
      setConnectionState(null);
      toast({ variant: 'error', description: `The payment ${status}. You can try again.` });
      setStage('retry');
      return false;
    }
    setStage('waiting');
    return true;
  };

  /**
   * The wait: two loops on their own timers, plus the shared park. Splitting them is the point —
   * a link read that hangs must not hold up the read that decides whether the reader has paid.
   */
  const startPolling = (gen: number, bundleId: string, watchConnection: boolean, lookupNow = false) => {
    if (!lockFile) return;
    waitingBundleId.current = bundleId;
    setIsStalled(false);

    let active = true;
    let stallTimer: number | null = null;
    // Bumped when the wait parks: an answer from before the park is no longer ours to apply.
    let epoch = 0;

    type TLoop = { timer: number | null; inFlight: boolean; alive: boolean; run: () => void };
    const loops: TLoop[] = [];

    /**
     * `step` returns false when this loop is done, and takes the guard it must re-check after its
     * await: applying an answer from a closed modal or a parked wait is what opens content nobody
     * asked for. Each loop skips a tick while its own call is still out.
     */
    const addLoop = (intervalMs: number, step: (isCurrent: () => boolean) => Promise<boolean>): TLoop => {
      const loop: TLoop = {
        timer: null,
        inFlight: false,
        alive: true,
        run: () => {
          if (!active || !loop.alive || loop.inFlight || generation.current !== gen) return;
          const startedAt = epoch;
          const isCurrent = () => active && generation.current === gen && startedAt === epoch;
          loop.inFlight = true;
          void step(isCurrent).then((keepGoing) => {
            // Checked before the flag is cleared: after a park, a newer request may already own it,
            // and clearing it here would let the next visibility event start a duplicate.
            if (!isCurrent()) return;
            loop.inFlight = false;
            loop.alive = keepGoing;
            if (keepGoing) schedule(loop, intervalMs);
          });
        },
      };
      loops.push(loop);
      return loop;
    };

    const schedule = (loop: TLoop, intervalMs: number) => {
      if (!active || !loop.alive || generation.current !== gen) return;
      loop.timer = window.setTimeout(loop.run, intervalMs);
    };

    const paymentLoop = addLoop(POLL_INTERVAL_MS, async (isCurrent) => {
      const status = await LocksController.fetchPaymentStatus({ lockFile, bundleId }).catch(() => null);
      if (!isCurrent()) return false;
      // A failed lookup or a null task is transient mid-wait; both mean "keep waiting".
      if (!status || applyStatus(gen, bundleId, status)) return true;
      stop();
      return false;
    });

    const connectionLoop = addLoop(CONNECTION_POLL_INTERVAL_MS, async (isCurrent) => {
      const state = await LocksController.fetchPaykitConnectionState({ lockFile, bundleId }).catch(() => null);
      if (!isCurrent()) return false;
      // A failed read invents no state: the last one stands, QR included.
      if (!state) return true;
      setConnectionState(state);
      // `connected` needs no more reads; `blocked` is an operator switch this reader cannot flip.
      return state !== 'connected' && state !== 'blocked';
    });
    if (!watchConnection) connectionLoop.alive = false;

    // Independent of both loops: even a call that never settles must expose Check again on time.
    const armStallTimer = () => {
      if (stallTimer !== null) window.clearTimeout(stallTimer);
      stallTimer = window.setTimeout(() => {
        if (!active || generation.current !== gen) return;
        epoch++;
        loops.forEach((loop) => {
          loop.inFlight = false;
          if (loop.timer !== null) window.clearTimeout(loop.timer);
        });
        setIsStalled(true);
      }, STALL_AFTER_MS);
    };

    // The reader pays in Bitkit, so this tab is backgrounded (timers frozen) for most of the wait.
    // Returning is the real signal: read both now and grant a fresh wall-clock window.
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !active || generation.current !== gen) return;
      setIsStalled(false);
      armStallTimer();
      loops.forEach((loop) => {
        if (loop.timer !== null) window.clearTimeout(loop.timer);
        loop.run();
      });
    };
    document.addEventListener('visibilitychange', onVisible);

    const stop = () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
      loops.forEach((loop) => loop.timer !== null && window.clearTimeout(loop.timer));
      if (stallTimer !== null) window.clearTimeout(stallTimer);
      if (stopPolling.current === stop) stopPolling.current = null;
    };
    // Retire the previous wait before this one starts, so only one is ever live.
    stopPolling.current?.();
    stopPolling.current = stop;
    armStallTimer();

    // The caller has just read a status, so the payment loop can wait an interval; the link state is
    // unknown and the QR waits on it, so that loop reads now.
    if (lookupNow) paymentLoop.run();
    else schedule(paymentLoop, POLL_INTERVAL_MS);
    connectionLoop.run();
  };

  // A reopen while an earlier submission is still out submits again; `startPayment` serializes the
  // two per reader and lock, so the second one replays the saved id instead of minting another.
  const attemptPayment = async (gen: number) => {
    if (!lockFile || !readerPubky || !session || submittingGeneration.current === gen) return;
    submittingGeneration.current = gen;
    setIsSubmitting(true);

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
      // The submission only reports lifecycle now, so the connection state is unknown until the
      // loop reads it — the QR appears one round trip later.
      if (applyStatus(gen, bundleId, status)) startPolling(gen, bundleId, true);
    } catch {
      // Already reported by the Err factory. Try again replays the saved id.
      if (generation.current !== gen) return;
      setStage('retry');
      toast({ variant: 'error', description: SUBMIT_FAILED_TOAST });
    } finally {
      if (submittingGeneration.current === gen) {
        submittingGeneration.current = null;
        setIsSubmitting(false);
      }
    }
  };

  /**
   * The install screen: re-checks for a wallet until one shows up, then starts the purchase. Nothing
   * is minted or submitted before that — a submission without a wallet fails with the same `502` as
   * a Paykit outage, after the purchase file is already written.
   */
  const watchForWallet = (gen: number) => {
    if (!readerPubky) return;
    let timer: number | null = null;
    let active = true;
    const stop = () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
      if (stopPolling.current === stop) stopPolling.current = null;
    };
    const check = async () => {
      const hasWallet = await LocksController.hasPaykitReceiver(readerPubky).catch(() => false);
      if (!active || generation.current !== gen) return;
      if (!hasWallet) {
        timer = window.setTimeout(() => void check(), WALLET_POLL_INTERVAL_MS);
        return;
      }
      stop();
      // Off the install screen before submitting: a close there skips the "still running" prompt.
      setStage('checking');
      await attemptPayment(gen);
    };
    stopPolling.current?.();
    stopPolling.current = stop;
    timer = window.setTimeout(() => void check(), WALLET_POLL_INTERVAL_MS);
  };

  // Modal opened: resolve the saved bundle id, then route. Closed: bump the generation so every
  // pending continuation goes quiet, and tear the poll loop down.
  useEffect(() => {
    if (!open || !lockFile || !readerPubky || !session) return;
    const gen = ++generation.current;
    setStage('checking');
    setIsStalled(false);
    setConnectionState(null);
    completedContent.current = null;
    deadBundleId.current = null;

    void (async () => {
      try {
        const stored = await LocksController.fetchPurchaseBundleId({ lockUrl, readerPubky });
        if (generation.current !== gen) return;

        if (stored) {
          const status = await LocksController.fetchPaymentStatus({ lockFile, bundleId: stored });
          if (generation.current !== gen) return;
          // An ended payment is settled by this lookup alone: submitting it again would only echo
          // the same status back.
          if (status === 'completed' || status === 'failed' || status === 'expired') {
            applyStatus(gen, stored, status);
            return;
          }
          // A task that is already running needs no second submission: the connection state has its
          // own lookup now, and re-submitting would only re-confirm what the lookup just said.
          if (status) {
            if (applyStatus(gen, stored, status)) startPolling(gen, stored, true);
            return;
          }
        } else {
          const hasWallet = await LocksController.hasPaykitReceiver(readerPubky);
          if (generation.current !== gen) return;
          if (!hasWallet) {
            setStage('install');
            watchForWallet(gen);
            return;
          }
        }
        // Left: no saved id at all, or a saved id whose first submission never reached the server.
        await attemptPayment(gen);
      } catch {
        // Includes an unreadable saved bundle id: minting a fresh one could pay twice, so there is
        // no retry. Already reported by the Err factory that threw it.
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
    // attemptPayment and the helpers it calls are stable for one opening; re-running on their
    // identity would restart the purchase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lockUrl, lockFile, readerPubky, session]);

  const retry = () => void attemptPayment(generation.current);

  const recheck = () => {
    const bundleId = waitingBundleId.current;
    if (!bundleId) return;
    // Read before the stage moves: `unopened` means the payment is already done, so its Check again
    // retries the content read and must not start watching the link again.
    const paymentStillRunning = stage === 'waiting';
    // Take the retry screen away before the lookup goes out, so Check again cannot be pressed
    // again while it is still running.
    setStage('waiting');
    // Unknown state included: only a settled link (or an operator block) ends the watch.
    const watchConnection = paymentStillRunning && connectionState !== 'connected' && connectionState !== 'blocked';
    startPolling(generation.current, bundleId, watchConnection, true);
  };

  const viewContent = () => {
    const content = completedContent.current;
    if (!content) return;
    completedContent.current = null;
    onCompleted(content);
  };

  // The install screen shows the QR too: a reader can set Bitkit up and scan in one sitting.
  const handshakePubky = stage === 'install' || connectionState === 'none' ? (lockFile?.creator ?? null) : null;
  // Neither state is something the reader can act on from here, so they are surfaced as notices.
  const connectionIssue =
    connectionState === 'recovery_required' || connectionState === 'blocked' ? connectionState : null;
  return { stage, isStalled, handshakePubky, connectionIssue, isSubmitting, retry, recheck, viewContent };
}
