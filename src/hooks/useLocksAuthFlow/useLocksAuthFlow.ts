'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session as LocksSdkSession } from '@pubky/locks-sdk';
import { LocksController } from '@/controllers/locks/locks';
import type { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isAppError, toAppError } from '@/libs/error/error.utils';
import { readLocksAuthBridgeMessage } from '@/libs/locks/locksAuthBridge';
import { LocksAuthFlowStatus, type UseLocksAuthFlowReturn } from './useLocksAuthFlow.types';

/**
 * Drives the iframe-based Lock Server auth flow.
 *
 * `start()` generates a CSRF `state`, asks the controller for the `/connect` URL, and exposes it
 * for the modal to load in an iframe. The `/connect` page posts the one-time `code` + `state` back
 * to the parent; the message is validated (origin / iframe source / schema), `state` is checked,
 * and the code is exchanged for a session.
 */
export function useLocksAuthFlow(lockServerPubky: string): UseLocksAuthFlowReturn {
  const [status, setStatus] = useState<LocksAuthFlowStatus>(LocksAuthFlowStatus.IDLE);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const [session, setSession] = useState<LocksSdkSession | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const stateRef = useRef<string | null>(null);
  // The only origin allowed to post the callback — derived from the connect URL the server returned.
  const lockServerOriginRef = useRef<string | null>(null);

  // useCallback IS required here: consumers put `start`/`reset` in a useEffect dep array, so an
  // unstable identity re-runs the effect → re-calls start() → infinite loop. Keep them ref-stable.
  const reset = useCallback(() => {
    stateRef.current = null;
    lockServerOriginRef.current = null;
    setConnectUrl(null);
    setSession(null);
    setError(null);
    setStatus(LocksAuthFlowStatus.IDLE);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStatus(LocksAuthFlowStatus.CONNECTING);

    const authState = crypto.randomUUID();
    stateRef.current = authState;

    try {
      const url = await LocksController.getConnectUrl({ lockServerPubky, state: authState });
      lockServerOriginRef.current = new URL(url).origin;
      setConnectUrl(url);
      setStatus(LocksAuthFlowStatus.AWAITING_APPROVAL);
    } catch (caught) {
      setError(toAppError(caught, ErrorService.Locks, 'useLocksAuthFlow.start'));
      setStatus(LocksAuthFlowStatus.ERROR);
    }
  }, [lockServerPubky]);

  useEffect(() => {
    if (status !== LocksAuthFlowStatus.AWAITING_APPROVAL) return;

    const handler = async (event: MessageEvent) => {
      const message = readLocksAuthBridgeMessage(
        event,
        iframeRef.current?.contentWindow ?? null,
        lockServerOriginRef.current ?? '',
      );
      if (!message) return; // ignore unrelated / invalid messages
      window.removeEventListener('message', handler); // one-shot: a valid callback ends the listen

      try {
        if ('error' in message) {
          throw Err.validation(ValidationErrorCode.INVALID_INPUT, `Lock auth failed: ${message.error}`, {
            service: ErrorService.Locks,
            operation: 'useLocksAuthFlow.onCallback',
          });
        }

        const { code, state } = message;
        if (!stateRef.current || state !== stateRef.current) {
          throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Lock auth callback state mismatch', {
            service: ErrorService.Locks,
            operation: 'useLocksAuthFlow.onCallback',
          });
        }
        setStatus(LocksAuthFlowStatus.EXCHANGING);
        const result = await LocksController.completeAuthFromCallback({ lockServerPubky, code, state });
        setSession(result.session);
        setStatus(LocksAuthFlowStatus.SUCCESS);
      } catch (caught) {
        // No Logger here: Err.validation / toAppError both log at creation (double-log otherwise).
        setError(isAppError(caught) ? caught : toAppError(caught, ErrorService.Locks, 'useLocksAuthFlow.onCallback'));
        setStatus(LocksAuthFlowStatus.ERROR);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [status, lockServerPubky]);

  return { status, connectUrl, session, error, iframeRef, start, reset };
}
