'use client';

import { useEffect, useRef, useState } from 'react';
import type { Session as LocksSdkSession } from '@pubky/locks-sdk';
import { LocksController } from '@/controllers/locks/locks';
import type { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isAppError, toAppError } from '@/libs/error/error.utils';
import { LocksAuthFlowStatus, type UseLocksAuthFlowReturn } from './useLocksAuthFlow.types';
import { readLocksAuthBridgeMessage } from './useLocksAuthFlow.utils';

/**
 * Drives the iframe-based Lock Server auth flow.
 *
 * `start()` generates a CSRF `state`, asks the controller for the `/connect` URL, and exposes it
 * for the modal to load in an iframe. The `/connect` page posts the one-time `code` + `state` back
 * to the parent; the message is validated (origin / iframe source / schema), `state` is checked,
 * and the code is exchanged for a session.
 */
export function useLocksAuthFlow(): UseLocksAuthFlowReturn {
  const [status, setStatus] = useState<LocksAuthFlowStatus>(LocksAuthFlowStatus.IDLE);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const [session, setSession] = useState<LocksSdkSession | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const stateRef = useRef<string | null>(null);
  // The only origin allowed to post the callback — derived from the connect URL the server returned.
  const lockServerOriginRef = useRef<string | null>(null);
  // Identifies the current server check, so `prepare()` can drop the answer of an outdated one.
  const serverCheckRef = useRef(0);

  const reset = () => {
    serverCheckRef.current += 1;
    stateRef.current = null;
    lockServerOriginRef.current = null;
    setConnectUrl(null);
    setSession(null);
    setError(null);
    setStatus(LocksAuthFlowStatus.IDLE);
  };

  // Run when the modal opens: probe readiness before the user can start, so a dead / not-ready server
  // disables "Continue" (with a message) instead of loading a broken iframe on click.
  const prepare = async () => {
    const serverCheck = (serverCheckRef.current += 1);
    const isOutdated = () => serverCheck !== serverCheckRef.current;
    setError(null);
    setStatus(LocksAuthFlowStatus.CHECKING_SERVER);
    try {
      const reachable = await LocksController.isServerReachable();
      if (isOutdated()) return;
      setStatus(reachable ? LocksAuthFlowStatus.IDLE : LocksAuthFlowStatus.SERVER_UNAVAILABLE);
    } catch (caught) {
      if (isOutdated()) return;
      setError(toAppError(caught, ErrorService.Locks, 'useLocksAuthFlow.prepare'));
      setStatus(LocksAuthFlowStatus.SERVER_UNAVAILABLE);
    }
  };

  const start = async () => {
    setError(null);
    setStatus(LocksAuthFlowStatus.CONNECTING);

    const authState = crypto.randomUUID();
    stateRef.current = authState;

    try {
      const url = await LocksController.getConnectUrl({ state: authState });
      lockServerOriginRef.current = new URL(url).origin;
      setConnectUrl(url);
      setStatus(LocksAuthFlowStatus.AWAITING_APPROVAL);
    } catch (caught) {
      setError(toAppError(caught, ErrorService.Locks, 'useLocksAuthFlow.start'));
      setStatus(LocksAuthFlowStatus.ERROR);
    }
  };

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
        const result = await LocksController.completeAuthFromCallback({ code, state });
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
  }, [status]);

  return { status, connectUrl, session, error, iframeRef, prepare, start, reset };
}
