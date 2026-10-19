import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocksController } from '@/controllers/locks/locks';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { LockFile, TUnlockedContent, TVerificationStatus, TVerificationTask } from '@/services/locks/locks.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { CONNECTION_POLL_INTERVAL_MS, POLL_INTERVAL_MS, STALL_AFTER_MS, usePayToUnlock } from './usePayToUnlock';
import type { TPayToUnlockStage } from './usePayToUnlock.types';

vi.mock('@/controllers/locks/locks', () => ({
  LocksController: {
    fetchResolvedPurchase: vi.fn(),
    startPayment: vi.fn(),
    // Default so every test that does not care about the link still returns a settled one.
    fetchPaykitConnectionState: vi.fn(async () => 'connected'),
    // Defaults so a test that does not arrange the wait still gets a settled poll.
    fetchPaymentStatus: vi.fn(async () => ({ status: 'pending', walletSetupNeeded: false, admissionDeadlineAt: null })),
    fetchPaidContent: vi.fn(),
    hasPaykitReceiver: vi.fn(),
  },
}));

const authState = vi.hoisted(() => ({
  currentUserPubky: 'reader1' as string | null,
  session: {} as object | null,
  restoreStatus: 'ready',
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: Object.assign((selector: (s: typeof authState) => unknown) => selector(authState), {
    getState: () => authState,
  }),
}));

