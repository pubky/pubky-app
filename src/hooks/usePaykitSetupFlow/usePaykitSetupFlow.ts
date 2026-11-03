'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LocksController } from '@/controllers/locks/locks';
import type { AppError } from '@/libs/error/error';
import { TimeoutErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isAppError, toAppError } from '@/libs/error/error.utils';
import type { TLockPriceAsset, TPaykitSetupStatus } from '@/services/locks/locks.types';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import { PaykitSetupFlowStatus, type UsePaykitSetupFlowReturn } from './usePaykitSetupFlow.types';
import { isPaykitSetupReadyMessage, readPaykitSetupBridgeMessage } from './usePaykitSetupFlow.utils';

/**
 * How long the `/setup` iframe may stay silent after its `load` event. Paykit's page posts
 * `paykit-setup-ready` before its first poll, so a page that rendered says so at once; one that
 * loaded and stayed silent is an error body or a proxy page (#3027).
 */
export const SETUP_READY_AFTER_LOAD_MS = 5_000;

/**
 * How long the `/setup` iframe may take to report it rendered, counted from its mount. Covers a
 * request that never fires `load` (a stalled connection), where the 5 s limit above never starts.
 */
export const SETUP_MOUNT_TIMEOUT_MS = 20_000;

/** The error for a `/setup` page that never reported it rendered, counted from `mount` or `load`. */
const setupPageTimeout = (countedFrom: 'mount' | 'load'): AppError =>
  Err.timeout(TimeoutErrorCode.REQUEST_TIMEOUT, 'Paykit setup page did not render', {
    service: ErrorService.Locks,
    operation: 'usePaykitSetupFlow.awaitSetupPage',
    context: { countedFrom },
  });

/**
 * Drives the iframe-based Paykit setup flow, where a creator connects the account that receives
 * payments.
 *
 * `check()` asks the Lock Server first whether this creator's Paykit setup is already done, so a
 * returning creator is not sent through it again (#2627). `start()` generates a CSRF `state` and the
 * `/setup` URL for the modal to load in an iframe. The Paykit page posts the outcome back to the
 * parent; the message is validated (origin / iframe source / schema), `state` is checked, and a
 * success is recorded on the Locks session.
 *
 * The iframe stays hidden (`isSetupReady` false) until the page posts `paykit-setup-ready`. A page
 * that failed to render never posts it, so after `SETUP_READY_AFTER_LOAD_MS` from `load`, or
 * `SETUP_MOUNT_TIMEOUT_MS` from mount, the flow moves to `ERROR` instead of showing the raw body.
 */
export function usePaykitSetupFlow(asset: TLockPriceAsset): UsePaykitSetupFlowReturn {
  const [status, setStatus] = useState<PaykitSetupFlowStatus>(PaykitSetupFlowStatus.IDLE);
  const [setupUrl, setSetupUrl] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [isSetupReady, setIsSetupReady] = useState(false);
  const [isSetupLoaded, setIsSetupLoaded] = useState(false);
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
    setIsSetupReady(false);
    setIsSetupLoaded(false);
    setStatus(PaykitSetupFlowStatus.IDLE);
  }, []);

  const start = useCallback(() => {
    setError(null);
    setIsSetupReady(false);
    setIsSetupLoaded(false);
    const setupState = crypto.randomUUID();
    stateRef.current = setupState;
    sessionSecretRef.current = useLocksAuthStore.getState().selectLocksSessionSecret();

    try {
      const url = LocksController.getPaykitSetupUrl({ state: setupState });
      paykitOriginRef.current = new URL(url).origin;
      setSetupUrl(url);
      setStatus(PaykitSetupFlowStatus.AWAITING_APPROVAL);
    } catch (caught) {
      setError(toAppError(caught, ErrorService.Locks, 'usePaykitSetupFlow.start'));
      setStatus(PaykitSetupFlowStatus.ERROR);
    }
  }, []);

  // Only `setup_required` opens the setup: `unavailable` or a failed check never does, because Paykit
  // may already hold this creator's account.
  const check = useCallback(async () => {
    const run = (checkRef.current += 1);
    const sessionSecret = useLocksAuthStore.getState().selectLocksSessionSecret();
    setError(null);
    // A retry after a failed setup still holds that setup's URL, which would keep its iframe on screen.
    setSetupUrl(null);
    setStatus(PaykitSetupFlowStatus.CHECKING);

    let setupStatus: TPaykitSetupStatus | null = null;
    let failure: AppError | null = null;
    try {
      setupStatus = await LocksController.fetchPaykitSetupStatus(asset);
    } catch (caught) {
      failure = toAppError(caught, ErrorService.Locks, 'usePaykitSetupFlow.check');
    }
    if (run !== checkRef.current) return;
    // The answer is about the session that asked. After a sign-out, another sign-in or a rejected
    // session (cleared by the controller), go back to idle so the next session is checked.
    if (useLocksAuthStore.getState().selectLocksSessionSecret() !== sessionSecret) {
      setStatus(PaykitSetupFlowStatus.IDLE);
      return;
    }

    if (setupStatus === 'ready') {
      LocksController.markPaykitConnected();
      setStatus(PaykitSetupFlowStatus.SUCCESS);
    } else if (setupStatus === 'setup_required') {
      start();
    } else {
      setError(failure);
      setStatus(PaykitSetupFlowStatus.UNAVAILABLE);
    }
  }, [start, asset]);

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
        if (message.error) throw fail(`Paykit setup failed: ${message.error}`);
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
  }, [status, check]);

  const onSetupLoad = useCallback(() => setIsSetupLoaded(true), []);

  const isWaitingForSetupPage = status === PaykitSetupFlowStatus.AWAITING_APPROVAL && !isSetupReady;

  // Until the page reports it rendered: listen for that report, and cap the wait from mount.
  useEffect(() => {
    if (!isWaitingForSetupPage) return;

    const onMessage = (event: MessageEvent) => {
      if (
        isPaykitSetupReadyMessage(
          event,
          iframeRef.current?.contentWindow ?? null,
          paykitOriginRef.current ?? '',
          stateRef.current,
        )
      ) {
        setIsSetupReady(true);
      }
    };
    const timer = setTimeout(() => {
      setError(setupPageTimeout('mount'));
      setStatus(PaykitSetupFlowStatus.ERROR);
    }, SETUP_MOUNT_TIMEOUT_MS);
    window.addEventListener('message', onMessage);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
    };
  }, [isWaitingForSetupPage]);

  // `load` fires for an error body too, so it only starts the short wait for the report.
  useEffect(() => {
    if (!isWaitingForSetupPage || !isSetupLoaded) return;
    const timer = setTimeout(() => {
      setError(setupPageTimeout('load'));
      setStatus(PaykitSetupFlowStatus.ERROR);
    }, SETUP_READY_AFTER_LOAD_MS);
    return () => clearTimeout(timer);
  }, [isWaitingForSetupPage, isSetupLoaded]);

  return { status, setupUrl, error, iframeRef, isSetupReady, onSetupLoad, check, start, reset };
}
