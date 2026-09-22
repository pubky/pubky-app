import type { Session } from '@synonymdev/pubky';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PASSPORT_ACK_MESSAGE_TYPE,
  PASSPORT_ATTEMPT_TIMEOUT_MS,
  PASSPORT_MESSAGE_VERSION,
  PASSPORT_OUTCOME_MESSAGE_TYPE,
  PASSPORT_POPUP_CLOSED_CONFIRMATIONS,
  PASSPORT_POPUP_CLOSED_POLL_MS,
  PASSPORT_RETURN_MESSAGE_TYPE,
} from '@/config/passport';
import { AppError } from '@/libs/error/error';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { toast } from '@/molecules/Toaster/toast';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { onboardingInitialState } from '@/stores/onboarding/onboarding.types';
import { mockSession } from '@/test-utils/pubky';
import { asOpaque } from '@/test-utils/type-assertions';
import { usePassportAuth } from './usePassportAuth';
import type { PassportAttemptSettledEvent } from './usePassportAuth.types';

const PASSPORT_URL = 'https://passport.example.com';
const PASSPORT_ORIGIN = 'https://passport.example.com';

const mockGetPassportAuthUrl = vi.fn();
const mockInitializeAuthenticatedSession = vi.fn();
const mockLoggerError = vi.fn();
const mockGetPassportUrl = vi.fn();

vi.mock('@/molecules/Toaster/toast');
vi.mock('@/config/network', () => ({
  getPassportUrl: () => mockGetPassportUrl(),
}));
vi.mock('@/controllers/auth/auth', () => ({
  AuthController: {
    getPassportAuthUrl: (...args: unknown[]) => mockGetPassportAuthUrl(...args),
    initializeAuthenticatedSession: (...args: unknown[]) => mockInitializeAuthenticatedSession(...args),
  },
}));
vi.mock('@/libs/logger/logger', async () => {
  const actual = await vi.importActual<typeof import('@/libs/logger/logger')>('@/libs/logger/logger');
  return {
    ...actual,
    Logger: { ...actual.Logger, error: (...args: unknown[]) => mockLoggerError(...args) },
  };
});

