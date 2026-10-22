'use client';

import { useEffect, useRef, useState } from 'react';
import { LocksController } from '@/controllers/locks/locks';
import { isAppError, requiresLogin } from '@/libs/error/error.utils';
import { toast } from '@/molecules/Toaster/toast';
import { LockContentParser } from '@/pipes/locks/locks.parser';
import type { TPaykitConnectionState, TUnlockedContent, TVerificationStatus } from '@/services/locks/locks.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { TPayToUnlockStage, UsePayToUnlockParams, UsePayToUnlockResult } from './usePayToUnlock.types';

/** Exported for tests (they advance fake timers by exactly these). */
export const POLL_INTERVAL_MS = 3000;
/** Only the link read runs this fast — the reader is staring at the QR. The task stays on its own interval. */
export const CONNECTION_POLL_INTERVAL_MS = 1000;
/**
 * When to park the polling, on the wall clock — a frozen background tab skips attempts, so
 * counting them would under-measure. Parking is NOT failing: the purchase and its stored bundle
 * id survive, the screen stays on "awaiting payment", and returning to the tab grants
 * a fresh window. While the server is still creating the invoice, it counts from the server's
 * deadline for that instead. The content download after a completed payment parks after the same
 * time, but a returning tab does not re-read it: only Check again does.
 */
export const STALL_AFTER_MS = 3 * 60 * 1000;

const SUBMIT_FAILED_TOAST = 'The payment could not be started. Try again later.';
const NO_WALLET_TOAST = 'Bitkit is not set up yet. Finish the steps, then try again.';
const FINISH_FAILED_TOAST =
  'Your payment went through, but the content could not be opened. Nothing is lost — try again.';
const SESSION_EXPIRED_TOAST = 'Session expired. Please sign in.';

// A time the browser cannot parse leaves the plain 3 minutes; a NaN delay would park at once.
const stallNotBeforeFor = (admissionDeadlineAt: string | null): number => {
  const deadline = admissionDeadlineAt ? Date.parse(admissionDeadlineAt) : NaN;
  return Number.isNaN(deadline) ? 0 : deadline + STALL_AFTER_MS;
};

/**
 * State machine behind the Pay to Unlock modal.
 *
 * Opening resolves the saved bundle ids and submits automatically: a fresh purchase after the wallet
 * check, and a saved id only when the server holds no task for it. A task that already exists is
 * never submitted again — its status is read, and its Paykit link has a lookup of its own.
 *
 * Waiting runs those two reads as separate loops that never wait on each other: the task status
 * decides the payment, the link state decides the QR. Both re-check when the tab becomes visible
 * or regains window focus and park together on a wall-clock deadline without failing the purchase.
 */