const toastMock = vi.hoisted(() => vi.fn());
vi.mock('@/molecules/Toaster/toast', () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

const lockFile = asOpaque<LockFile>({
  creator: 'pubkybob',
  criteria: [
    { criterion_id: 'criterion-1', verifier_type: 'paykit-payment', params: { amount: '1000', asset: 'BTC' } },
  ],
});
const LOCK_URL = 'pubky://pubkybob/pub/app.locks/LOCK1.json';

const unlockedContent = asOpaque<TUnlockedContent>({
  post: { content: 'paid', kind: 'short', attachments: null },
  attachments: [],
});

const onPurchased = vi.fn();
const onSessionExpired = vi.fn();
const renderPay = (onCompleted = vi.fn()) => ({
  onCompleted,
  ...renderHook(() =>
    usePayToUnlock({ open: true, lockUrl: LOCK_URL, lockFile, onCompleted, onPurchased, onSessionExpired }),
  ),
});
const renderPayWith = (initialProps: { open: boolean }, onCompleted = vi.fn()) => ({
  onCompleted,
  ...renderHook(
    (props: { open: boolean }) =>
      usePayToUnlock({ ...props, lockUrl: LOCK_URL, lockFile, onCompleted, onPurchased, onSessionExpired }),
    { initialProps },
  ),
});

const SESSION_EXPIRED_TOAST = { variant: 'error', description: 'Session expired. Please sign in.' };
const authError = (code: AuthErrorCode) =>
  Err.auth(code, 'Authentication required to read private storage', {
    service: ErrorService.Homeserver,
    operation: 'getBytesIfExists',
  });

const statusCalls = () => vi.mocked(LocksController.fetchPaymentStatus).mock.calls.length;
const connectionCalls = () => vi.mocked(LocksController.fetchPaykitConnectionState).mock.calls.length;

type TSubmitted = Awaited<ReturnType<typeof LocksController.startPayment>>;
const submitted = (bundleId: string, status: TVerificationStatus = 'pending'): TSubmitted => ({ bundleId, status });
const task = (status: TVerificationStatus, fields: Partial<TVerificationTask> = {}): TVerificationTask => ({
  status,
  walletSetupNeeded: false,
  admissionDeadlineAt: null,
  ...fields,
});
const PAYMENT_PARAMS = { lockFile, lockUrl: LOCK_URL, readerPubky: 'reader1' };
const AUTO_PARAMS = { ...PAYMENT_PARAMS, isRetry: false };
const RETRY_PARAMS = { ...PAYMENT_PARAMS, isRetry: true };

type TResolved = Awaited<ReturnType<typeof LocksController.fetchResolvedPurchase>>;
const reusable = (bundleId: string, task: TVerificationTask | null): TResolved => ({
  kind: 'reusable',
  bundleId,
  task,
});
const terminal = (bundleId: string, status: 'failed' | 'expired'): TResolved => ({
  kind: 'terminal',
  bundleId,
  status,
});
/**
 * `fetchResolvedPurchase` looks the saved id up on the server. Routing the stub through `fetchPaymentStatus`
 * keeps that open-time lookup countable and holdable where the tests reason about lookups.
 */
const resolveThroughLookup = (bundleId: string) => async (): Promise<TResolved> => {
  const found = await LocksController.fetchPaymentStatus({ lockFile, bundleId });
  if (found?.status === 'failed' || found?.status === 'expired') return terminal(bundleId, found.status);
  return reusable(bundleId, found);
};

describe('usePayToUnlock (opening)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUserPubky = 'reader1';
    authState.session = {};
    authState.restoreStatus = 'ready';
    vi.mocked(LocksController.fetchPaidContent).mockResolvedValue(unlockedContent);
    vi.mocked(LocksController.startPayment).mockResolvedValue(submitted('fresh-1'));
    vi.mocked(LocksController.fetchPaykitConnectionState).mockResolvedValue('connected');
  });

  it('submits automatically when nothing is stored and the wallet has a receiver', async () => {
    vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(null);
    vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValue(true);

    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('waiting'));
    expect(LocksController.startPayment).toHaveBeenCalledWith(AUTO_PARAMS);
  });

  it('shows the install steps when nothing is stored and there is no receiver', async () => {
    vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(null);
    vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValue(false);

    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('install'));
    expect(LocksController.startPayment).not.toHaveBeenCalled();
  });

  // No task behind the saved id means the first submission never landed, so it goes out again.
  it('submits the saved bundle id again when the server has no task for it', async () => {
    vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(reusable('stored-1', null));

    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('waiting'));
    expect(LocksController.startPayment).toHaveBeenCalledWith(AUTO_PARAMS);
    expect(LocksController.hasPaykitReceiver).not.toHaveBeenCalled(); // a purchase exists; the gate is moot
  });

  // A running task needs nothing submitted: the connection state has its own lookup now.
  it.each(['pending', 'in_progress'] as const)(
    'resumes a saved bundle id without submitting when its task reports %s',
    async (status) => {
      vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(reusable('stored-1', task(status)));

      const { result } = renderPay();
      await waitFor(() => expect(result.current.stage).toBe('waiting'));
      expect(LocksController.startPayment).not.toHaveBeenCalled();
      expect(LocksController.fetchPaykitConnectionState).toHaveBeenCalledWith({ lockFile, bundleId: 'stored-1' });
    },
  );

  it('shows the paid confirmation without replaying a saved bundle id that already completed', async () => {
    vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(reusable('stored-1', task('completed')));

    const { result, onCompleted } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('paid'));
    expect(LocksController.fetchPaidContent).toHaveBeenCalledWith({ lockFile, bundleId: 'stored-1' });
    expect(onCompleted).not.toHaveBeenCalled();

    act(() => result.current.viewContent());
    act(() => result.current.viewContent());
    expect(onCompleted).toHaveBeenCalledWith(unlockedContent);
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(LocksController.startPayment).not.toHaveBeenCalled();
  });

  it.each([
    ['none', 'pubkybob'],
    ['handshake', 'pubkybob'],
    ['connected', null],
    ['recovery_required', 'pubkybob'],
    ['blocked', null],
  ] as const)('connection state %s: QR %s', async (connectionState, qr) => {
    vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(reusable('stored-1', task('pending')));
    vi.mocked(LocksController.fetchPaykitConnectionState).mockResolvedValue(connectionState);

    const { result } = renderPay();
    await waitFor(() => expect(connectionCalls()).toBeGreaterThan(0));
    await waitFor(() => expect(result.current.connectionState).toBe(connectionState));
    expect(result.current.handshakePubky).toBe(qr);
  });

  // The session rehydrates after `currentUserPubky`; reading storage without it silently reports
  // "no purchase", which would fail OPEN — so the hook stays on checking until it lands.
  it('stays on checking while the session is still restoring', async () => {
    authState.session = null;
    vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(null);
    vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValue(true);

    const { result } = renderPay();
    await act(async () => {});
    expect(result.current.stage).toBe('checking');
    expect(LocksController.startPayment).not.toHaveBeenCalled();
    expect(LocksController.fetchResolvedPurchase).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  // Fail closed: the file may exist but be unreadable — minting a fresh id could pay twice.
  it('blocks paying when the saved bundle id cannot be read', async () => {
    vi.mocked(LocksController.fetchResolvedPurchase).mockRejectedValue(new Error('unreadable'));

    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('blocked'));
    expect(LocksController.startPayment).not.toHaveBeenCalled();
  });

  // Every later step needs the same session, so the reader is sent to sign in instead of the blocked screen.
  it.each([AuthErrorCode.SESSION_EXPIRED, AuthErrorCode.UNAUTHORIZED])(
    'asks the reader to sign in when the saved bundle id read fails with %s',
    async (code) => {
      vi.mocked(LocksController.fetchResolvedPurchase).mockRejectedValue(authError(code));

      const { result } = renderPay();
      await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
      expect(toastMock).toHaveBeenCalledWith(SESSION_EXPIRED_TOAST);
      expect(result.current.stage).toBe('checking');
      expect(LocksController.startPayment).not.toHaveBeenCalled();
    },
  );

  // Usually the app clears the session on the 401 before the read rejects, which retires this opening.
  it('asks the reader to sign in once when the app clears the session before the read rejects', async () => {
    let reject: (error: unknown) => void = () => {};
    vi.mocked(LocksController.fetchResolvedPurchase).mockImplementationOnce(
      () =>
        new Promise((_, r) => {
          reject = r;
        }),
    );

    const { rerender } = renderPay();
    await waitFor(() => expect(LocksController.fetchResolvedPurchase).toHaveBeenCalledTimes(1));
    authState.restoreStatus = 'reauth-required';
    authState.session = null;
    rerender();
    await act(async () => reject(authError(AuthErrorCode.SESSION_EXPIRED)));

    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledWith(SESSION_EXPIRED_TOAST);
  });

  // The catch can also run before React renders the cleared session; that order must not toast twice.
  it('asks the reader to sign in once when the read rejects before the cleared session renders', async () => {
    let reject: (error: unknown) => void = () => {};
    vi.mocked(LocksController.fetchResolvedPurchase).mockImplementationOnce(
      () =>
        new Promise((_, r) => {
          reject = r;
        }),
    );

    const { rerender } = renderPay();
    await waitFor(() => expect(LocksController.fetchResolvedPurchase).toHaveBeenCalledTimes(1));
    authState.restoreStatus = 'reauth-required';
    authState.session = null;
    await act(async () => reject(authError(AuthErrorCode.SESSION_EXPIRED)));
    rerender();

    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when the session is rejected while the modal is closed', () => {
    const { rerender } = renderPayWith({ open: false });
    authState.restoreStatus = 'reauth-required';
    authState.session = null;
    rerender({ open: false });

    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });

  // Closing from the paid screen shows the downloaded content, so an expired session must not drop it.
  it('shows the downloaded content when the session is rejected on the paid screen', async () => {
    vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(reusable('stored-1', task('completed')));

    const { result, rerender, onCompleted } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('paid'));
    authState.restoreStatus = 'reauth-required';
    authState.session = null;
    rerender();

    expect(onCompleted).toHaveBeenCalledWith(unlockedContent);
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(SESSION_EXPIRED_TOAST);
  });

  // The wait itself reads only the Lock Server, but a 401 on any other homeserver request still ends the session.
  it('asks the reader to sign in when another request gets the session rejected mid-wait', async () => {
    vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(reusable('stored-1', task('pending')));

    const { result, rerender } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('waiting'));
    authState.restoreStatus = 'reauth-required';
    authState.session = null;
    rerender();

    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledWith(SESSION_EXPIRED_TOAST);
  });

  // The reader may have signed in again and reopened the modal by the time the old read fails.
  it('ignores a session failure that arrives for an earlier opening', async () => {
    let rejectFirst: (error: unknown) => void = () => {};
    vi.mocked(LocksController.fetchResolvedPurchase)
      .mockImplementationOnce(
        () =>
          new Promise((_, r) => {
            rejectFirst = r;
          }),
      )
      .mockResolvedValueOnce(null);
    vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValue(true);

    const { result, rerender } = renderPayWith({ open: true });
    await waitFor(() => expect(LocksController.fetchResolvedPurchase).toHaveBeenCalledTimes(1));
    rerender({ open: false });
    rerender({ open: true });
    await waitFor(() => expect(result.current.stage).toBe('waiting'));

    await act(async () => rejectFirst(authError(AuthErrorCode.SESSION_EXPIRED)));
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('keeps the blocked screen for an auth failure that signing in again would not fix', async () => {
    vi.mocked(LocksController.fetchResolvedPurchase).mockRejectedValue(authError(AuthErrorCode.FORBIDDEN));

    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('blocked'));
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });

  // The lookup stands between the saved id and the automatic replay: an outage there must not
  // reach the submit call, which would pay for a purchase whose state is unknown.
  it('blocks paying when the open-time lookup fails', async () => {
    vi.mocked(LocksController.fetchPaymentStatus).mockRejectedValue(new Error('HTTP 503'));
    vi.mocked(LocksController.fetchResolvedPurchase).mockImplementation(resolveThroughLookup('stored-1'));

    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('blocked'));
    expect(LocksController.startPayment).not.toHaveBeenCalled();
  });

  // The stored id can change while the modal is closed (another tab paid), so a reopen must not
  // trust the stage it closed on.
  it('re-checks on reopen', async () => {
    vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(null);
    vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValue(true);
    vi.mocked(LocksController.fetchPaykitConnectionState).mockResolvedValue('recovery_required');

    const { result, rerender } = renderPayWith({ open: true });
    await waitFor(() => expect(result.current.connectionState).toBe('recovery_required'));

    rerender({ open: false });
    rerender({ open: true });
    expect(result.current.stage).toBe('checking');
    expect(result.current.connectionState).toBeNull();
    expect(result.current.handshakePubky).toBeNull();
    expect(LocksController.fetchResolvedPurchase).toHaveBeenCalledTimes(2);
  });

  // The earlier submission's guard must not leave the reopened modal stuck on checking.
  it('submits again on reopen while the earlier submission is still out', async () => {
    let releaseFirst: (result: TSubmitted) => void = () => {};
    vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(null);
    vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValue(true);
    vi.mocked(LocksController.startPayment)
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            releaseFirst = r;
          }),
      )
      .mockResolvedValueOnce(submitted('fresh-1'));

    vi.mocked(LocksController.fetchPaykitConnectionState).mockResolvedValue('none');

    const { result, rerender } = renderPayWith({ open: true });
    await waitFor(() => expect(LocksController.startPayment).toHaveBeenCalledTimes(1));

    rerender({ open: false });
    rerender({ open: true });
    await waitFor(() => expect(result.current.stage).toBe('waiting'));
    expect(LocksController.startPayment).toHaveBeenCalledTimes(2);
    expect(LocksController.startPayment).toHaveBeenNthCalledWith(2, AUTO_PARAMS);
    await waitFor(() => expect(result.current.handshakePubky).toBe('pubkybob'));

    // The closed opening's late answer changes nothing.
    await act(async () => {
      releaseFirst(submitted('fresh-1'));
    });
    expect(result.current.handshakePubky).toBe('pubkybob');
    expect(result.current.isSubmitting).toBe(false);
  });

  // The earlier submission ended while the reopen waited behind it (rejected in Bitkit): the reopen
  // shows that end and does not start a new payment on its own.
  it('shows the ended status when the queued reopen finds the payment ended', async () => {
    vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(null);
    vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValue(true);
    vi.mocked(LocksController.startPayment)
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce(submitted('fresh-1', 'expired'));

    const { result, rerender } = renderPayWith({ open: true });
    await waitFor(() => expect(LocksController.startPayment).toHaveBeenCalledTimes(1));

    rerender({ open: false });
    rerender({ open: true });
    await waitFor(() => expect(result.current.stage).toBe('expired'));
    expect(LocksController.startPayment).toHaveBeenNthCalledWith(2, AUTO_PARAMS);
    expect(LocksController.fetchPaykitConnectionState).not.toHaveBeenCalled();
  });
});

