import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocksController } from '@/controllers/locks/locks';
import type { LockFile, TUnlockedContent, TVerificationStatus } from '@/services/locks/locks.types';
import { asOpaque } from '@/test-utils/type-assertions';
import {
  CONNECTION_POLL_INTERVAL_MS,
  POLL_INTERVAL_MS,
  STALL_AFTER_MS,
  usePayToUnlock,
  WALLET_POLL_INTERVAL_MS,
} from './usePayToUnlock';
import type { TPayToUnlockStage } from './usePayToUnlock.types';

vi.mock('@/controllers/locks/locks', () => ({
  LocksController: {
    fetchPurchaseBundleId: vi.fn(),
    startPayment: vi.fn(),
    // Default so every test that does not care about the link still returns a settled one.
    fetchPaykitConnectionState: vi.fn(async () => 'connected'),
    // Defaults so a test that does not arrange the wait still gets a settled poll.
    fetchPaymentStatus: vi.fn(async () => 'pending'),
    fetchPaidContent: vi.fn(),
    hasPaykitReceiver: vi.fn(),
  },
}));

const authState = vi.hoisted(() => ({ currentUserPubky: 'reader1' as string | null, session: {} as object | null }));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (s: typeof authState) => unknown) => selector(authState),
}));

const toastMock = vi.hoisted(() => vi.fn());
vi.mock('@/molecules/Toaster/toast', () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

const lockFile = asOpaque<LockFile>({
  creator: 'pubkybob',
  criteria: [{ criterion_id: 'criterion-1', verifier_type: 'paykit-payment', params: { amount: '1000' } }],
});
const LOCK_URL = 'pubky://pubkybob/pub/locks.app/LOCK1.json';

const unlockedContent = asOpaque<TUnlockedContent>({
  post: { content: 'paid', kind: 'short', attachments: null },
  attachments: [],
});

const onPurchased = vi.fn();
const renderPay = (onCompleted = vi.fn()) => ({
  onCompleted,
  ...renderHook(() => usePayToUnlock({ open: true, lockUrl: LOCK_URL, lockFile, onCompleted, onPurchased })),
});
const renderPayWith = (initialProps: { open: boolean }, onCompleted = vi.fn()) => ({
  onCompleted,
  ...renderHook(
    (props: { open: boolean }) => usePayToUnlock({ ...props, lockUrl: LOCK_URL, lockFile, onCompleted, onPurchased }),
    { initialProps },
  ),
});

const statusCalls = () => vi.mocked(LocksController.fetchPaymentStatus).mock.calls.length;
const connectionCalls = () => vi.mocked(LocksController.fetchPaykitConnectionState).mock.calls.length;

type TSubmitted = Awaited<ReturnType<typeof LocksController.startPayment>>;
const submitted = (bundleId: string, status: TVerificationStatus = 'pending'): TSubmitted => ({ bundleId, status });

describe('usePayToUnlock (opening)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUserPubky = 'reader1';
    authState.session = {};
    vi.mocked(LocksController.fetchPaidContent).mockResolvedValue(unlockedContent);
    vi.mocked(LocksController.startPayment).mockResolvedValue(submitted('fresh-1'));
    vi.mocked(LocksController.fetchPaykitConnectionState).mockResolvedValue('connected');
  });

  it('submits automatically when nothing is stored and the wallet has a receiver', async () => {
    vi.mocked(LocksController.fetchPurchaseBundleId).mockResolvedValue(null);
    vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValue(true);

    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('waiting'));
    expect(LocksController.startPayment).toHaveBeenCalledWith({
      lockFile,
      lockUrl: LOCK_URL,
      readerPubky: 'reader1',
      rejectBundleId: null,
    });
  });

  it('shows the install steps when nothing is stored and there is no receiver', async () => {
    vi.mocked(LocksController.fetchPurchaseBundleId).mockResolvedValue(null);
    vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValue(false);

    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('install'));
    expect(LocksController.startPayment).not.toHaveBeenCalled();
  });

  // No task behind the saved id means the first submission never landed, so it goes out again.
  it('submits the saved bundle id again when the server has no task for it', async () => {
    vi.mocked(LocksController.fetchPurchaseBundleId).mockResolvedValue('stored-1');
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValue(null);

    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('waiting'));
    expect(LocksController.startPayment).toHaveBeenCalledWith(expect.objectContaining({ rejectBundleId: null }));
    expect(LocksController.hasPaykitReceiver).not.toHaveBeenCalled(); // a purchase exists; the gate is moot
  });

  // A running task needs nothing submitted: the connection state has its own lookup now.
  it.each(['pending', 'in_progress'] as const)(
    'resumes a saved bundle id without submitting when its task reports %s',
    async (status) => {
      vi.mocked(LocksController.fetchPurchaseBundleId).mockResolvedValue('stored-1');
      vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValue(status);

      const { result } = renderPay();
      await waitFor(() => expect(result.current.stage).toBe('waiting'));
      expect(LocksController.startPayment).not.toHaveBeenCalled();
      expect(LocksController.fetchPaykitConnectionState).toHaveBeenCalledWith({ lockFile, bundleId: 'stored-1' });
    },
  );

  it('shows the paid confirmation without replaying a saved bundle id that already completed', async () => {
    vi.mocked(LocksController.fetchPurchaseBundleId).mockResolvedValue('stored-1');
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValue('completed');

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
    ['none', 'pubkybob', null],
    ['handshake', null, null],
    ['connected', null, null],
    ['recovery_required', null, 'recovery_required'],
    ['blocked', null, 'blocked'],
  ] as const)('connection state %s: QR %s, notice %s', async (connectionState, qr, issue) => {
    vi.mocked(LocksController.fetchPurchaseBundleId).mockResolvedValue('stored-1');
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValue('pending');
    vi.mocked(LocksController.fetchPaykitConnectionState).mockResolvedValue(connectionState);

    const { result } = renderPay();
    await waitFor(() => expect(connectionCalls()).toBeGreaterThan(0));
    await waitFor(() => expect(result.current.connectionIssue).toBe(issue));
    expect(result.current.handshakePubky).toBe(qr);
  });

  // The session rehydrates after `currentUserPubky`; reading storage without it silently reports
  // "no purchase", which would fail OPEN — so the hook stays on checking until it lands.
  it('stays on checking while the session is still restoring', async () => {
    authState.session = null;
    vi.mocked(LocksController.fetchPurchaseBundleId).mockResolvedValue(null);
    vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValue(true);

    const { result } = renderPay();
    await act(async () => {});
    expect(result.current.stage).toBe('checking');
    expect(LocksController.startPayment).not.toHaveBeenCalled();
    expect(LocksController.fetchPurchaseBundleId).not.toHaveBeenCalled();
  });

  // Fail closed: the file may exist but be unreadable — minting a fresh id could pay twice.
  it('blocks paying when the saved bundle id cannot be read', async () => {
    vi.mocked(LocksController.fetchPurchaseBundleId).mockRejectedValue(new Error('unreadable'));

    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('blocked'));
    expect(LocksController.startPayment).not.toHaveBeenCalled();
  });

  // The lookup stands between the saved id and the automatic replay: an outage there must not
  // reach the submit call, which would pay for a purchase whose state is unknown.
  it('blocks paying when the open-time lookup fails', async () => {
    vi.mocked(LocksController.fetchPurchaseBundleId).mockResolvedValue('stored-1');
    vi.mocked(LocksController.fetchPaymentStatus).mockRejectedValue(new Error('HTTP 503'));

    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('blocked'));
    expect(LocksController.startPayment).not.toHaveBeenCalled();
  });

  // The stored id can change while the modal is closed (another tab paid), so a reopen must not
  // trust the stage it closed on.
  it('re-checks on reopen', async () => {
    vi.mocked(LocksController.fetchPurchaseBundleId).mockResolvedValue(null);
    vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValue(true);

    const { result, rerender } = renderPayWith({ open: true });
    await waitFor(() => expect(result.current.stage).toBe('waiting'));

    rerender({ open: false });
    rerender({ open: true });
    expect(result.current.stage).toBe('checking');
    expect(LocksController.fetchPurchaseBundleId).toHaveBeenCalledTimes(2);
  });

  // The earlier submission's guard must not leave the reopened modal stuck on checking.
  it('submits again on reopen while the earlier submission is still out', async () => {
    let releaseFirst: (result: TSubmitted) => void = () => {};
    vi.mocked(LocksController.fetchPurchaseBundleId).mockResolvedValue(null);
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
    await waitFor(() => expect(result.current.handshakePubky).toBe('pubkybob'));

    // The closed opening's late answer changes nothing.
    await act(async () => {
      releaseFirst(submitted('fresh-1'));
    });
    expect(result.current.handshakePubky).toBe('pubkybob');
    expect(result.current.isSubmitting).toBe(false);
  });
});