type FakePopup = {
  closed: boolean;
  location: { replace: ReturnType<typeof vi.fn> };
  postMessage: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

function createFakePopup(): FakePopup {
  const popup: FakePopup = {
    closed: false,
    location: { replace: vi.fn() },
    postMessage: vi.fn(),
    close: vi.fn(() => {
      popup.closed = true;
    }),
  };
  return popup;
}

type MessageListener = (event: MessageEvent<unknown>) => void;

function captureMessageListeners(): MessageListener[] {
  const listeners: MessageListener[] = [];
  vi.spyOn(window, 'addEventListener').mockImplementation((type, listener) => {
    if (type === 'message' && typeof listener === 'function') listeners.push(listener as MessageListener);
  });
  vi.spyOn(window, 'removeEventListener').mockImplementation((type, listener) => {
    if (type !== 'message') return;
    const index = listeners.indexOf(listener as MessageListener);
    if (index >= 0) listeners.splice(index, 1);
  });
  return listeners;
}

function deliver(listeners: MessageListener[], event: { origin: string; source: unknown; data: unknown }) {
  for (const listener of [...listeners]) listener(asOpaque<MessageEvent<unknown>>(event));
}

function passportOutcome(outcome: string, messageId = 'msg-1', version: number = PASSPORT_MESSAGE_VERSION) {
  return { type: PASSPORT_OUTCOME_MESSAGE_TYPE, version, outcome, messageId };
}

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function canceledError() {
  const error = new Error('Auth flow canceled');
  error.name = 'AuthFlowCanceled';
  return error;
}

/** Mirrors `createCancelableAuthApproval`: cancelling rejects the pending approval with the canceled error. */
function createFlow(authorizationUrl = 'pubkyauth:///?caps=/pub/pubky.app/:rw&secret=s&relay=https://r/inbox') {
  const approval = deferred<Session>();
  const cancelAuthFlow = vi.fn(() => approval.reject(canceledError()));
  return { authorizationUrl, awaitApproval: approval.promise, cancelAuthFlow, approval };
}

const flushMicrotasks = () => act(async () => {});

async function startAttempt(hook: ReturnType<typeof renderHook<ReturnType<typeof usePassportAuth>, unknown>>) {
  act(() => {
    hook.result.current.startPassportAuth();
  });
  await flushMicrotasks();
}

describe('usePassportAuth', () => {
  let popup: FakePopup;
  let listeners: MessageListener[];
  let openSpy: ReturnType<typeof vi.spyOn>;
  const attemptIds: string[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    attemptIds.length = 0;
    mockGetPassportUrl.mockReturnValue(PASSPORT_URL);
    mockInitializeAuthenticatedSession.mockResolvedValue(undefined);
    popup = createFakePopup();
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => asOpaque<Window>(popup));
    listeners = captureMessageListeners();
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      const id = `00000000-0000-4000-8000-${String(attemptIds.length + 1).padStart(12, '0')}`;
      attemptIds.push(id);
      return id;
    });
    useOnboardingStore.getState().reset();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens the popup synchronously, resets onboarding secrets, then navigates it to Passport', async () => {
    useOnboardingStore.setState({ secretKey: 'abandoned-secret', mnemonic: 'abandoned words', inviteCode: 'CODE' });
    const flow = createFlow();
    mockGetPassportAuthUrl.mockResolvedValue(flow);

    const hook = renderHook(() => usePassportAuth());
    act(() => {
      hook.result.current.startPassportAuth();
    });

    // Popup opened before any await; secrets from an abandoned browser-key sign-up are gone.
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith(
      'about:blank',
      `pubky-passport-${attemptIds[0]}`,
      expect.stringContaining('popup'),
    );
    expect(useOnboardingStore.getState().secretKey).toBe(onboardingInitialState.secretKey);
    expect(useOnboardingStore.getState().mnemonic).toBe(onboardingInitialState.mnemonic);
    expect(useOnboardingStore.getState().inviteCode).toBe(onboardingInitialState.inviteCode);

    await flushMicrotasks();
    expect(hook.result.current.isPending).toBe(true);

    const params = mockGetPassportAuthUrl.mock.calls[0]?.[0] as { xCallback: Record<string, string> };
    expect(params.xCallback.xSource).toBe('Pubky');
    expect(new URL(params.xCallback.xSuccess).searchParams.get('attempt')).toBe(attemptIds[0]);
    expect(popup.location.replace).toHaveBeenCalledWith(
      `${PASSPORT_ORIGIN}/authorize#d=${encodeURIComponent(flow.authorizationUrl)}`,
    );
    // Listener registered before the popup navigated.
    expect(listeners).toHaveLength(1);
  });

  it('settles popup-blocked without starting a flow or touching onboarding state when the popup is blocked', async () => {
    openSpy.mockImplementation(() => null);
    useOnboardingStore.setState({ secretKey: 'still-mine' });
    const onAttemptSettled = vi.fn();
    const hook = renderHook(() => usePassportAuth({ onAttemptSettled }));

    await startAttempt(hook);

    expect(mockGetPassportAuthUrl).not.toHaveBeenCalled();
    expect(useOnboardingStore.getState().secretKey).toBe('still-mine');
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Allow pop-ups for this site to continue with Google.',
    });
    // Distinct from `failed`: nothing was cancelled, so callers must not regenerate a Ring request.
    expect(onAttemptSettled).toHaveBeenCalledWith({ attemptId: attemptIds[0], result: 'popup-blocked' });
    expect(hook.result.current.isPending).toBe(false);
  });

  it.each([
    ['cancel', 'Google sign-in was cancelled.'],
    ['error', 'Passport could not complete the sign-in. Try again.'],
  ])('ends the attempt on a %s outcome from Passport and acknowledges the message', async (outcome, copy) => {
    const flow = createFlow();
    mockGetPassportAuthUrl.mockResolvedValue(flow);
    const onAttemptSettled = vi.fn();
    const hook = renderHook(() => usePassportAuth({ onAttemptSettled }));
    await startAttempt(hook);

    await act(async () => {
      deliver(listeners, { origin: PASSPORT_ORIGIN, source: popup, data: passportOutcome(outcome, 'msg-7') });
    });

    expect(popup.postMessage).toHaveBeenCalledWith(
      { type: PASSPORT_ACK_MESSAGE_TYPE, version: PASSPORT_MESSAGE_VERSION, messageId: 'msg-7' },
      PASSPORT_ORIGIN,
    );
    expect(flow.cancelAuthFlow).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast)).toHaveBeenCalledWith({ variant: 'error', description: copy });
    expect(onAttemptSettled).toHaveBeenCalledTimes(1);
    expect(onAttemptSettled).toHaveBeenCalledWith({ attemptId: attemptIds[0], result: 'failed' });
    expect(hook.result.current.isPending).toBe(false);
    expect(mockInitializeAuthenticatedSession).not.toHaveBeenCalled();
    expect(popup.close).toHaveBeenCalled();
  });

  it('fails when the popup stays closed for consecutive polls without a recorded success', async () => {
    const flow = createFlow();
    mockGetPassportAuthUrl.mockResolvedValue(flow);
    const onAttemptSettled = vi.fn();
    const hook = renderHook(() => usePassportAuth({ onAttemptSettled }));
    await startAttempt(hook);

    popup.closed = true;
    // One observation is not enough: a callback-page message may still be in flight.
    await act(async () => {
      vi.advanceTimersByTime(PASSPORT_POPUP_CLOSED_POLL_MS);
    });
    expect(onAttemptSettled).not.toHaveBeenCalled();
    expect(flow.cancelAuthFlow).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(PASSPORT_POPUP_CLOSED_POLL_MS * (PASSPORT_POPUP_CLOSED_CONFIRMATIONS - 1));
    });

    expect(flow.cancelAuthFlow).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'The Passport window was closed before sign-in finished.',
    });
    expect(onAttemptSettled).toHaveBeenCalledWith({ attemptId: attemptIds[0], result: 'failed' });
    expect(hook.result.current.isPending).toBe(false);
  });

  it('tolerates a callback-page success that lands between the close and the poll', async () => {
    const flow = createFlow();
    mockGetPassportAuthUrl.mockResolvedValue(flow);
    const onAttemptSettled = vi.fn();
    const hook = renderHook(() => usePassportAuth({ onAttemptSettled }));
    await startAttempt(hook);

    // The static callback page: `popup.closed` is observable before its posted message runs.
    popup.closed = true;
    await act(async () => {
      vi.advanceTimersByTime(PASSPORT_POPUP_CLOSED_POLL_MS);
      deliver(listeners, {
        origin: window.location.origin,
        source: popup,
        data: { type: PASSPORT_RETURN_MESSAGE_TYPE, attemptId: attemptIds[0], outcome: 'success' },
      });
      vi.advanceTimersByTime(PASSPORT_POPUP_CLOSED_POLL_MS * 3);
    });

    expect(vi.mocked(toast)).not.toHaveBeenCalled();
    expect(onAttemptSettled).not.toHaveBeenCalled();
    expect(flow.cancelAuthFlow).not.toHaveBeenCalled();
    expect(hook.result.current.isPending).toBe(true);

    const session = mockSession();
    await act(async () => {
      flow.approval.resolve(session);
    });

    expect(mockInitializeAuthenticatedSession).toHaveBeenCalledWith({ session });
    expect(onAttemptSettled).toHaveBeenCalledTimes(1);
    expect(onAttemptSettled).toHaveBeenCalledWith({ attemptId: attemptIds[0], result: 'session' });
  });

  it('still fails the attempt when acknowledging a Passport outcome throws', async () => {
    const flow = createFlow();
    mockGetPassportAuthUrl.mockResolvedValue(flow);
    popup.postMessage.mockImplementationOnce(() => {
      throw new Error('opener detached');
    });
    const onAttemptSettled = vi.fn();
    const hook = renderHook(() => usePassportAuth({ onAttemptSettled }));
    await startAttempt(hook);

    await act(async () => {
      deliver(listeners, { origin: PASSPORT_ORIGIN, source: popup, data: passportOutcome('cancel') });
    });

    expect(popup.postMessage).toHaveBeenCalledTimes(1);
    expect(flow.cancelAuthFlow).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast)).toHaveBeenCalledWith({ variant: 'error', description: 'Google sign-in was cancelled.' });
    expect(onAttemptSettled).toHaveBeenCalledWith({ attemptId: attemptIds[0], result: 'failed' });
  });

  it('keeps waiting after a success outcome even when the popup closes, then signs in', async () => {
    const flow = createFlow();
    mockGetPassportAuthUrl.mockResolvedValue(flow);
    const onAttemptSettled = vi.fn();
    const hook = renderHook(() => usePassportAuth({ onAttemptSettled }));
    await startAttempt(hook);

    await act(async () => {
      deliver(listeners, { origin: PASSPORT_ORIGIN, source: popup, data: passportOutcome('success') });
    });
    popup.closed = true;
    await act(async () => {
      vi.advanceTimersByTime(PASSPORT_POPUP_CLOSED_POLL_MS * 3);
    });

    // Still authorizing: no failure, no toast.
    expect(flow.cancelAuthFlow).not.toHaveBeenCalled();
    expect(vi.mocked(toast)).not.toHaveBeenCalled();
    expect(hook.result.current.isPending).toBe(true);

    const session = mockSession();
    await act(async () => {
      flow.approval.resolve(session);
    });

    expect(mockInitializeAuthenticatedSession).toHaveBeenCalledWith({ session });
    expect(onAttemptSettled).toHaveBeenCalledTimes(1);
    expect(onAttemptSettled).toHaveBeenCalledWith({ attemptId: attemptIds[0], result: 'session' });
    expect(hook.result.current.isPending).toBe(false);
  });

  it('accepts the same-origin callback page message for the current attempt', async () => {
    const flow = createFlow();
    mockGetPassportAuthUrl.mockResolvedValue(flow);
    const onAttemptSettled = vi.fn();
    const hook = renderHook(() => usePassportAuth({ onAttemptSettled }));
    await startAttempt(hook);

    await act(async () => {
      deliver(listeners, {
        origin: window.location.origin,
        source: popup,
        data: { type: PASSPORT_RETURN_MESSAGE_TYPE, attemptId: attemptIds[0], outcome: 'cancel' },
      });
    });

    expect(popup.postMessage).not.toHaveBeenCalled();
    expect(flow.cancelAuthFlow).toHaveBeenCalledTimes(1);
    expect(onAttemptSettled).toHaveBeenCalledWith({ attemptId: attemptIds[0], result: 'failed' });
  });

  it('ignores messages with the wrong origin, source, attempt id or version', async () => {
    const flow = createFlow();
    mockGetPassportAuthUrl.mockResolvedValue(flow);
    const onAttemptSettled = vi.fn();
    const hook = renderHook(() => usePassportAuth({ onAttemptSettled }));
    await startAttempt(hook);

    await act(async () => {
      deliver(listeners, { origin: 'https://evil.example.com', source: popup, data: passportOutcome('cancel') });
      deliver(listeners, { origin: PASSPORT_ORIGIN, source: { other: true }, data: passportOutcome('cancel') });
      deliver(listeners, { origin: PASSPORT_ORIGIN, source: popup, data: passportOutcome('cancel', 'msg', 2) });
      deliver(listeners, {
        origin: window.location.origin,
        source: popup,
        data: { type: PASSPORT_RETURN_MESSAGE_TYPE, attemptId: 'someone-elses-attempt', outcome: 'cancel' },
      });
      deliver(listeners, {
        origin: window.location.origin,
        source: { other: true },
        data: { type: PASSPORT_RETURN_MESSAGE_TYPE, attemptId: attemptIds[0], outcome: 'cancel' },
      });
    });

    expect(flow.cancelAuthFlow).not.toHaveBeenCalled();
    expect(popup.postMessage).not.toHaveBeenCalled();
    expect(onAttemptSettled).not.toHaveBeenCalled();
    expect(hook.result.current.isPending).toBe(true);
  });

  it('times out on the wall clock when the relay never answers, and ignores a late session', async () => {
    const flow = createFlow();
    mockGetPassportAuthUrl.mockResolvedValue(flow);
    const onAttemptSettled = vi.fn();
    const hook = renderHook(() => usePassportAuth({ onAttemptSettled }));
    await startAttempt(hook);

    await act(async () => {
      vi.advanceTimersByTime(PASSPORT_ATTEMPT_TIMEOUT_MS);
    });

    expect(flow.cancelAuthFlow).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Google sign-in timed out. Try again.',
    });
    expect(onAttemptSettled).toHaveBeenCalledWith({ attemptId: attemptIds[0], result: 'failed' });
    expect(hook.result.current.isPending).toBe(false);

    // A session that shows up afterwards belongs to a discarded attempt.
    await act(async () => {
      flow.approval.resolve(mockSession());
    });
    expect(mockInitializeAuthenticatedSession).not.toHaveBeenCalled();
    expect(onAttemptSettled).toHaveBeenCalledTimes(1);
  });

  it('times out after a success outcome when no session arrives before the deadline', async () => {
    const flow = createFlow();
    mockGetPassportAuthUrl.mockResolvedValue(flow);
    const onAttemptSettled = vi.fn();
    const hook = renderHook(() => usePassportAuth({ onAttemptSettled }));
    await startAttempt(hook);

    await act(async () => {
      deliver(listeners, { origin: PASSPORT_ORIGIN, source: popup, data: passportOutcome('success') });
      vi.advanceTimersByTime(PASSPORT_ATTEMPT_TIMEOUT_MS);
    });

    expect(onAttemptSettled).toHaveBeenCalledWith({ attemptId: attemptIds[0], result: 'failed' });
    expect(mockInitializeAuthenticatedSession).not.toHaveBeenCalled();
  });

  it('clears the timeout once the session is accepted so slow initialization cannot fail the attempt', async () => {
    const flow = createFlow();
    mockGetPassportAuthUrl.mockResolvedValue(flow);
    const initialization = deferred<void>();
    mockInitializeAuthenticatedSession.mockReturnValue(initialization.promise);
    const onAttemptSettled = vi.fn();
    const hook = renderHook(() => usePassportAuth({ onAttemptSettled }));
    await startAttempt(hook);

    // Session lands one millisecond before the deadline.
    await act(async () => {
      vi.advanceTimersByTime(PASSPORT_ATTEMPT_TIMEOUT_MS - 1);
      flow.approval.resolve(mockSession());
    });
    expect(mockInitializeAuthenticatedSession).toHaveBeenCalledTimes(1);
    // The message listener stays up during initialization so a late Passport `success` is acked
    // (otherwise Passport would navigate the popup to the callback page).
    expect(listeners).toHaveLength(1);

    // Deadline passes while initialization is still running; a late success is acked, a late
    // cancel or closure cannot fail the attempt any more.
    await act(async () => {
      vi.advanceTimersByTime(PASSPORT_POPUP_CLOSED_POLL_MS * 10);
      deliver(listeners, { origin: PASSPORT_ORIGIN, source: popup, data: passportOutcome('success', 'late-ok') });
      popup.closed = true;
      deliver(listeners, { origin: PASSPORT_ORIGIN, source: popup, data: passportOutcome('cancel', 'late-cancel') });
      vi.advanceTimersByTime(PASSPORT_POPUP_CLOSED_POLL_MS * 3);
    });
    expect(popup.postMessage).toHaveBeenCalledWith(
      { type: PASSPORT_ACK_MESSAGE_TYPE, version: PASSPORT_MESSAGE_VERSION, messageId: 'late-ok' },
      PASSPORT_ORIGIN,
    );
    expect(vi.mocked(toast)).not.toHaveBeenCalled();
    expect(onAttemptSettled).not.toHaveBeenCalled();
    expect(hook.result.current.isPending).toBe(true);

    // No second attempt can start meanwhile.
    act(() => {
      hook.result.current.startPassportAuth();
    });
    expect(openSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      initialization.resolve();
    });
    expect(onAttemptSettled).toHaveBeenCalledTimes(1);
    expect(onAttemptSettled).toHaveBeenCalledWith({ attemptId: attemptIds[0], result: 'session' });
    expect(flow.cancelAuthFlow).not.toHaveBeenCalled();
    expect(hook.result.current.isPending).toBe(false);
  });

  it('settles failed when initialization throws, with the environment-specific copy', async () => {
    const flow = createFlow();
    mockGetPassportAuthUrl.mockResolvedValue(flow);
    mockInitializeAuthenticatedSession.mockRejectedValue(
      new AppError({
        category: ErrorCategory.Auth,
        code: AuthErrorCode.WRONG_ENVIRONMENT_HOMESERVER,
        message: 'wrong env',
        service: ErrorService.Homeserver,
        operation: 'assertUserHomeserverAllowed',
      }),
    );
    const onAttemptSettled = vi.fn();
    const hook = renderHook(() => usePassportAuth({ onAttemptSettled }));
    await startAttempt(hook);

    await act(async () => {
      flow.approval.resolve(mockSession());
    });

    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'This account is linked to a different homeserver. Use a staging account on this site.',
    });
    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(onAttemptSettled).toHaveBeenCalledWith({ attemptId: attemptIds[0], result: 'failed' });
    expect(hook.result.current.isPending).toBe(false);
  });

  it('ignores a double click while an attempt is pending and allows a retry after it fails', async () => {
    const first = createFlow();
    const second = createFlow('pubkyauth:///?second');
    mockGetPassportAuthUrl.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const onAttemptSettled = vi.fn();
    const hook = renderHook(() => usePassportAuth({ onAttemptSettled }));

    act(() => {
      hook.result.current.startPassportAuth();
      hook.result.current.startPassportAuth();
    });
    await flushMicrotasks();

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(mockGetPassportAuthUrl).toHaveBeenCalledTimes(1);

    await act(async () => {
      deliver(listeners, { origin: PASSPORT_ORIGIN, source: popup, data: passportOutcome('cancel') });
    });
    expect(onAttemptSettled).toHaveBeenCalledWith({ attemptId: attemptIds[0], result: 'failed' });

    const retryPopup = createFakePopup();
    openSpy.mockImplementation(() => asOpaque<Window>(retryPopup));
    await startAttempt(hook);

    expect(openSpy).toHaveBeenCalledTimes(2);
    expect(mockGetPassportAuthUrl).toHaveBeenCalledTimes(2);
    expect(retryPopup.location.replace).toHaveBeenCalledWith(expect.stringContaining(encodeURIComponent('?second')));
    expect(hook.result.current.isPending).toBe(true);
  });

  it('cancels a flow whose URL arrives after the attempt already failed', async () => {
    const pendingUrl = deferred<ReturnType<typeof createFlow>>();
    mockGetPassportAuthUrl.mockReturnValue(pendingUrl.promise);
    const onAttemptSettled = vi.fn();
    const hook = renderHook(() => usePassportAuth({ onAttemptSettled }));
    await startAttempt(hook);

    popup.closed = true;
    await act(async () => {
      vi.advanceTimersByTime(PASSPORT_POPUP_CLOSED_POLL_MS * PASSPORT_POPUP_CLOSED_CONFIRMATIONS);
    });
    expect(onAttemptSettled).toHaveBeenCalledWith({ attemptId: attemptIds[0], result: 'failed' });

    const late = createFlow();
    await act(async () => {
      pendingUrl.resolve(late);
    });
    expect(late.cancelAuthFlow).toHaveBeenCalledTimes(1);
    expect(popup.location.replace).not.toHaveBeenCalled();
    expect(onAttemptSettled).toHaveBeenCalledTimes(1);
  });

  it('settles superseded (not failed) when a newer auth flow cancels it, e.g. a recovery-phrase sign-in', async () => {
    const flow = createFlow();
    mockGetPassportAuthUrl.mockResolvedValue(flow);
    const onAttemptSettled = vi.fn<(event: PassportAttemptSettledEvent) => void>();
    const hook = renderHook(() => usePassportAuth({ onAttemptSettled }));
    await startAttempt(hook);

    // `completeAuthenticatedSession` for the other flow calls `cancelActiveAuthFlow()`, which
    // rejects this attempt's approval with the canceled sentinel.
    await act(async () => {
      flow.approval.reject(canceledError());
    });

    expect(vi.mocked(toast)).not.toHaveBeenCalled();
    expect(onAttemptSettled).toHaveBeenCalledTimes(1);
    expect(onAttemptSettled).toHaveBeenCalledWith({ attemptId: attemptIds[0], result: 'superseded' });
    expect(mockInitializeAuthenticatedSession).not.toHaveBeenCalled();
    expect(hook.result.current.isPending).toBe(false);
  });

  it('shows a generic failure when URL generation rejects with a non-app error', async () => {
    mockGetPassportAuthUrl.mockRejectedValue(new Error('boom'));
    const onAttemptSettled = vi.fn();
    const hook = renderHook(() => usePassportAuth({ onAttemptSettled }));
    await startAttempt(hook);

    expect(mockLoggerError).toHaveBeenCalled();
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Sign in with Google failed. Try again.',
    });
    expect(onAttemptSettled).toHaveBeenCalledWith({ attemptId: attemptIds[0], result: 'failed' });
    expect(popup.close).toHaveBeenCalled();
  });

  it('does nothing but toast when no Passport origin is configured', async () => {
    mockGetPassportUrl.mockReturnValue(undefined);
    const hook = renderHook(() => usePassportAuth());

    await startAttempt(hook);

    expect(openSpy).not.toHaveBeenCalled();
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Sign in with Google is not available right now.',
    });
  });
});
