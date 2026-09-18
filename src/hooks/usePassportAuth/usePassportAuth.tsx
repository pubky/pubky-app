'use client';

import { useEffect, useRef, useState } from 'react';
import { getPassportUrl } from '@/config/network';
import {
  PASSPORT_ATTEMPT_TIMEOUT_MS,
  PASSPORT_POPUP_CLOSED_POLL_MS,
  PASSPORT_POPUP_FEATURES,
  PASSPORT_POPUP_NAME_PREFIX,
} from '@/config/passport';
import { AuthController } from '@/controllers/auth/auth';
import { isAppError, isWrongEnvironmentHomeserverError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import {
  buildPassportAuthorizeUrl,
  buildPassportCallbacks,
  buildPassportOutcomeAck,
  getPassportOrigin,
  parsePassportOutcomeMessage,
  parsePassportReturnMessage,
} from '@/libs/passport/passport';
import type { PassportOutcome } from '@/libs/passport/passport.types';
import { toast } from '@/molecules/Toaster/toast';
import { AUTH_FLOW_CANCELED_ERROR_NAME } from '@/services/homeserver/error.utils';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import type {
  PassportAttemptResult,
  PassportFailureReason,
  UsePassportAuthOptions,
  UsePassportAuthReturn,
} from './usePassportAuth.types';

/**
 * One attempt's lifecycle:
 * - `authorizing`: popup open, waiting for the relay. Popup outcomes, popup closure and the
 *   wall-clock timeout can all end the attempt here.
 * - `initializing`: the SDK session was accepted. Authorization signals are torn down first so
 *   nothing at hook level can interrupt or misreport `initializeAuthenticatedSession`.
 * - `settled`: `onAttemptSettled` fired exactly once.
 */
type AttemptPhase = 'authorizing' | 'initializing' | 'settled';

type PassportAttempt = {
  id: string;
  popup: Window;
  phase: AttemptPhase;
  /** A validated Passport `success` was received: popup closure is expected and must not fail the attempt. */
  successRecorded: boolean;
  cancelAuthFlow: (() => void) | null;
  /** Tear down listener, timeout and popup poll. Idempotent. */
  stopAuthorizationSignals: () => void;
};

const FAILURE_TOAST_COPY: Record<PassportFailureReason, string> = {
  'popup-blocked': 'Allow pop-ups for this site to continue with Google.',
  cancel: 'Google sign-in was cancelled.',
  error: 'Passport could not complete the sign-in. Try again.',
  'popup-closed': 'The Passport window was closed before sign-in finished.',
  timeout: 'Google sign-in timed out. Try again.',
  'flow-error': 'Sign in with Google failed. Try again.',
};

const isAuthFlowCanceledError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'name' in error &&
  (error as { name?: unknown }).name === AUTH_FLOW_CANCELED_ERROR_NAME;

/**
 * Drive one Pubky Passport ("Continue with Google") attempt.
 *
 * Passport is a signer for the same `pubkyauth://` cookie flow Pubky Ring uses: the hook opens
 * Passport in a popup and waits for the HTTP relay. Only the SDK `Session` returned by the relay
 * authenticates; every popup message or callback is a UI signal that can at most end the attempt
 * early. See `docs/environment.md` (Passport) and `pubky-passport/docs/integration.md`.
 */
export function usePassportAuth(options: UsePassportAuthOptions = {}): UsePassportAuthReturn {
  const [isPending, setIsPending] = useState(false);
  const isMountedRef = useRef(true);
  const activeAttemptRef = useRef<PassportAttempt | null>(null);
  const onAttemptSettledRef = useRef(options.onAttemptSettled);

  useEffect(() => {
    onAttemptSettledRef.current = options.onAttemptSettled;
  }, [options.onAttemptSettled]);

  useEffect(() => {
    isMountedRef.current = true;
    // The attempt deliberately survives unmount: session initialization mutates global stores
    // and must complete even if the page re-renders while the popup is open.
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const isCurrent = (attempt: PassportAttempt) => activeAttemptRef.current === attempt;

  const settle = (attempt: PassportAttempt, result: PassportAttemptResult) => {
    if (attempt.phase === 'settled' || !isCurrent(attempt)) return;
    attempt.phase = 'settled';
    attempt.stopAuthorizationSignals();
    onAttemptSettledRef.current?.({ attemptId: attempt.id, result });
  };

  /** End the authorization phase without a session. No-op once initializing or settled. */
  const fail = (attempt: PassportAttempt, reason: PassportFailureReason) => {
    if (attempt.phase !== 'authorizing' || !isCurrent(attempt)) return;
    attempt.cancelAuthFlow?.();
    toast({ variant: 'error', description: FAILURE_TOAST_COPY[reason] });
    settle(attempt, 'failed');
  };

  const handleOutcome = (attempt: PassportAttempt, outcome: PassportOutcome) => {
    if (attempt.phase !== 'authorizing' || !isCurrent(attempt)) return;
    switch (outcome) {
      case 'success':
        // Approval submitted; the relay result, not this message, completes authentication.
        attempt.successRecorded = true;
        return;
      case 'cancel':
        fail(attempt, 'cancel');
        return;
      case 'error':
        fail(attempt, 'error');
        return;
      default: {
        const exhaustive: never = outcome;
        return exhaustive;
      }
    }
  };

  const runAttempt = async (attempt: PassportAttempt, passportUrl: string) => {
    const appOrigin = window.location.origin;
    const passportOrigin = getPassportOrigin(passportUrl);

    const onMessage = (event: MessageEvent<unknown>) => {
      if (attempt.phase !== 'authorizing' || !isCurrent(attempt)) return;

      const passportOutcome = parsePassportOutcomeMessage(event, attempt.popup, passportOrigin);
      if (passportOutcome) {
        try {
          // Acknowledge immediately so Passport can close instead of navigating to the callback.
          attempt.popup.postMessage(buildPassportOutcomeAck(passportOutcome.messageId), passportOrigin);
        } catch {
          // Passport falls back to callback navigation; the callback page reports the same outcome.
        }
        handleOutcome(attempt, passportOutcome.outcome);
        return;
      }

      const returnMessage = parsePassportReturnMessage(event, attempt.popup, appOrigin, attempt.id);
      if (returnMessage) handleOutcome(attempt, returnMessage.outcome);
    };

    // Registered before the popup navigates so no outcome can be missed.
    window.addEventListener('message', onMessage);
    const timeoutId = window.setTimeout(() => fail(attempt, 'timeout'), PASSPORT_ATTEMPT_TIMEOUT_MS);
    const popupPollId = window.setInterval(() => {
      if (attempt.popup.closed && !attempt.successRecorded) fail(attempt, 'popup-closed');
    }, PASSPORT_POPUP_CLOSED_POLL_MS);

    let signalsStopped = false;
    attempt.stopAuthorizationSignals = () => {
      if (signalsStopped) return;
      signalsStopped = true;
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timeoutId);
      window.clearInterval(popupPollId);
    };

    try {
      const { authorizationUrl, awaitApproval, cancelAuthFlow } = await AuthController.getPassportAuthUrl({
        xCallback: buildPassportCallbacks(appOrigin, attempt.id),
      });

      if (attempt.phase !== 'authorizing' || !isCurrent(attempt)) {
        // The attempt ended (popup closed, cancelled, timed out) while the URL was being generated.
        cancelAuthFlow();
        awaitApproval.catch(() => undefined);
        return;
      }
      attempt.cancelAuthFlow = cancelAuthFlow;
      attempt.popup.location.replace(buildPassportAuthorizeUrl(passportUrl, authorizationUrl));

      const session = await awaitApproval;
      if (attempt.phase !== 'authorizing' || !isCurrent(attempt)) return;

      // Session accepted: from here on nothing popup-related may fail or time out the attempt.
      attempt.phase = 'initializing';
      attempt.stopAuthorizationSignals();

      try {
        await AuthController.initializeAuthenticatedSession({ session });
      } catch (error) {
        const isWrongEnvironment = isWrongEnvironmentHomeserverError(error);
        if (!isWrongEnvironment && !isAppError(error)) {
          Logger.error('Failed to persist Passport session and check profile:', error);
        }
        toast({
          variant: 'error',
          description: isWrongEnvironment
            ? 'This account is linked to a different homeserver. Use a staging account on this site.'
            : 'Sign in failed. Try again.',
        });
        settle(attempt, 'failed');
        return;
      }
      settle(attempt, 'session');
    } catch (error) {
      if (attempt.phase !== 'authorizing' || !isCurrent(attempt)) return;
      if (isAuthFlowCanceledError(error)) {
        // Superseded by a newer auth flow (for example a Ring request): end quietly.
        settle(attempt, 'failed');
        return;
      }
      // App errors were already logged and captured by their Err.* factory.
      if (!isAppError(error)) Logger.error('Passport authorization failed:', error);
      fail(attempt, 'flow-error');
    } finally {
      attempt.stopAuthorizationSignals();
      try {
        if (!attempt.popup.closed) attempt.popup.close();
      } catch {
        // Closing a cross-origin popup is best effort.
      }
      if (isCurrent(attempt)) {
        activeAttemptRef.current = null;
        if (isMountedRef.current) setIsPending(false);
      }
    }
  };

  const startPassportAuth = () => {
    // Re-entrancy guard: one attempt at a time, including while a session is initializing.
    if (activeAttemptRef.current) return;

    const passportUrl = getPassportUrl();
    if (!passportUrl) {
      toast({ variant: 'error', description: 'Sign in with Google is not available right now.' });
      return;
    }

    // Abandoned browser-generated keys must never survive into a Passport identity.
    useOnboardingStore.getState().reset();

    const attemptId = crypto.randomUUID();
    // Opened synchronously from the click; awaiting first would trigger popup blocking.
    const popup = window.open('about:blank', `${PASSPORT_POPUP_NAME_PREFIX}${attemptId}`, PASSPORT_POPUP_FEATURES);
    if (!popup) {
      toast({ variant: 'error', description: FAILURE_TOAST_COPY['popup-blocked'] });
      onAttemptSettledRef.current?.({ attemptId, result: 'failed' });
      return;
    }

    const attempt: PassportAttempt = {
      id: attemptId,
      popup,
      phase: 'authorizing',
      successRecorded: false,
      cancelAuthFlow: null,
      stopAuthorizationSignals: () => undefined,
    };
    activeAttemptRef.current = attempt;
    setIsPending(true);

    void runAttempt(attempt, passportUrl);
  };

  return { startPassportAuth, isPending };
}
