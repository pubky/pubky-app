'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LocksController } from '@/controllers/locks/locks';
import { useIframeReady } from '@/hooks/useIframeReady/useIframeReady';
import type { IframeReadyCountedFrom } from '@/hooks/useIframeReady/useIframeReady.types';
import type { AppError } from '@/libs/error/error';
import { TimeoutErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isAppError, toAppError } from '@/libs/error/error.utils';
import type { TLockPriceAsset, TPaykitSetupStatus } from '@/services/locks/locks.types';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import { PaykitSetupFlowStatus, type PaykitSetupMode, type UsePaykitSetupFlowReturn } from './usePaykitSetupFlow.types';
import { isPaykitSetupReadyMessage, readPaykitSetupBridgeMessage } from './usePaykitSetupFlow.utils';

const AWAIT_SETUP_PAGE_OPERATION = 'usePaykitSetupFlow.awaitSetupPage';

/** The error for a `/setup` page that never reported it rendered, counted from `mount` or `load`. */
const setupPageTimeout = (countedFrom: IframeReadyCountedFrom): AppError =>
  Err.timeout(TimeoutErrorCode.REQUEST_TIMEOUT, 'Paykit setup page did not render', {
    service: ErrorService.Locks,
    operation: AWAIT_SETUP_PAGE_OPERATION,
    context: { countedFrom },
  });

/**
 * Asks the Paykit Server whether it already holds the signed-in creator. `held` is `null` when it
 * could not answer, which says nothing about the creator.
 */
async function readPaykitHeld(operation: string): Promise<{ held: boolean | null; failure: AppError | null }> {
  try {
    return { held: await LocksController.fetchPaykitCreatorHeld(), failure: null };
  } catch (caught) {
    return { held: null, failure: toAppError(caught, ErrorService.Locks, operation) };
  }
}

/**
 * Drives the iframe-based Paykit setup flow, where a creator connects the account that receives
 * payments.
 *
 * `check()` asks the Lock Server first whether this creator's Paykit setup is already done, so a
 * returning creator is not sent through it again (#2627). When it is not, Paykit is asked whether it
 * already holds the creator: it refuses the initial `/setup` for one it holds, so that creator is sent
 * to `/setup/reconnect` instead (`RECONNECT_REQUIRED`, then `reconnect()`). The same question is asked
 * after a setup or reconnect fails, because the failure callback carries no reason. `start()` generates a CSRF
 * `state` and the `/setup` URL for the modal to load in an iframe. The Paykit page posts the outcome
 * back to the parent; the message is validated (origin / iframe source / schema), `state` is checked,
 * and a success is recorded on the Locks session.
 *
 * The iframe stays hidden (`isSetupReady` false) until the page posts `paykit-setup-ready`. A page
 * that failed to render never posts it, so after `IFRAME_READY_AFTER_LOAD_MS` from `load`, or
 * `IFRAME_MOUNT_TIMEOUT_MS` from mount (`useIframeReady`), the flow moves to `ERROR` instead of showing
 * the raw body.
 */