describe('usePayToUnlock (retry)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUserPubky = 'reader1';
    authState.session = {};
    authState.restoreStatus = 'ready';
    vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValue(true);
    vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(null);
    vi.mocked(LocksController.startPayment).mockResolvedValue(submitted('fresh-1'));
    vi.mocked(LocksController.fetchPaykitConnectionState).mockResolvedValue('connected');
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValue(task('pending'));
  });

  it('starts the payment on open and moves to waiting', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValue(task('pending'));

      const { result } = renderPay();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.stage).toBe('waiting');
      expect(LocksController.startPayment).toHaveBeenCalledWith(AUTO_PARAMS);
      // The submission answered the task, so its loop waits an interval; the link is unknown and the
      // QR waits on it, so that loop reads at once.
      expect(LocksController.fetchPaymentStatus).not.toHaveBeenCalled();
      expect(LocksController.fetchPaykitConnectionState).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      });
      expect(LocksController.fetchPaymentStatus).toHaveBeenCalledTimes(1);
      expect(LocksController.fetchPaymentStatus).toHaveBeenCalledWith({ lockFile, bundleId: 'fresh-1' });
    } finally {
      vi.useRealTimers();
    }
  });

  // failed/expired cannot be retried — the application mints a fresh id, and only when the reader
  // presses again: a dead payment must not re-charge anyone on its own.
  it.each(['failed', 'expired'] as const)('offers Try again when the saved payment ended in %s', async (status) => {
    vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(terminal('dead-1', status));

    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe(status === 'expired' ? 'expired' : 'retry'));
    expect(toastMock).toHaveBeenCalledWith({
      variant: 'error',
      description:
        status === 'expired'
          ? 'The payment was not completed. You can try again.'
          : 'The payment failed. You can try again.',
    });
    expect(LocksController.startPayment).not.toHaveBeenCalled();
    result.current.retry();

    await waitFor(() => expect(LocksController.startPayment).toHaveBeenCalledTimes(1));
    expect(LocksController.startPayment).toHaveBeenCalledWith(RETRY_PARAMS);
    // `expired` comes after an invoice reached the wallet, so only `failed` re-checks it.
    expect(LocksController.hasPaykitReceiver).toHaveBeenCalledTimes(status === 'failed' ? 1 : 0);
  });

  it('shows the generic message when the submission immediately reports an expired request', async () => {
    vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(null);
    vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValue(true);
    vi.mocked(LocksController.startPayment).mockResolvedValue(submitted('ended-1', 'expired'));

    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('expired'));
    expect(toastMock).toHaveBeenCalledWith({
      variant: 'error',
      description: 'The payment was not completed. You can try again.',
    });
    expect(result.current.isSubmitting).toBe(false);
    expect(LocksController.fetchPaykitConnectionState).not.toHaveBeenCalled();
    expect(LocksController.startPayment).toHaveBeenCalledWith(AUTO_PARAMS);

    vi.mocked(LocksController.startPayment).mockResolvedValue(submitted('fresh-2'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.stage).toBe('waiting'));
    expect(LocksController.startPayment).toHaveBeenLastCalledWith(RETRY_PARAMS);
  });

  // A reader without a wallet ends `failed`: another id would fail the same way after the same wait.
  it('moves to the install steps when Try again after failed finds no wallet', async () => {
    vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(terminal('dead-1', 'failed'));
    vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValue(false);

    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('retry'));
    result.current.retry();

    await waitFor(() => expect(result.current.stage).toBe('install'));
    expect(LocksController.startPayment).not.toHaveBeenCalled();
    expect(result.current.isSubmitting).toBe(false);

    vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValue(true);
    result.current.retry();
    await waitFor(() => expect(LocksController.startPayment).toHaveBeenCalledTimes(1));
    expect(LocksController.startPayment).toHaveBeenCalledWith(RETRY_PARAMS);
  });

  it.each([
    [
      'wallet check',
      () => vi.mocked(LocksController.hasPaykitReceiver).mockRejectedValue(new Error('homeserver blip')),
    ],
    ['submission', () => vi.mocked(LocksController.startPayment).mockRejectedValue(new Error('network down'))],
  ])('stays on the retry screen when the %s after a failed payment fails', async (_step, fail) => {
    vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(terminal('dead-1', 'failed'));
    fail();

    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('retry'));
    result.current.retry();

    await waitFor(() => expect(toastMock).toHaveBeenCalledTimes(2));
    expect(result.current.stage).toBe('retry');
  });

  it('offers Try again when the submission fails', async () => {
    vi.mocked(LocksController.startPayment).mockRejectedValue(new Error('network down'));

    const { result } = renderPay();
    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    expect(result.current.stage).toBe('retry');
    expect(result.current.isSubmitting).toBe(false);

    result.current.retry();
    await waitFor(() => expect(LocksController.startPayment).toHaveBeenCalledTimes(2));
    expect(LocksController.startPayment).toHaveBeenLastCalledWith(RETRY_PARAMS);
  });

  describe('install screen', () => {
    const openOnInstall = async () => {
      vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValueOnce(false);
      const rendered = renderPay();
      await waitFor(() => expect(rendered.result.current.stage).toBe('install'));
      return rendered;
    };

    it('shows no QR before the reader has a wallet', async () => {
      const { result } = await openOnInstall();
      expect(result.current.handshakePubky).toBeNull();
      expect(LocksController.fetchPaykitConnectionState).not.toHaveBeenCalled();
    });

    it('re-checks the wallet before submitting and stays on install when there is still none', async () => {
      const { result } = await openOnInstall();
      vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValueOnce(false);

      result.current.retry();
      await waitFor(() => expect(toastMock).toHaveBeenCalledTimes(1));
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'warning',
          description: expect.stringContaining('Bitkit is not set up yet'),
        }),
      );
      expect(LocksController.hasPaykitReceiver).toHaveBeenCalledTimes(2);
      expect(LocksController.startPayment).not.toHaveBeenCalled();
      expect(result.current.stage).toBe('install');
      expect(result.current.isSubmitting).toBe(false);
    });

    it('submits once the wallet shows up and moves to the QR wait', async () => {
      vi.mocked(LocksController.fetchPaykitConnectionState).mockResolvedValue('none');
      const { result } = await openOnInstall();

      result.current.retry();
      await waitFor(() => expect(result.current.stage).toBe('waiting'));
      expect(LocksController.startPayment).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(result.current.handshakePubky).toBe('pubkybob'));
    });

    // A close on the install screen skips the "still running" prompt, so the in-flight submission must
    // not sit there.
    it('leaves install for checking while the submission is in flight', async () => {
      vi.mocked(LocksController.startPayment).mockImplementation(() => new Promise(() => {}));
      const { result } = await openOnInstall();

      result.current.retry();
      await waitFor(() => expect(result.current.stage).toBe('checking'));
      expect(result.current.isSubmitting).toBe(true);
    });

    // Only this screen's button always checks the wallet, so a failure that started here comes back here.
    it('goes back to install when the submission after the re-check fails', async () => {
      vi.mocked(LocksController.startPayment).mockRejectedValue(new Error('network down'));
      const { result } = await openOnInstall();

      result.current.retry();
      await waitFor(() => expect(toastMock).toHaveBeenCalledTimes(1));
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: expect.stringContaining('could not be started') }),
      );
      expect(result.current.stage).toBe('install');
    });

    it('asks the reader to sign in instead of offering Try again when the submission fails for the session', async () => {
      vi.mocked(LocksController.startPayment).mockRejectedValue(authError(AuthErrorCode.SESSION_EXPIRED));
      const { result } = await openOnInstall();

      result.current.retry();
      await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
      expect(toastMock).toHaveBeenCalledTimes(1);
      expect(toastMock).toHaveBeenCalledWith(SESSION_EXPIRED_TOAST);
      expect(result.current.stage).toBe('checking');
      expect(result.current.isSubmitting).toBe(false);
    });

    it('stays on install when the re-check itself fails', async () => {
      const { result } = await openOnInstall();
      vi.mocked(LocksController.hasPaykitReceiver).mockRejectedValueOnce(new Error('homeserver blip'));

      result.current.retry();
      await waitFor(() => expect(toastMock).toHaveBeenCalledTimes(1));
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: expect.stringContaining('could not be started') }),
      );
      expect(result.current.stage).toBe('install');
      expect(LocksController.startPayment).not.toHaveBeenCalled();
    });

    it('submits nothing when the modal closes during the re-check', async () => {
      vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValueOnce(false);
      const { result, rerender } = renderPayWith({ open: true });
      await waitFor(() => expect(result.current.stage).toBe('install'));
      let answer!: (hasWallet: boolean) => void;
      vi.mocked(LocksController.hasPaykitReceiver).mockImplementationOnce(
        () => new Promise((resolve) => (answer = resolve)),
      );

      result.current.retry();
      rerender({ open: false });
      await act(async () => answer(true));
      expect(LocksController.startPayment).not.toHaveBeenCalled();
      expect(result.current.stage).toBe('install');
      expect(result.current.isSubmitting).toBe(false);
    });

    // A check that never settles must not lock the button of the next opening.
    it('unlocks the button on reopen while the earlier re-check is still out', async () => {
      vi.mocked(LocksController.hasPaykitReceiver)
        .mockResolvedValueOnce(false)
        .mockImplementationOnce(() => new Promise(() => {}))
        .mockResolvedValueOnce(false);
      const { result, rerender } = renderPayWith({ open: true });
      await waitFor(() => expect(result.current.stage).toBe('install'));

      act(() => result.current.retry());
      await waitFor(() => expect(result.current.isSubmitting).toBe(true));
      rerender({ open: false });
      rerender({ open: true });

      await waitFor(() => expect(LocksController.hasPaykitReceiver).toHaveBeenCalledTimes(3));
      await waitFor(() => expect(result.current.stage).toBe('install'));
      expect(result.current.isSubmitting).toBe(false);
    });
  });

  // Two clicks in the same tick are the classic shape of a double payment.
  it('ignores a second retry while a submission is in flight', async () => {
    vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(terminal('dead-1', 'failed'));
    vi.mocked(LocksController.startPayment).mockImplementation(() => new Promise(() => {}));

    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('retry'));
    result.current.retry();
    result.current.retry();

    // The wallet check after `failed` comes first, so the submission lands a tick later.
    await waitFor(() => expect(LocksController.startPayment).toHaveBeenCalled());
    expect(LocksController.hasPaykitReceiver).toHaveBeenCalledTimes(1);
    expect(LocksController.startPayment).toHaveBeenCalledTimes(1);
  });

  // The session listing was taken before this purchase existed, so the recovery path needs telling.
  it('announces the purchase so this session can recover it', async () => {
    renderPay();

    await waitFor(() => expect(onPurchased).toHaveBeenCalledWith('LOCK1'));
  });
});