export function usePayToUnlock({
  open,
  paymentAvailability = 'available',
  lockUrl,
  lockFile,
  onCompleted,
  onPurchased,
  onSessionExpired,
}: UsePayToUnlockParams): UsePayToUnlockResult {
  const [stage, setStage] = useState<TPayToUnlockStage>('checking');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Surfaced because a reader who never leaves the tab gets no visibility event, so without a
  // manual way back the wait would be stuck for good.
  const [isStalled, setIsStalled] = useState(false);
  const [connectionState, setConnectionState] = useState<TPaykitConnectionState | null>(null);
  // Not derived from a null `connectionState`: that is also what a finished payment resets to, and
  // the content download that follows must not look like a link that was never read.
  const [isConnectionPending, setIsConnectionPending] = useState(false);
  const [walletSetupNeeded, setWalletSetupNeeded] = useState(false);
  const readerPubky = useAuthStore((state) => state.currentUserPubky);
  // `currentUserPubky` is persisted and rehydrates first; the session is rebuilt asynchronously.
  // Without it the bundle id read silently reports "none" (the homeserver service refuses
  // sessionless reads with null), which would fail OPEN — so everything waits for the session.
  const session = useAuthStore((state) => state.session);
  // Set app-wide when the reader's own homeserver answers 401, whichever feature sent the request.
  const isReauthRequired = useAuthStore((state) => state.restoreStatus === 'reauth-required');

  // The server creates the invoice after the submission, so a reader without a wallet ends `failed`
  // rather than failing the submission. Without this check, Try again would mint id after id.
  const checkWalletOnRetry = useRef(false);
  // One generation per modal opening: every async continuation checks it, so a closed (or
  // reopened) modal can't apply stale results or keep polling.
  const generation = useRef(0);
  // A button handler retained from an earlier render must use the latest advisory too.
  const currentPaymentAvailability = useRef(paymentAvailability);
  useEffect(() => {
    currentPaymentAvailability.current = paymentAvailability;
  }, [paymentAvailability]);
  // The active poll loop's teardown (timers + return listeners) — replaced on every loop start,
  // called on close/unmount. The generation makes a leaked loop inert; this makes it absent.
  const stopPolling = useRef<(() => void) | null>(null);
  // The download's own park. The wait's park does not cover it: the wait stops once the payment
  // completes, and a purchase already complete on open never starts one.
  const finishStallTimer = useRef<number | null>(null);
  // Check again on a parked download starts another while the first may still be out. Any of them
  // may deliver the content; only the latest may fail or park.
  const finishCall = useRef(0);
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
    const call = ++finishCall.current;
    const isLatest = () => generation.current === gen && finishCall.current === call;
    // The finishing screen owns this bundle from here on, even when the purchase was already
    // complete on open (no polling ran), so "Check again" has something to retry.
    waitingBundleId.current = bundleId;
    setStage('finishing');
    const stallTimer = window.setTimeout(() => {
      if (isLatest()) setIsStalled(true);
    }, STALL_AFTER_MS);
    finishStallTimer.current = stallTimer;

    let content: TUnlockedContent;
    try {
      content = await LocksController.fetchPaidContent({ lockFile, bundleId });
    } catch {
      // Already reported by the Err factory. The payment stands — only the download failed — so
      // this gets its own stage rather than the waiting copy that asks the reader to go pay.
      if (!isLatest()) return;
      setStage('unopened');
      toast({ variant: 'error', description: FINISH_FAILED_TOAST });
      return;
    } finally {
      window.clearTimeout(stallTimer);
      // After a close and reopen, `finishStallTimer` belongs to the new download.
      if (finishStallTimer.current === stallTimer) finishStallTimer.current = null;
    }
    if (generation.current !== gen) return;
    // Retire the download and lookup a Check again started, or they would fetch it again.
    finishCall.current++;
    stopPolling.current?.();
    completedContent.current = content;
    setIsStalled(false);
    setStage('paid');
  };

  const holdNewPayment = () => {
    const availability = currentPaymentAvailability.current;
    if (availability === 'available') return false;
    setStage(availability === 'blocked' ? 'region-blocked' : 'checking');
    return true;
  };

  const applyStatus = (gen: number, bundleId: string, status: TVerificationStatus): boolean => {
    if (status === 'completed') {
      setConnectionState(null);
      setIsConnectionPending(false);
      void finish(gen, bundleId);
      return false;
    }
    if (status === 'failed' || status === 'expired') {
      if (holdNewPayment()) return false;
      // Unretryable: Try again mints a fresh id, unless another device has since saved one that can still pay.
      checkWalletOnRetry.current = status === 'failed';
      setConnectionState(null);
      setIsConnectionPending(false);
      toast({
        variant: 'error',
        description:
          status === 'expired'
            ? 'The payment was not completed. You can try again.'
            : 'The payment failed. You can try again.',
      });
      setStage(status === 'expired' ? 'expired' : 'retry');
      return false;
    }
    setStage('waiting');
    return true;
  };

  /**
   * The wait: two loops on their own timers, plus the shared park. Splitting them is the point —
   * a link read that hangs must not hold up the read that decides whether the reader has paid.
   */
  const startPolling = (
    gen: number,
    bundleId: string,
    watchConnection: boolean,
    {
      lookupNow = false,
      admissionDeadlineAt = null,
    }: { lookupNow?: boolean; admissionDeadlineAt?: string | null } = {},
  ) => {
    if (!lockFile) return;
    waitingBundleId.current = bundleId;
    setIsStalled(false);
    // Pending only while this wait actually reads the link; a wait that does not (already connected,
    // or a content re-download) has nothing to be pending about.
    setIsConnectionPending(watchConnection);

    let active = true;
    let stallTimer: number | null = null;
    // The reader cannot pay before the invoice exists, so the stall window does not start before the
    // server's deadline for creating it. 0 once there is no such deadline. Only the reopen path seeds
    // it from its own read; otherwise lookups that all fail would park 3 minutes in, long before it.
    let stallNotBefore = stallNotBeforeFor(admissionDeadlineAt);
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
      const task = await LocksController.fetchPaymentStatus({ lockFile, bundleId }).catch(() => null);
      if (!isCurrent()) return false;
      // A failed lookup or a null task is transient mid-wait; both mean "keep waiting".
      if (!task) return true;
      setWalletSetupNeeded(task.walletSetupNeeded);
      // Re-armed when the deadline appears, and again when it clears: the invoice now exists, so the
      // reader gets a full window to pay.
      const notBefore = stallNotBeforeFor(task.admissionDeadlineAt);
      if (notBefore !== stallNotBefore) {
        stallNotBefore = notBefore;
        armStallTimer();
      }
      if (applyStatus(gen, bundleId, task.status)) return true;
      stop();
      return false;
    });

    const connectionLoop = addLoop(CONNECTION_POLL_INTERVAL_MS, async (isCurrent) => {
      const state = await LocksController.fetchPaykitConnectionState({ lockFile, bundleId }).catch(() => null);
      if (!isCurrent()) return false;
      // A failed read invents no state: the last one stands, QR included.
      if (!state) return true;
      setConnectionState(state);
      setIsConnectionPending(false);
      // `connected` needs no more reads; `blocked` is an operator switch this reader cannot flip.
      return state !== 'connected' && state !== 'blocked';
    });
    if (!watchConnection) connectionLoop.alive = false;

    // Independent of both loops: even a call that never settles must expose Check again on time.
    const armStallTimer = () => {
      if (stallTimer !== null) window.clearTimeout(stallTimer);
      stallTimer = window.setTimeout(
        () => {
          if (!active || generation.current !== gen) return;
          epoch++;
          loops.forEach((loop) => {
            loop.inFlight = false;
            if (loop.timer !== null) window.clearTimeout(loop.timer);
          });
          setIsStalled(true);
        },
        Math.max(STALL_AFTER_MS, stallNotBefore - Date.now()),
      );
    };

    // Returning from Bitkit can restore focus without changing visibility on desktop.
    // Read both now and grant a fresh wall-clock window on either return signal.
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
    window.addEventListener('focus', onVisible);

    const stop = () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
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

  const viewContent = () => {
    const content = completedContent.current;
    if (!content) return;
    completedContent.current = null;
    onCompleted(content);
  };

  const endExpiredSession = () => {
    toast({ variant: 'error', description: SESSION_EXPIRED_TOAST });
    // Like closing from the paid screen: content already downloaded is shown, not dropped.
    if (completedContent.current) viewContent();
    else onSessionExpired();
  };

  // Once the app has cleared the session for this 401, the reauth effect ends the modal. This catch
  // can run before or after that render, so it reads the store instead of relying on the order.
  const endIfSessionExpired = (error: unknown): boolean => {
    if (!isAppError(error) || !requiresLogin(error)) return false;
    if (useAuthStore.getState().restoreStatus !== 'reauth-required') endExpiredSession();
    return true;
  };

  // A reopen while an earlier submission is still out submits again; `startPayment` serializes the
  // two per reader and lock, so the second one replays the saved id instead of minting another, or
  // reports its end if the reader rejected it meanwhile (`isRetry` is false here).
  const attemptPayment = async (gen: number, fromInstall: boolean, isRetry: boolean) => {
    if (!lockFile || !readerPubky || !session || generation.current !== gen || submittingGeneration.current === gen)
      return;
    const currentReader = useAuthStore.getState();
    if (currentReader.currentUserPubky !== readerPubky || currentReader.session !== session || holdNewPayment()) return;
    submittingGeneration.current = gen;
    setIsSubmitting(true);

    try {
      if (fromInstall || checkWalletOnRetry.current) {
        const hasWallet = await LocksController.hasPaykitReceiver(readerPubky);
        if (generation.current !== gen) return;
        if (!hasWallet) {
          toast({ variant: 'warning', description: NO_WALLET_TOAST });
          setStage('install');
          return;
        }
        // Off the install screen before submitting: a close there skips the "still running" prompt.
        if (fromInstall) setStage('checking');
      }

      // A wallet check can outlive a country/session change. Its old opening must never submit.
      if (generation.current !== gen || holdNewPayment()) return;
      const started = await LocksController.startPayment({ lockFile, lockUrl, readerPubky, isRetry });
      if (started.regionBlocked) {
        // An expected refusal, not a failure: no toast, no retry, and the lock is not marked purchased
        // (that would start the background finish for a payment that was never created).
        if (generation.current === gen) setStage('region-blocked');
        return;
      }
      const { bundleId, status } = started;
      const lockId = LockContentParser.lockIdFromUrl(lockUrl);
      if (lockId) onPurchased(lockId);
      if (generation.current !== gen) return;
      // The submission only reports lifecycle now, so the connection state is unknown until the
      // loop reads it — the QR appears one round trip later.
      if (applyStatus(gen, bundleId, status)) startPolling(gen, bundleId, true);
    } catch (error) {
      // Already reported by the Err factory. Try again replays the saved id; a failure that started
      // on the install screen goes back there, the only screen whose button always checks the wallet.
      if (generation.current !== gen) return;
      if (endIfSessionExpired(error)) return;
      setStage(fromInstall ? 'install' : 'retry');
      toast({ variant: 'error', description: SUBMIT_FAILED_TOAST });
    } finally {
      if (submittingGeneration.current === gen) {
        submittingGeneration.current = null;
        setIsSubmitting(false);
      }
    }
  };

  // Modal opened: resolve the saved bundle ids, then route. Closed: bump the generation so every
  // pending continuation goes quiet, and tear the poll loop down.
  useEffect(() => {
    if (!open || !lockFile || !readerPubky || !session) return;
    const gen = ++generation.current;
    setStage('checking');
    setIsStalled(false);
    setConnectionState(null);
    setIsConnectionPending(false);
    setWalletSetupNeeded(false);
    completedContent.current = null;
    checkWalletOnRetry.current = false;
    // A wallet check from the last opening may still be out; its `finally` no longer owns the flag.
    submittingGeneration.current = null;
    setIsSubmitting(false);

    void (async () => {
      try {
        const resolved = await LocksController.fetchResolvedPurchase({ lockFile, lockUrl, readerPubky });
        if (generation.current !== gen) return;

        // The Lock Server refused to look the saved id up for the reader's region (HTTP 451), as it refuses
        // a submission. That is the same expected answer, not a purchase that "could not be checked": nothing
        // was lost, nothing can be retried from here, and the saved id stays for a supported region.
        if (resolved?.kind === 'region-blocked') {
          setStage('region-blocked');
          return;
        }
        // An ended payment is settled by the lookup alone: submitting it again would only echo the
        // same status back.
        if (resolved?.kind === 'terminal') {
          applyStatus(gen, resolved.bundleId, resolved.status);
          return;
        }
        if (resolved?.task) {
          const { bundleId, task } = resolved;
          if (task.status === 'completed') {
            applyStatus(gen, bundleId, task.status);
            return;
          }
          // A task that is already running needs no second submission: the connection state has its
          // own lookup now, and re-submitting would only re-confirm what the lookup just said.
          setWalletSetupNeeded(task.walletSetupNeeded);
          if (applyStatus(gen, bundleId, task.status)) {
            startPolling(gen, bundleId, true, { admissionDeadlineAt: task.admissionDeadlineAt });
          }
          return;
        }
        // Recovery is read-only up to this point. No task means new commerce, even when a
        // bundle file survived a refused or interrupted submission. Keep that file for later.
        if (holdNewPayment()) return;
        if (!resolved) {
          const hasWallet = await LocksController.hasPaykitReceiver(readerPubky);
          if (generation.current !== gen) return;
          if (!hasWallet) {
            setStage('install');
            return;
          }
        }
        // Left: no saved id at all, or a saved id whose first submission never reached the server.
        await attemptPayment(gen, false, false);
      } catch (error) {
        // Includes an unreadable saved bundle id: minting a fresh one could pay twice, so there is
        // no retry. Already reported by the Err factory that threw it.
        if (generation.current !== gen) return;
        if (endIfSessionExpired(error)) return;
        setStage('blocked');
      }
    })();

    return () => {
      // Deliberate: invalidating the generation IS the cancellation mechanism (not a node ref).
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      stopPolling.current?.();
      stopPolling.current = null;
      if (finishStallTimer.current !== null) window.clearTimeout(finishStallTimer.current);
      finishStallTimer.current = null;
    };
    // attemptPayment and the helpers it calls are stable for one opening; re-running on their
    // identity would restart the purchase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lockUrl, lockFile, readerPubky, session, paymentAvailability]);

  // Every step needs the session; without this the modal would sit on a step that can no longer move.
  useEffect(() => {
    if (open && isReauthRequired) endExpiredSession();
    // Re-running on the callback's identity would toast again for the same expiry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isReauthRequired]);

  const retry = () => void attemptPayment(generation.current, stage === 'install', true);

  const recheck = () => {
    const bundleId = waitingBundleId.current;
    if (!bundleId) return;
    // Retire a parked download now, not when the next one starts: a late failure in between would
    // show the failure screen while this lookup is still out.
    finishCall.current++;
    // Read before the stage moves: `unopened` means the payment is already done, so its Check again
    // retries the content read and must not start watching the link again.
    const paymentStillRunning = stage === 'waiting';
    // Take the retry screen away before the lookup goes out, so Check again cannot be pressed
    // again while it is still running.
    setStage(paymentStillRunning ? 'waiting' : 'finishing');
    // Unknown state included: only a settled link (or an operator block) ends the watch.
    const watchConnection = paymentStillRunning && connectionState !== 'connected' && connectionState !== 'blocked';
    startPolling(generation.current, bundleId, watchConnection, { lookupNow: true });
  };

  // Link state does not acknowledge a QR scan. Keep the contact handoff available through
  // recovery as well: a stale link can need recovery before the reader has added the creator.
  const handshakePubky =
    !walletSetupNeeded &&
    (connectionState === 'none' || connectionState === 'handshake' || connectionState === 'recovery_required')
      ? (lockFile?.creator ?? null)
      : null;
  return {
    stage,
    isStalled,
    handshakePubky,
    connectionState,
    isConnectionPending,
    walletSetupNeeded,
    isSubmitting,
    retry,
    recheck,
    viewContent,
  };
}