export function usePaykitSetupFlow(asset: TLockPriceAsset): UsePaykitSetupFlowReturn {
  const [status, setStatus] = useState<PaykitSetupFlowStatus>(PaykitSetupFlowStatus.IDLE);
  const [mode, setMode] = useState<PaykitSetupMode>('setup');
  const [setupUrl, setSetupUrl] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const stateRef = useRef<string | null>(null);
  // The only origin allowed to post the callback — derived from the setup URL.
  const paykitOriginRef = useRef<string | null>(null);
  // Which Locks session started the flow: approval belongs to that creator, not whoever is signed in
  // when the callback lands.
  const sessionSecretRef = useRef<string | null>(null);
  // Identifies the current setup-status check, so a reset or a newer check drops an outdated answer.
  const checkRef = useRef(0);

  // Keep useCallback: the React Compiler skips any hook with a `throw` inside a `try` block — the
  // message handler in this file's useEffect has several — so nothing here is memoized for us.
  // Consumers put these in useEffect deps, where a new identity each render means an endless loop.
  // https://github.com/react/react/issues/35605
  const reset = useCallback(() => {
    checkRef.current += 1;
    stateRef.current = null;
    paykitOriginRef.current = null;
    sessionSecretRef.current = null;
    setSetupUrl(null);
    setError(null);
    setMode('setup');
    setStatus(PaykitSetupFlowStatus.IDLE);
  }, []);

  const open = useCallback((nextMode: PaykitSetupMode) => {
    setError(null);
    setMode(nextMode);
    const setupState = crypto.randomUUID();
    stateRef.current = setupState;
    sessionSecretRef.current = useLocksAuthStore.getState().selectLocksSessionSecret();

    try {
      const url =
        nextMode === 'reconnect'
          ? LocksController.getPaykitReconnectUrl({ state: setupState })
          : LocksController.getPaykitSetupUrl({ state: setupState });
      paykitOriginRef.current = new URL(url).origin;
      setSetupUrl(url);
      setStatus(PaykitSetupFlowStatus.AWAITING_APPROVAL);
    } catch (caught) {
      setError(
        toAppError(
          caught,
          ErrorService.Locks,
          `usePaykitSetupFlow.${nextMode === 'reconnect' ? 'reconnect' : 'start'}`,
        ),
      );
      setStatus(PaykitSetupFlowStatus.ERROR);
    }
  }, []);

  const start = useCallback(() => open('setup'), [open]);
  const reconnect = useCallback(() => open('reconnect'), [open]);

  // True when an awaited answer no longer applies: the flow was reset or a newer check started, or the
  // session that asked was signed out or replaced (the next session is then checked from idle).
  const isOutdated = useCallback((run: number, sessionSecret: string | null) => {
    if (run !== checkRef.current) return true;
    if (useLocksAuthStore.getState().selectLocksSessionSecret() !== sessionSecret) {
      setStatus(PaykitSetupFlowStatus.IDLE);
      return true;
    }
    return false;
  }, []);

  // Paykit refuses `/setup` for a creator it holds, so a held creator goes to the reconnect; if Paykit cannot
  // say, nothing opens.
  const followHeld = useCallback(
    async (run: number, sessionSecret: string | null, operation: string, onNotHeld: () => void) => {
      const { held, failure } = await readPaykitHeld(operation);
      if (isOutdated(run, sessionSecret)) return;
      if (held === null) {
        setError(failure);
        setStatus(PaykitSetupFlowStatus.UNAVAILABLE);
      } else if (held) {
        setStatus(PaykitSetupFlowStatus.RECONNECT_REQUIRED);
      } else {
        onNotHeld();
      }
    },
    [isOutdated],
  );

  // Only `setup_required` leads on: `unavailable` or a failed check never does, because Paykit may already hold
  // this creator's account. If Paykit cannot say, the unavailable state offers a retry without guessing.
  const followSetupStatus = useCallback(
    async (run: number, sessionSecret: string | null, operation: string, onNotHeld: () => void) => {
      let setupStatus: TPaykitSetupStatus | null = null;
      let failure: AppError | null = null;
      try {
        setupStatus = await LocksController.fetchPaykitSetupStatus(asset);
      } catch (caught) {
        failure = toAppError(caught, ErrorService.Locks, operation);
      }
      // The answer is about the session that asked. After a sign-out, another sign-in or a rejected
      // session (cleared by the controller), go back to idle so the next session is checked.
      if (isOutdated(run, sessionSecret)) return;

      if (setupStatus === 'ready') {
        LocksController.markPaykitConnected();
        setStatus(PaykitSetupFlowStatus.SUCCESS);
      } else if (setupStatus === 'setup_required') {
        await followHeld(run, sessionSecret, operation, onNotHeld);
      } else {
        setError(failure);
        setStatus(PaykitSetupFlowStatus.UNAVAILABLE);
      }
    },
    [asset, isOutdated, followHeld],
  );

  // The failure callback only says `setup-failed`. Paykit can commit setup or reconnect and still send it when
  // its relay acknowledgement fails, so the Lock Server is asked first: a ready creator is done, and a
  // reconnect would rotate its receiving account for nothing. Otherwise ask Paykit why it can matter: a
  // held creator is refused `/setup` and needs the reconnect; one it does not hold has nothing to reconnect.
  const diagnoseFailedSetup = useCallback(async () => {
    const run = (checkRef.current += 1);
    const sessionSecret = sessionSecretRef.current;
    setSetupUrl(null);
    setStatus(PaykitSetupFlowStatus.CHECKING);
    await followSetupStatus(run, sessionSecret, 'usePaykitSetupFlow.diagnoseFailedSetup', () =>
      setStatus(PaykitSetupFlowStatus.SETUP_INCOMPLETE),
    );
  }, [followSetupStatus]);

  /** Starts a fresh check for the signed-in session: clears the last error and any setup iframe. */
  const beginCheck = useCallback(() => {
    const run = (checkRef.current += 1);
    setError(null);
    // A retry after a failed setup still holds that setup's URL, which would keep its iframe on screen.
    setSetupUrl(null);
    setStatus(PaykitSetupFlowStatus.CHECKING);
    return { run, sessionSecret: useLocksAuthStore.getState().selectLocksSessionSecret() };
  }, []);

  const check = useCallback(async () => {
    const { run, sessionSecret } = beginCheck();
    await followSetupStatus(run, sessionSecret, 'usePaykitSetupFlow.check', start);
  }, [beginCheck, followSetupStatus, start]);

  // #2984: skips the Lock Server, whose `unavailable` would repeat; docs/locks.md.
  const checkHeld = useCallback(async () => {
    const { run, sessionSecret } = beginCheck();
    await followHeld(run, sessionSecret, 'usePaykitSetupFlow.checkHeld', start);
  }, [beginCheck, followHeld, start]);

  useEffect(() => {
    if (status !== PaykitSetupFlowStatus.AWAITING_APPROVAL) return;

    const handler = (event: MessageEvent) => {
      const message = readPaykitSetupBridgeMessage(
        event,
        iframeRef.current?.contentWindow ?? null,
        paykitOriginRef.current ?? '',
      );
      if (!message) return; // ignore unrelated / invalid messages
      window.removeEventListener('message', handler); // one-shot: a valid callback ends the listen

      const fail = (reason: string) =>
        Err.validation(ValidationErrorCode.INVALID_INPUT, reason, {
          service: ErrorService.Locks,
          operation: 'usePaykitSetupFlow.onCallback',
        });

      try {
        if (!stateRef.current || message.state !== stateRef.current) {
          throw fail('Paykit setup callback state mismatch');
        }
        if (message.error) {
          void diagnoseFailedSetup();
          return;
        }
        if (useLocksAuthStore.getState().selectLocksSessionSecret() !== sessionSecretRef.current) {
          throw fail('Locks session changed while Paykit setup was open');
        }

        void check();
      } catch (caught) {
        // No Logger here: Err.validation / toAppError both log at creation (double-log otherwise).
        setError(isAppError(caught) ? caught : toAppError(caught, ErrorService.Locks, 'usePaykitSetupFlow.onCallback'));
        setStatus(PaykitSetupFlowStatus.ERROR);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [status, check, diagnoseFailedSetup]);

  // A new setup URL (each `start()` carries a fresh `state`) starts a fresh wait for the page.
  const { isReady: isSetupReady, onLoad: onSetupLoad } = useIframeReady({
    key: setupUrl,
    isWaiting: status === PaykitSetupFlowStatus.AWAITING_APPROVAL,
    isReadyMessage: (event) =>
      isPaykitSetupReadyMessage(
        event,
        iframeRef.current?.contentWindow ?? null,
        paykitOriginRef.current ?? '',
        stateRef.current,
      ),
    onTimeout: (countedFrom) => {
      setError(setupPageTimeout(countedFrom));
      setStatus(PaykitSetupFlowStatus.ERROR);
    },
  });

  // The page never rendered, so the creator saw no QR: nothing was there to approve.
  const isSetupPageFailed =
    status === PaykitSetupFlowStatus.ERROR && isAppError(error) && error.operation === AWAIT_SETUP_PAGE_OPERATION;

  return {
    status,
    mode,
    setupUrl,
    error,
    iframeRef,
    isSetupReady,
    isSetupPageFailed,
    onSetupLoad,
    check,
    checkHeld,
    start,
    reconnect,
    reset,
  };
}