describe('usePayToUnlock (finishing)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUserPubky = 'reader1';
    authState.session = {};
    authState.restoreStatus = 'ready';
    vi.mocked(LocksController.fetchPaykitConnectionState).mockResolvedValue('connected');
    vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(reusable('stored-1', task('completed')));
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValue(task('completed'));
  });

  it.each(['saved purchase', 'submission'] as const)(
    'shows finishing while the %s content downloads',
    async (source) => {
      if (source === 'submission') {
        vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(null);
        vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValue(true);
        vi.mocked(LocksController.startPayment).mockResolvedValue(submitted('stored-1', 'completed'));
      }
      let resolveContent: (content: TUnlockedContent) => void = () => {};
      vi.mocked(LocksController.fetchPaidContent).mockReturnValue(
        new Promise((resolve) => {
          resolveContent = resolve;
        }),
      );
      const { result, onCompleted } = renderPay();

      await waitFor(() => expect(result.current.stage).toBe('finishing'));
      expect(result.current.handshakePubky).toBeNull();
      expect(result.current.isConnectionPending).toBe(false);
      expect(onCompleted).not.toHaveBeenCalled();
      expect(LocksController.fetchPaykitConnectionState).not.toHaveBeenCalled();
      await act(async () => resolveContent(unlockedContent));
      expect(result.current.stage).toBe('paid');
      act(() => result.current.viewContent());
      expect(onCompleted).toHaveBeenCalledExactlyOnceWith(unlockedContent);
    },
  );

  it('ignores a download that finishes after close and resumes the paid purchase on reopen', async () => {
    let resolveContent: (content: TUnlockedContent) => void = () => {};
    vi.mocked(LocksController.fetchPaidContent)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveContent = resolve;
        }),
      )
      .mockResolvedValue(unlockedContent);
    const { result, rerender, onCompleted } = renderPayWith({ open: true });
    await waitFor(() => expect(result.current.stage).toBe('finishing'));

    rerender({ open: false });
    await act(async () => resolveContent(unlockedContent));
    expect(result.current.stage).toBe('finishing');
    expect(onCompleted).not.toHaveBeenCalled();
    rerender({ open: true });
    await waitFor(() => expect(result.current.stage).toBe('paid'));
    expect(LocksController.startPayment).not.toHaveBeenCalled();
    expect(LocksController.fetchPaidContent).toHaveBeenCalledTimes(2);
  });

  // The payment landed and only the read failed, so this must not share the waiting screen, which
  // asks the reader to go pay.
  it('lands on its own stage when the completion fails, so Check again is reachable', async () => {
    vi.mocked(LocksController.fetchPaidContent).mockRejectedValue(new Error('down'));

    const { result, onCompleted } = renderPay();

    await waitFor(() => expect(result.current.stage).toBe('unopened'));
    expect(result.current.isStalled).toBe(false);
    expect(onCompleted).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringContaining('went through') }),
    );
  });

  // Nothing is polling behind this (the purchase was already complete when the modal opened):
  // recheck still has to retry, which it cannot do without a remembered bundle.
  it('retries the completion when Check again is pressed', async () => {
    vi.mocked(LocksController.fetchPaidContent).mockRejectedValue(new Error('down'));
    const { result, onCompleted } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('unopened'));

    vi.mocked(LocksController.fetchPaidContent).mockResolvedValue(unlockedContent);
    const before = vi.mocked(LocksController.fetchPaidContent).mock.calls.length;
    result.current.recheck();

    await waitFor(() => expect(result.current.stage).toBe('paid'));
    expect(connectionCalls()).toBe(0);
    expect(onCompleted).not.toHaveBeenCalled();
    act(() => result.current.viewContent());
    expect(onCompleted).toHaveBeenCalledWith(unlockedContent);
    expect(vi.mocked(LocksController.fetchPaidContent).mock.calls.length).toBeGreaterThan(before);
  });

  // Leaving Check again on screen through the lookup invites a second one for the same bundle.
  it('takes the retry screen away as soon as Check again is pressed', async () => {
    vi.mocked(LocksController.fetchPaidContent).mockRejectedValue(new Error('down'));
    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('unopened'));

    // Hangs, so the stage can only have moved from the press itself.
    vi.mocked(LocksController.fetchPaymentStatus).mockReturnValue(new Promise<TVerificationTask>(() => {}));
    act(() => result.current.recheck());

    expect(result.current.stage).toBe('finishing');
    // This wait re-reads the content, never the link, so there is no link state to be waiting on.
    expect(result.current.isConnectionPending).toBe(false);
  });
});

