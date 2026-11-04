'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session as LocksSdkSession } from '@synonymdev/locks-sdk';
import { LocksController } from '@/controllers/locks/locks';
import { isAuthFlowCanceledError } from '@/libs/error/auth-flow-canceled';
import type { AppError } from '@/libs/error/error';
import { TimeoutErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isAppError, toAppError } from '@/libs/error/error.utils';
import { LocksAuthFlowStatus, type UseLocksAuthFlowReturn } from './useLocksAuthFlow.types';
import { isLocksAuthReadyMessage, readLocksAuthBridgeMessage } from './useLocksAuthFlow.utils';

/**
 * How long the `/connect` iframe may stay silent after its `load` event. The shell's script posts a
 * `locks-auth-resize` height report before anything else, so a page that rendered says so at once;
 * one that loaded and stayed silent is an error body or a proxy page (#3027).
 */
export const CONNECT_READY_AFTER_LOAD_MS = 5_000;

/**
 * How long the `/connect` iframe may take to report it rendered, counted from its mount. Covers a
 * request that never fires `load` (a stalled connection), where the 5 s limit above never starts.
 */
export const CONNECT_MOUNT_TIMEOUT_MS = 20_000;

/** The error for a `/connect` page that never reported it rendered, counted from `mount` or `load`. */
const connectPageTimeout = (countedFrom: 'mount' | 'load'): AppError =>
  Err.timeout(TimeoutErrorCode.REQUEST_TIMEOUT, 'Lock Server connect page did not render', {
    service: ErrorService.Locks,
    operation: 'useLocksAuthFlow.awaitConnectPage',
    context: { countedFrom },
  });

/**
 * Drives the iframe-based Lock Server auth flow.
 *
 * `start()` generates a CSRF `state`, asks the controller for the `/connect` URL, and exposes it
 * for the modal to load in an iframe. The `/connect` page posts the one-time `code` + `state` back
 * to the parent; the message is validated (origin / iframe source / schema), `state` is checked,
 * and the code is exchanged for a session.
 *
 * The iframe stays hidden (`isConnectReady` false) until the shell posts its first
 * `locks-auth-resize` report, validated like the callback. A page that failed to render never posts
 * it, so after `CONNECT_READY_AFTER_LOAD_MS` from `load`, or `CONNECT_MOUNT_TIMEOUT_MS` from mount,
 * the flow moves to `ERROR` and the dialog offers Try again instead of the page's raw body.
 */
export function useLocksAuthFlow(): UseLocksAuthFlowReturn {
  const [status, setStatus] = useState<LocksAuthFlowStatus>(LocksAuthFlowStatus.IDLE);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const [session, setSession] = useState<LocksSdkSession | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [isConnectReady, setIsConnectReady] = useState(false);
  const [isConnectLoaded, setIsConnectLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const stateRef = useRef<string | null>(null);
  // The only origin allowed to post the callback — derived from the connect URL the server returned.
  const lockServerOriginRef = useRef<string | null>(null);
  // Identifies the current server check, so `prepare()` can drop the answer of an outdated one.
  const serverCheckRef = useRef(0);

  // Keep useCallback: the React Compiler skips any hook with a `throw` inside a `try` block — the
  // message handler in this file's useEffect has two — so nothing here is memoized for us.
  // Consumers put these in useEffect deps, where a new identity each render means an endless loop.
  // https://github.com/react/react/issues/35605
  const reset = useCallback(() => {
    serverCheckRef.current += 1;
    stateRef.current = null;
    lockServerOriginRef.current = null;
    setConnectUrl(null);
    setSession(null);
    setError(null);
    setIsConnectReady(false);
    setIsConnectLoaded(false);
    setStatus(LocksAuthFlowStatus.IDLE);
  }, []);

  // Run when the modal opens: probe readiness before the user can start, so a dead / not-ready server
  // disables "Continue" (with a message) instead of loading a broken iframe on click.
  const prepare = useCallback(async () => {
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
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setIsConnectReady(false);
    setIsConnectLoaded(false);
    setStatus(LocksAuthFlowStatus.CONNECTING);

    const authState = crypto.randomUUID();
    stateRef.current = authState;

    try {
      const url = await LocksController.getConnectUrl({ state: authState });
      if (stateRef.current !== authState) return;
      lockServerOriginRef.current = new URL(url).origin;
      setConnectUrl(url);
      setStatus(LocksAuthFlowStatus.AWAITING_APPROVAL);
    } catch (caught) {
      if (stateRef.current !== authState) return;
      setError(toAppError(caught, ErrorService.Locks, 'useLocksAuthFlow.start'));
      setStatus(LocksAuthFlowStatus.ERROR);
    }
  }, []);

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

      const authState = stateRef.current;
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
        if (stateRef.current !== authState) return;
        // A discarded exchange is a quiet cancellation, not a session or a pending request.
        if (!result) {
          setStatus(LocksAuthFlowStatus.IDLE);
          return;
        }
        setSession(result.session);
        setStatus(LocksAuthFlowStatus.SUCCESS);
      } catch (caught) {
        if (stateRef.current !== authState) return;
        if (isAuthFlowCanceledError(caught)) {
          setStatus(LocksAuthFlowStatus.IDLE);
          return;
        }
        // No Logger here: Err.validation / toAppError both log at creation (double-log otherwise).
        setError(isAppError(caught) ? caught : toAppError(caught, ErrorService.Locks, 'useLocksAuthFlow.onCallback'));
        setStatus(LocksAuthFlowStatus.ERROR);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [status]);

  const onConnectLoad = useCallback(() => setIsConnectLoaded(true), []);

  const isWaitingForConnectPage = status === LocksAuthFlowStatus.AWAITING_APPROVAL && !isConnectReady;

  // Until the page reports it rendered: listen for that report, and cap the wait from mount.
  useEffect(() => {
    if (!isWaitingForConnectPage) return;

    const onMessage = (event: MessageEvent) => {
      if (isLocksAuthReadyMessage(event, iframeRef.current?.contentWindow ?? null, lockServerOriginRef.current ?? '')) {
        setIsConnectReady(true);
      }
    };
    const timer = setTimeout(() => {
      setError(connectPageTimeout('mount'));
      setStatus(LocksAuthFlowStatus.ERROR);
    }, CONNECT_MOUNT_TIMEOUT_MS);
    window.addEventListener('message', onMessage);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
    };
  }, [isWaitingForConnectPage]);

  // `load` fires for an error body too, so it only starts the short wait for the report.
  useEffect(() => {
    if (!isWaitingForConnectPage || !isConnectLoaded) return;
    const timer = setTimeout(() => {
      setError(connectPageTimeout('load'));
      setStatus(LocksAuthFlowStatus.ERROR);
    }, CONNECT_READY_AFTER_LOAD_MS);
    return () => clearTimeout(timer);
  }, [isWaitingForConnectPage, isConnectLoaded]);

  return { status, connectUrl, session, error, iframeRef, isConnectReady, onConnectLoad, prepare, start, reset };
}