describe('usePayToUnlock (retry)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUserPubky = 'reader1';
    authState.session = {};
    vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValue(true);
    vi.mocked(LocksController.fetchPurchaseBundleId).mockResolvedValue(null);
    vi.mocked(LocksController.startPayment).mockResolvedValue(submitted('fresh-1'));
    vi.mocked(LocksController.fetchPaykitConnectionState).mockResolvedValue('connected');
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValue('pending');
  });

  it('starts the payment on open and moves to waiting', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValue('pending');

      const { result } = renderPay();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.stage).toBe('waiting');
      expect(LocksController.startPayment).toHaveBeenCalledWith({
        lockFile,
        lockUrl: LOCK_URL,
        readerPubky: 'reader1',
        rejectBundleId: null,
      });
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

  // failed/expired cannot be retried — the dead id is handed over so the application replaces it,
  // and only when the reader presses again: a dead payment must not re-charge anyone on its own.
  it.each(['failed', 'expired'] as const)('rejects the bundle id whose payment ended in %s', async (status) => {
    vi.mocked(LocksController.fetchPurchaseBundleId).mockResolvedValue('dead-1');
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValue(status);

    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('retry'));
    expect(LocksController.startPayment).not.toHaveBeenCalled();
    result.current.retry();

    await waitFor(() => expect(LocksController.startPayment).toHaveBeenCalledTimes(1));
    expect(LocksController.startPayment).toHaveBeenCalledWith(expect.objectContaining({ rejectBundleId: 'dead-1' }));
  });

  it('offers Try again without rejecting the saved id when the submission fails', async () => {
    vi.mocked(LocksController.startPayment).mockRejectedValue(new Error('HTTP 502'));

    const { result } = renderPay();
    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    expect(result.current.stage).toBe('retry');
    expect(result.current.isSubmitting).toBe(false);

    result.current.retry();
    await waitFor(() => expect(LocksController.startPayment).toHaveBeenCalledTimes(2));
    expect(LocksController.startPayment).toHaveBeenLastCalledWith(expect.objectContaining({ rejectBundleId: null }));
  });

  describe('install screen', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const advance = (ms: number) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    const walletChecks = () => vi.mocked(LocksController.hasPaykitReceiver).mock.calls.length;

    it('shows the QR and keeps checking for a wallet without submitting', async () => {
      vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValue(false);

      const { result } = renderPay();
      await advance(0);
      expect(result.current.stage).toBe('install');
      // The QR is the creator's pubky, so it does not wait on the reader's wallet.
      expect(result.current.handshakePubky).toBe('pubkybob');

      await advance(WALLET_POLL_INTERVAL_MS * 2);
      expect(walletChecks()).toBe(3);
      expect(LocksController.startPayment).not.toHaveBeenCalled();
    });

    it('starts the purchase as soon as a wallet shows up', async () => {
      vi.mocked(LocksController.hasPaykitReceiver)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValue(true);

      const { result } = renderPay();
      await advance(0);
      await advance(WALLET_POLL_INTERVAL_MS);
      expect(LocksController.startPayment).not.toHaveBeenCalled();

      await advance(WALLET_POLL_INTERVAL_MS);
      expect(LocksController.startPayment).toHaveBeenCalledTimes(1);
      expect(result.current.stage).toBe('waiting');

      // Found once is enough: the check stops for good.
      const checksWhenFound = walletChecks();
      await advance(WALLET_POLL_INTERVAL_MS * 2);
      expect(walletChecks()).toBe(checksWhenFound);
    });

    it('treats a failed wallet check as "not yet" and keeps checking', async () => {
      vi.mocked(LocksController.hasPaykitReceiver)
        .mockResolvedValueOnce(false)
        .mockRejectedValueOnce(new Error('homeserver blip'))
        .mockResolvedValue(true);

      const { result } = renderPay();
      await advance(0);
      await advance(WALLET_POLL_INTERVAL_MS);
      expect(result.current.stage).toBe('install');
      expect(toastMock).not.toHaveBeenCalled();

      await advance(WALLET_POLL_INTERVAL_MS);
      expect(LocksController.startPayment).toHaveBeenCalledTimes(1);
    });

    it('stops checking when the modal closes', async () => {
      vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValue(false);

      const { rerender } = renderPayWith({ open: true });
      await advance(0);
      rerender({ open: false });

      const checksWhenClosed = walletChecks();
      await advance(WALLET_POLL_INTERVAL_MS * 3);
      expect(walletChecks()).toBe(checksWhenClosed);
      expect(LocksController.startPayment).not.toHaveBeenCalled();
    });

    it('offers Try again when the submission after the wallet shows up fails', async () => {
      vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValueOnce(false).mockResolvedValue(true);
      vi.mocked(LocksController.startPayment).mockRejectedValue(new Error('HTTP 502'));

      const { result } = renderPay();
      await advance(0);
      await advance(WALLET_POLL_INTERVAL_MS);

      expect(result.current.stage).toBe('retry');
      expect(toastMock).toHaveBeenCalledTimes(1);
    });
  });

  // Two clicks in the same tick are the classic shape of a double payment.
  it('ignores a second retry while a submission is in flight', async () => {
    vi.mocked(LocksController.fetchPurchaseBundleId).mockResolvedValue('dead-1');
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValue('failed');
    vi.mocked(LocksController.startPayment).mockImplementation(() => new Promise(() => {}));

    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('retry'));
    result.current.retry();
    result.current.retry();

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
    vi.mocked(LocksController.fetchPaykitConnectionState).mockResolvedValue('connected');
    vi.mocked(LocksController.fetchPurchaseBundleId).mockResolvedValue('stored-1');
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValue('completed');
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
    vi.mocked(LocksController.fetchPaymentStatus).mockReturnValue(new Promise<TVerificationStatus>(() => {}));
    act(() => result.current.recheck());

    expect(result.current.stage).toBe('waiting');
  });
});

