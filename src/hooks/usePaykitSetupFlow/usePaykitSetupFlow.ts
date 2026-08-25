'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LocksController } from '@/controllers/locks/locks';
import type { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isAppError, toAppError } from '@/libs/error/error.utils';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import { PaykitSetupFlowStatus, type UsePaykitSetupFlowReturn } from './usePaykitSetupFlow.types';
import { readPaykitSetupBridgeMessage } from './usePaykitSetupFlow.utils';

/**
 * Drives the iframe-based Paykit setup flow, where a creator connects the account that receives
 * payments.
 *
 * `start()` generates a CSRF `state` and the `/setup` URL for the modal to load in an iframe. The
 * Paykit page posts the outcome back to the parent; the message is validated (origin / iframe
 * source / schema), `state` is checked, and a success is recorded on the Locks session.
 */
export function usePaykitSetupFlow(): UsePaykitSetupFlowReturn {
  const [status, setStatus] = useState<PaykitSetupFlowStatus>(PaykitSetupFlowStatus.IDLE);
  const [setupUrl, setSetupUrl] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const stateRef = useRef<string | null>(null);
  // The only origin allowed to post the callback — derived from the setup URL.
  const paykitOriginRef = useRef<string | null>(null);
  // Which Locks session started the flow: approval belongs to that creator, not whoever is signed in
  // when the callback lands.
  const sessionSecretRef = useRef<string | null>(null);

  // Keep useCallback: the React Compiler skips any hook with a `throw` inside a `try` block — the
  // message handler in this file's useEffect has several — so nothing here is memoized for us.
  // Consumers put these in useEffect deps, where a new identity each render means an endless loop.
  // https://github.com/react/react/issues/35605
  const reset = useCallback(() => {
    stateRef.current = null;
    paykitOriginRef.current = null;
    sessionSecretRef.current = null;
    setSetupUrl(null);
    setError(null);
    setStatus(PaykitSetupFlowStatus.IDLE);
  }, []);

  const start = useCallback(() => {
    setError(null);
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

        LocksController.markPaykitConnected();
        setStatus(PaykitSetupFlowStatus.SUCCESS);
      } catch (caught) {
        // No Logger here: Err.validation / toAppError both log at creation (double-log otherwise).
        setError(isAppError(caught) ? caught : toAppError(caught, ErrorService.Locks, 'usePaykitSetupFlow.onCallback'));
        setStatus(PaykitSetupFlowStatus.ERROR);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [status]);

  return { status, setupUrl, error, iframeRef, start, reset };
}