describe('usePayToUnlock (waiting)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUserPubky = 'reader1';
    authState.session = {};
    authState.restoreStatus = 'ready';
    vi.useFakeTimers();
    vi.mocked(LocksController.fetchResolvedPurchase).mockImplementation(resolveThroughLookup('stored-1'));
    vi.mocked(LocksController.startPayment).mockResolvedValue(submitted('stored-1'));
    vi.mocked(LocksController.fetchPaykitConnectionState).mockResolvedValue('connected');
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValue(task('pending'));
    vi.mocked(LocksController.fetchPaidContent).mockResolvedValue(unlockedContent);
  });
  afterEach(() => vi.useRealTimers());

  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });

  const returnToTab = (ms = 0) =>
    act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(ms);
    });

  /** Hangs the first polled task lookup (the open-time one still resolves) and hands back its release. */
  const holdOneLookup = (thenAlways: TVerificationStatus) => {
    let release: (value: TVerificationTask) => void = () => {};
    vi.mocked(LocksController.fetchPaymentStatus)
      .mockResolvedValueOnce(task('pending'))
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            release = r;
          }),
      )
      .mockResolvedValue(task(thenAlways));
    return (status: TVerificationStatus) => release(task(status));
  };

  /** Never settles — for proving one loop cannot hold the other up. */
  const hangForever = () => new Promise<never>(() => {});

  it('polls the task every three seconds and the link every second', async () => {
    vi.mocked(LocksController.fetchPaykitConnectionState).mockResolvedValue('none');

    const { result } = renderPay();
    // The open-time lookup answered the task, so its loop waits an interval; the link is unknown,
    // so that loop reads at once and the QR can appear.
    await advance(0);
    expect(statusCalls()).toBe(1);
    expect(connectionCalls()).toBe(1);
    expect(result.current.handshakePubky).toBe('pubkybob');

    await advance(CONNECTION_POLL_INTERVAL_MS);
    expect(connectionCalls()).toBe(2);
    expect(statusCalls()).toBe(1);

    await advance(CONNECTION_POLL_INTERVAL_MS * 2);
    expect(connectionCalls()).toBe(4);
    expect(statusCalls()).toBe(2);
  });

  it('stops the link loop but keeps the task loop after connected', async () => {
    vi.mocked(LocksController.fetchPaykitConnectionState).mockResolvedValueOnce('none').mockResolvedValue('connected');

    const { result } = renderPay();
    await advance(0);
    expect(result.current.handshakePubky).toBe('pubkybob');

    await advance(CONNECTION_POLL_INTERVAL_MS);
    expect(connectionCalls()).toBe(2);
    expect(result.current.handshakePubky).toBeNull();

    const lookupsWhenConnected = statusCalls();
    await advance(POLL_INTERVAL_MS * 2);
    expect(connectionCalls()).toBe(2);
    expect(statusCalls()).toBe(lookupsWhenConnected + 2);
  });

  it('keeps the contact handoff through recovery and handshake, then drops it on connected', async () => {
    vi.mocked(LocksController.fetchPaykitConnectionState)
      .mockResolvedValueOnce('none')
      .mockResolvedValueOnce('handshake')
      .mockResolvedValueOnce('recovery_required')
      .mockResolvedValueOnce('handshake')
      .mockResolvedValue('connected');

    const { result } = renderPay();
    await advance(0);
    expect(result.current.handshakePubky).toBe('pubkybob');

    for (const state of ['handshake', 'recovery_required', 'handshake']) {
      await advance(CONNECTION_POLL_INTERVAL_MS);
      expect(result.current.connectionState).toBe(state);
      expect(result.current.handshakePubky).toBe('pubkybob');
    }

    await advance(CONNECTION_POLL_INTERVAL_MS);
    expect(result.current.handshakePubky).toBeNull();
    expect(result.current.connectionState).toBe('connected');
    expect(LocksController.startPayment).not.toHaveBeenCalled();
  });

  // An operator switch this reader cannot flip: reading it again would never say anything new.
  it('stops the link loop on blocked and keeps the task loop', async () => {
    vi.mocked(LocksController.fetchPaykitConnectionState).mockResolvedValue('blocked');

    const { result } = renderPay();
    await advance(0);
    expect(result.current.connectionState).toBe('blocked');

    const lookupsWhenBlocked = statusCalls();
    await advance(POLL_INTERVAL_MS);
    expect(connectionCalls()).toBe(1);
    expect(statusCalls()).toBe(lookupsWhenBlocked + 1);
  });

  // The server keeps retrying the link itself, so the app keeps watching for it to come back.
  it('keeps reading the link while it reports recovery_required', async () => {
    vi.mocked(LocksController.fetchPaykitConnectionState).mockResolvedValue('recovery_required');

    const { result } = renderPay();
    await advance(0);
    expect(result.current.connectionState).toBe('recovery_required');

    await advance(CONNECTION_POLL_INTERVAL_MS * 2);
    expect(connectionCalls()).toBe(3);
  });

  // The whole point of splitting the loops: a hung link read must not hide a finished payment.
  it('finishes the payment while the link read never settles', async () => {
    vi.mocked(LocksController.fetchPaykitConnectionState).mockImplementation(hangForever);
    vi.mocked(LocksController.fetchPaymentStatus)
      .mockResolvedValueOnce(task('pending'))
      .mockResolvedValue(task('completed'));

    const { result } = renderPay();
    await advance(0);
    expect(result.current.stage).toBe('waiting');

    await advance(POLL_INTERVAL_MS);
    expect(result.current.stage).toBe('paid');
    expect(LocksController.fetchPaidContent).toHaveBeenCalledWith({ lockFile, bundleId: 'stored-1' });
  });

  // The submission reports no link state, so the wait is "checking" until the first read answers;
  // a failed read keeps it there rather than claiming a connection nobody has seen.
  it('reports the link as pending until the first read answers, through a failed one', async () => {
    vi.mocked(LocksController.fetchPaykitConnectionState)
      .mockRejectedValueOnce(new Error('Paykit unavailable'))
      .mockResolvedValue('none');

    const { result } = renderPay();
    await advance(0);
    expect(result.current.stage).toBe('waiting');
    expect(connectionCalls()).toBe(1);
    expect(result.current.isConnectionPending).toBe(true);

    await advance(CONNECTION_POLL_INTERVAL_MS);
    expect(connectionCalls()).toBe(2);
    expect(result.current.isConnectionPending).toBe(false);
    expect(result.current.handshakePubky).toBe('pubkybob');
  });

  // A completed payment stays acknowledged while its content downloads, even if the link read hangs.
  it('drops the pending link once the payment completes, even with the link read still out', async () => {
    vi.mocked(LocksController.fetchPaykitConnectionState).mockImplementation(hangForever);
    vi.mocked(LocksController.fetchPaymentStatus)
      .mockResolvedValueOnce(task('pending'))
      .mockResolvedValue(task('completed'));
    vi.mocked(LocksController.fetchPaidContent).mockReturnValue(new Promise<TUnlockedContent>(() => {}));

    const { result } = renderPay();
    await advance(0);
    expect(result.current.isConnectionPending).toBe(true);

    await advance(POLL_INTERVAL_MS);
    expect(result.current.stage).toBe('finishing');
    expect(LocksController.fetchPaidContent).toHaveBeenCalledWith({ lockFile, bundleId: 'stored-1' });
    expect(result.current.isConnectionPending).toBe(false);
  });

  it('parks and resumes a paid-content recheck without restarting the connection or payment', async () => {
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValue(task('completed'));
    vi.mocked(LocksController.fetchPaidContent).mockRejectedValue(new Error('content unavailable'));
    const { result } = renderPay();
    await advance(0);
    expect(result.current.stage).toBe('unopened');

    vi.mocked(LocksController.fetchPaymentStatus).mockImplementation(hangForever);
    act(() => result.current.recheck());
    expect(result.current.stage).toBe('finishing');
    await advance(STALL_AFTER_MS);
    expect(result.current.stage).toBe('finishing');
    expect(result.current.isStalled).toBe(true);
    expect(connectionCalls()).toBe(0);
    expect(LocksController.startPayment).not.toHaveBeenCalled();

    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValue(task('completed'));
    vi.mocked(LocksController.fetchPaidContent).mockResolvedValue(unlockedContent);
    act(() => result.current.recheck());
    await advance(0);
    expect(result.current.stage).toBe('paid');
    expect(result.current.isStalled).toBe(false);
    expect(connectionCalls()).toBe(0);
    expect(LocksController.startPayment).not.toHaveBeenCalled();
  });

  it('keeps the last QR and keeps polling the task when the link read fails', async () => {
    vi.mocked(LocksController.fetchPaykitConnectionState)
      .mockResolvedValueOnce('none')
      .mockRejectedValue(new Error('Paykit unavailable'));

    const { result } = renderPay();
    await advance(0);
    expect(result.current.handshakePubky).toBe('pubkybob');

    await advance(POLL_INTERVAL_MS);
    expect(connectionCalls()).toBeGreaterThan(1);
    expect(statusCalls()).toBe(2);
    // A failed read invents no state, so the QR stays and nothing is announced to the reader.
    expect(result.current.handshakePubky).toBe('pubkybob');
    expect(result.current.stage).toBe('waiting');
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('stops both loops when the payment ends', async () => {
    vi.mocked(LocksController.fetchPaykitConnectionState).mockResolvedValue('none');
    vi.mocked(LocksController.fetchPaymentStatus)
      .mockResolvedValueOnce(task('pending'))
      .mockResolvedValue(task('completed'));

    const { result } = renderPay();
    await advance(0);
    await advance(POLL_INTERVAL_MS);
    expect(result.current.stage).toBe('paid');

    const callsWhenDone = { status: statusCalls(), connection: connectionCalls() };
    await advance(POLL_INTERVAL_MS * 2);
    await returnToTab();
    expect(statusCalls()).toBe(callsWhenDone.status);
    expect(connectionCalls()).toBe(callsWhenDone.connection);
  });

  it('never runs two reads of the same kind at once', async () => {
    vi.mocked(LocksController.fetchPaymentStatus)
      .mockResolvedValueOnce(task('pending'))
      .mockImplementation(hangForever);
    vi.mocked(LocksController.fetchPaykitConnectionState).mockImplementation(hangForever);

    renderPay();
    await advance(0);
    expect(connectionCalls()).toBe(1);

    // Every visibility event asks both loops to read now; the ones already out must not be doubled.
    await advance(POLL_INTERVAL_MS);
    await returnToTab();
    await returnToTab();
    expect(statusCalls()).toBe(2);
    expect(connectionCalls()).toBe(1);
  });

  // A request from before the park settling late must not hand its in-flight slot to the new one.
  it('ignores a pre-park answer that lands after the resumed read', async () => {
    let releaseParked: (value: TVerificationTask) => void = () => {};
    vi.mocked(LocksController.fetchPaymentStatus)
      .mockResolvedValueOnce(task('pending'))
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            releaseParked = r;
          }),
      )
      .mockImplementation(hangForever);

    const { result } = renderPay();
    await advance(0);
    await advance(POLL_INTERVAL_MS);
    expect(statusCalls()).toBe(2);

    await advance(STALL_AFTER_MS);
    expect(result.current.isStalled).toBe(true);

    await returnToTab();
    expect(statusCalls()).toBe(3);

    await act(async () => {
      releaseParked(task('pending'));
    });
    await returnToTab();
    // The resumed read is still out, so nothing new goes out beside it.
    expect(statusCalls()).toBe(3);
  });

  it.each(['failed', 'expired'] as const)('offers Try again when the poll reports %s', async (status) => {
    vi.mocked(LocksController.fetchPaymentStatus)
      .mockResolvedValueOnce(task('pending'))
      .mockResolvedValueOnce(task(status));
    vi.mocked(LocksController.startPayment).mockResolvedValue(submitted('fresh-1'));
    vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValue(true);

    const { result } = renderPay();
    await advance(0);
    expect(result.current.stage).toBe('waiting');

    await advance(POLL_INTERVAL_MS);
    expect(result.current.stage).toBe(status === 'expired' ? 'expired' : 'retry');
    expect(toastMock).toHaveBeenCalledWith({
      variant: 'error',
      description:
        status === 'expired'
          ? 'The payment was not completed. You can try again.'
          : 'The payment failed. You can try again.',
    });

    const callsWhenDead = { status: statusCalls(), connection: connectionCalls() };
    await advance(POLL_INTERVAL_MS);
    await returnToTab();
    expect(statusCalls()).toBe(callsWhenDead.status);
    expect(connectionCalls()).toBe(callsWhenDead.connection);
    expect(toastMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.retry();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(LocksController.startPayment).toHaveBeenCalledWith(RETRY_PARAMS);
  });

  it('keeps polling through a lookup error', async () => {
    vi.mocked(LocksController.fetchPaymentStatus)
      .mockResolvedValueOnce(task('pending'))
      .mockRejectedValueOnce(new Error('blip'));

    const { result } = renderPay();
    await advance(0);

    await advance(POLL_INTERVAL_MS * 2);
    expect(result.current.stage).toBe('waiting');
    expect(result.current.isStalled).toBe(false);
    expect(toastMock).not.toHaveBeenCalled();
    expect(statusCalls()).toBe(3);
  });

  // A null mid-wait would mean the server lost the payment; one is treated like still-pending.
  it('keeps polling when the server briefly reports no task', async () => {
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValueOnce(task('pending')).mockResolvedValueOnce(null);

    const { result } = renderPay();
    await advance(0);

    await advance(POLL_INTERVAL_MS * 2);
    expect(result.current.stage).toBe('waiting');
    expect(statusCalls()).toBe(3);
  });

  it('parks both loops at the stall deadline and resumes them on tab focus', async () => {
    vi.mocked(LocksController.fetchPaykitConnectionState).mockResolvedValue('none');

    const { result } = renderPay();
    await advance(0);
    await advance(STALL_AFTER_MS + POLL_INTERVAL_MS);
    // Parked has to be visible: it is the only way back for a reader who never leaves the tab.
    expect(result.current.isStalled).toBe(true);
    expect(result.current.stage).toBe('waiting');

    const callsWhenParked = { status: statusCalls(), connection: connectionCalls() };
    await advance(STALL_AFTER_MS);
    expect(statusCalls()).toBe(callsWhenParked.status);
    expect(connectionCalls()).toBe(callsWhenParked.connection);

    await returnToTab(POLL_INTERVAL_MS);
    expect(result.current.isStalled).toBe(false);
    expect(statusCalls()).toBeGreaterThan(callsWhenParked.status);
    expect(connectionCalls()).toBeGreaterThan(callsWhenParked.connection);
  });

  it('parks at the wall-clock deadline even when a read never settles', async () => {
    vi.mocked(LocksController.fetchPaymentStatus)
      .mockResolvedValueOnce(task('pending'))
      .mockImplementation(hangForever);
    vi.mocked(LocksController.fetchPaykitConnectionState).mockImplementation(hangForever);

    const { result } = renderPay();
    await advance(0);
    await advance(STALL_AFTER_MS);
    expect(result.current.isStalled).toBe(true);

    act(() => result.current.recheck());
    await advance(0);
    expect(result.current.isStalled).toBe(false);
  });

  it('restarts both loops from Check again', async () => {
    vi.mocked(LocksController.fetchPaykitConnectionState).mockResolvedValue('none');

    const { result } = renderPay();
    await advance(0);
    await advance(STALL_AFTER_MS + POLL_INTERVAL_MS);
    expect(result.current.isStalled).toBe(true);

    const callsWhenParked = { status: statusCalls(), connection: connectionCalls() };
    act(() => result.current.recheck());
    await advance(0);
    expect(statusCalls()).toBe(callsWhenParked.status + 1);
    expect(connectionCalls()).toBe(callsWhenParked.connection + 1);
  });

  // Scanning cannot help before the wallet is set up.
  it.each(['none', 'recovery_required'] as const)(
    'hides the %s handoff until wallet setup finishes',
    async (connectionState) => {
      vi.mocked(LocksController.fetchPaykitConnectionState).mockResolvedValue(connectionState);
      vi.mocked(LocksController.fetchPaymentStatus)
        .mockResolvedValueOnce(task('pending', { walletSetupNeeded: true }))
        .mockResolvedValue(task('pending'));

      const { result } = renderPay();
      await advance(0);
      expect(result.current.connectionState).toBe(connectionState);
      expect(result.current.walletSetupNeeded).toBe(true);
      expect(result.current.handshakePubky).toBeNull();

      await advance(POLL_INTERVAL_MS);
      expect(result.current.walletSetupNeeded).toBe(false);
      expect(result.current.handshakePubky).toBe('pubkybob');
    },
  );

  // The reader cannot pay before the invoice exists, so the server's time to create it does not count.
  it('parks no sooner than three minutes after the invoice deadline', async () => {
    const deadline = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValue(task('pending', { admissionDeadlineAt: deadline }));

    const { result } = renderPay();
    await advance(0);
    await advance(10 * 60 * 1000);
    expect(result.current.isStalled).toBe(false);

    await advance(STALL_AFTER_MS);
    expect(result.current.isStalled).toBe(true);
  });

  // The read on return hangs, so only the deadline kept from the earlier read can hold the wait.
  it('keeps the invoice deadline when the tab comes back', async () => {
    const deadline = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    vi.mocked(LocksController.fetchPaymentStatus)
      .mockResolvedValueOnce(task('pending', { admissionDeadlineAt: deadline }))
      .mockResolvedValueOnce(task('pending', { admissionDeadlineAt: deadline }))
      .mockImplementation(hangForever);

    const { result } = renderPay();
    await advance(0);
    await advance(5 * 60 * 1000);
    await returnToTab();
    await advance(7 * 60 * 1000);
    expect(result.current.isStalled).toBe(false);

    await advance(60 * 1000);
    expect(result.current.isStalled).toBe(true);
  });

  // Every lookup after the open-time one hangs, so only the deadline read on opening can hold the wait.
  it('keeps the invoice deadline read on opening', async () => {
    const deadline = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    vi.mocked(LocksController.fetchPaymentStatus)
      .mockResolvedValueOnce(task('pending', { admissionDeadlineAt: deadline }))
      .mockImplementation(hangForever);

    const { result } = renderPay();
    await advance(0);
    await advance(POLL_INTERVAL_MS);
    expect(statusCalls()).toBe(2);
    await advance(12 * 60 * 1000 - POLL_INTERVAL_MS);
    expect(result.current.isStalled).toBe(false);

    await advance(60 * 1000);
    expect(result.current.isStalled).toBe(true);
  });

  // An unparsable time would make the delay NaN and a past one would shorten it; either parks too early.
  it.each([
    ['cannot be parsed', 'not a time'],
    ['has already passed', new Date(Date.now() - 60 * 1000).toISOString()],
  ])('still waits the full three minutes when the invoice deadline %s', async (_, deadline) => {
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValue(task('pending', { admissionDeadlineAt: deadline }));

    const { result } = renderPay();
    await advance(0);
    await advance(STALL_AFTER_MS - POLL_INTERVAL_MS);
    expect(result.current.isStalled).toBe(false);

    await advance(POLL_INTERVAL_MS * 3);
    expect(result.current.isStalled).toBe(true);
  });

  it('gives a fresh three minutes once the invoice exists', async () => {
    const deadline = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    vi.mocked(LocksController.fetchPaymentStatus)
      .mockResolvedValueOnce(task('pending', { admissionDeadlineAt: deadline }))
      .mockResolvedValueOnce(task('pending', { admissionDeadlineAt: deadline }))
      .mockResolvedValue(task('pending'));

    const { result } = renderPay();
    await advance(0);
    // The first poll holds the wait on the deadline; the second sees the invoice and restarts the window.
    await advance(POLL_INTERVAL_MS * 2);
    await advance(STALL_AFTER_MS - POLL_INTERVAL_MS * 2);
    expect(result.current.isStalled).toBe(false);

    await advance(POLL_INTERVAL_MS * 2);
    expect(result.current.isStalled).toBe(true);
  });

  // The tab coming back from Bitkit right as the throttled timer fires is the normal case, not a
  // race: the loop's own in-flight flag is what stops it from forking into two chains.
  describe('tab returns while a lookup is in flight', () => {
    const returnToTabMidLookup = async () => {
      await advance(POLL_INTERVAL_MS);
      await returnToTab();
    };

    it('keeps one lookup per interval', async () => {
      const release = holdOneLookup('pending');

      const { result } = renderPay();
      await advance(0);
      expect(result.current.stage).toBe('waiting');

      await returnToTabMidLookup();
      release('pending');
      await advance(0);

      const lookupsBefore = statusCalls();
      await advance(POLL_INTERVAL_MS);
      expect(statusCalls()).toBe(lookupsBefore + 1);
    });

    // Two chains both seeing `completed` mint two credentials and download the same post twice.
    it('finishes the completed payment once', async () => {
      const release = holdOneLookup('completed');
      const stages: TPayToUnlockStage[] = [];

      const { result } = renderHook(() => {
        const value = usePayToUnlock({
          open: true,
          lockUrl: LOCK_URL,
          lockFile,
          onCompleted: vi.fn(),
          onPurchased,
          onSessionExpired,
        });
        stages.push(value.stage);
        return value;
      });
      await advance(0);
      expect(result.current.stage).toBe('waiting');

      await returnToTabMidLookup();
      release('completed');
      await advance(0);

      expect(result.current.stage).toBe('paid');
      expect(LocksController.fetchPaidContent).toHaveBeenCalledTimes(1);
      // The confirmation is final: no flip back to the spinner once it is on screen.
      expect(stages.slice(stages.indexOf('paid'))).not.toContain('waiting');
    });

    it('reports a failed payment once', async () => {
      const release = holdOneLookup('failed');

      const { result } = renderPay();
      await advance(0);
      expect(result.current.stage).toBe('waiting');

      await returnToTabMidLookup();
      release('failed');
      await advance(0);

      expect(result.current.stage).toBe('retry');
      expect(toastMock).toHaveBeenCalledTimes(1);
    });
  });

  // Check again retires the running wait, but `stop()` cannot cancel a lookup already awaiting the
  // server — the epoch guard is what makes that answer inert.
  it('leaves the wait Check again retired unable to schedule or finish', async () => {
    const release = holdOneLookup('pending');

    const { result } = renderPay();
    await advance(0);
    expect(result.current.stage).toBe('waiting');

    await advance(POLL_INTERVAL_MS);
    act(() => result.current.recheck());
    await advance(0);

    release('completed');
    await advance(0);
    expect(LocksController.fetchPaidContent).not.toHaveBeenCalled();
    expect(result.current.stage).toBe('waiting');
  });

  it('goes quiet when the modal closes mid-wait', async () => {
    const { result, rerender } = renderPayWith({ open: true });
    await advance(0);
    expect(result.current.stage).toBe('waiting');

    rerender({ open: false });
    const callsWhenClosed = { status: statusCalls(), connection: connectionCalls() };
    await advance(POLL_INTERVAL_MS * 3);
    await returnToTab();
    expect(statusCalls()).toBe(callsWhenClosed.status);
    expect(connectionCalls()).toBe(callsWhenClosed.connection);
  });

  // A lookup that was already in flight when the modal closed must not open content nobody asked for.
  it('ignores a lookup that resolves after the modal closed', async () => {
    let resolve: (value: TVerificationTask) => void = () => {};
    vi.mocked(LocksController.fetchPaymentStatus)
      .mockResolvedValueOnce(task('pending'))
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      );

    const { result, rerender, onCompleted } = renderPayWith({ open: true });
    await advance(0);
    expect(result.current.stage).toBe('waiting');

    await advance(POLL_INTERVAL_MS);
    rerender({ open: false });
    resolve(task('completed'));
    await advance(0);
    expect(LocksController.fetchPaidContent).not.toHaveBeenCalled();
    expect(onCompleted).not.toHaveBeenCalled();
  });
});