describe('usePayToUnlock (waiting)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUserPubky = 'reader1';
    authState.session = {};
    vi.useFakeTimers();
    vi.mocked(LocksController.fetchPurchaseBundleId).mockResolvedValue('stored-1');
    vi.mocked(LocksController.startPayment).mockResolvedValue(submitted('stored-1'));
    vi.mocked(LocksController.fetchPaykitConnectionState).mockResolvedValue('connected');
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValue('pending');
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
    let release: (status: TVerificationStatus) => void = () => {};
    vi.mocked(LocksController.fetchPaymentStatus)
      .mockResolvedValueOnce('pending')
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            release = r;
          }),
      )
      .mockResolvedValue(thenAlways);
    return (status: TVerificationStatus) => release(status);
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

  // An operator switch this reader cannot flip: reading it again would never say anything new.
  it('stops the link loop on blocked and keeps the task loop', async () => {
    vi.mocked(LocksController.fetchPaykitConnectionState).mockResolvedValue('blocked');

    const { result } = renderPay();
    await advance(0);
    expect(result.current.connectionIssue).toBe('blocked');

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
    expect(result.current.connectionIssue).toBe('recovery_required');

    await advance(CONNECTION_POLL_INTERVAL_MS * 2);
    expect(connectionCalls()).toBe(3);
  });

  // The whole point of splitting the loops: a hung link read must not hide a finished payment.
  it('finishes the payment while the link read never settles', async () => {
    vi.mocked(LocksController.fetchPaykitConnectionState).mockImplementation(hangForever);
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValueOnce('pending').mockResolvedValue('completed');

    const { result } = renderPay();
    await advance(0);
    expect(result.current.stage).toBe('waiting');

    await advance(POLL_INTERVAL_MS);
    expect(result.current.stage).toBe('paid');
    expect(LocksController.fetchPaidContent).toHaveBeenCalledWith({ lockFile, bundleId: 'stored-1' });
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
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValueOnce('pending').mockResolvedValue('completed');

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
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValueOnce('pending').mockImplementation(hangForever);
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
    let releaseParked: (status: TVerificationStatus) => void = () => {};
    vi.mocked(LocksController.fetchPaymentStatus)
      .mockResolvedValueOnce('pending')
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
      releaseParked('pending');
    });
    await returnToTab();
    // The resumed read is still out, so nothing new goes out beside it.
    expect(statusCalls()).toBe(3);
  });

  it.each(['failed', 'expired'] as const)(
    'offers Try again with the dead id rejected when the poll reports %s',
    async (status) => {
      vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValueOnce('pending').mockResolvedValueOnce(status);
      vi.mocked(LocksController.startPayment).mockResolvedValue(submitted('fresh-1'));

      const { result } = renderPay();
      await advance(0);
      expect(result.current.stage).toBe('waiting');

      await advance(POLL_INTERVAL_MS);
      expect(result.current.stage).toBe('retry');
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining(status) }));

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
      expect(LocksController.startPayment).toHaveBeenCalledWith(
        expect.objectContaining({ rejectBundleId: 'stored-1' }),
      );
    },
  );

  it('keeps polling through a lookup error', async () => {
    vi.mocked(LocksController.fetchPaymentStatus)
      .mockResolvedValueOnce('pending')
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
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValueOnce('pending').mockResolvedValueOnce(null);

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
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValueOnce('pending').mockImplementation(hangForever);
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
        const value = usePayToUnlock({ open: true, lockUrl: LOCK_URL, lockFile, onCompleted: vi.fn(), onPurchased });
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
    let resolve: (status: TVerificationStatus) => void = () => {};
    vi.mocked(LocksController.fetchPaymentStatus)
      .mockResolvedValueOnce('pending')
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
    resolve('completed');
    await advance(0);
    expect(LocksController.fetchPaidContent).not.toHaveBeenCalled();
    expect(onCompleted).not.toHaveBeenCalled();
  });
});
