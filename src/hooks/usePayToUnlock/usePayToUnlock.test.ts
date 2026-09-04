import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocksController } from '@/controllers/locks/locks';
import type { LockFile, TUnlockedContent, TVerificationStatus } from '@/services/locks/locks.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { POLL_INTERVAL_MS, STALL_AFTER_MS, usePayToUnlock } from './usePayToUnlock';

vi.mock('@/controllers/locks/locks', () => ({
  LocksController: {
    fetchPurchaseBundleId: vi.fn(),
    startPayment: vi.fn(),
    fetchPaymentStatus: vi.fn(),
    fetchPaidContent: vi.fn(),
    hasPaykitReceiver: vi.fn(),
  },
}));

const authState = vi.hoisted(() => ({ currentUserPubky: 'reader1' as string | null, session: {} as object | null }));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (s: typeof authState) => unknown) => selector(authState),
}));

const toastMock = vi.hoisted(() => vi.fn());
vi.mock('@/molecules/Toaster/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));

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

describe('usePayToUnlock (opening)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUserPubky = 'reader1';
    authState.session = {};
    vi.mocked(LocksController.fetchPaidContent).mockResolvedValue(unlockedContent);
  });

  it('shows Pay when nothing is stored and the wallet has a receiver', async () => {
    vi.mocked(LocksController.fetchPurchaseBundleId).mockResolvedValue(null);
    vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValue(true);

    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('pay'));
    expect(LocksController.startPayment).not.toHaveBeenCalled();
  });

  it('shows the install steps when nothing is stored and there is no receiver', async () => {
    vi.mocked(LocksController.fetchPurchaseBundleId).mockResolvedValue(null);
    vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValue(false);

    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('install'));
    expect(LocksController.startPayment).not.toHaveBeenCalled();
  });

  // Saved id with no status: the submission never reached the server. Pay again with the SAME id —
  // never an indefinite waiting state.
  it('offers Pay again when the saved bundle id has no status behind it', async () => {
    vi.mocked(LocksController.fetchPurchaseBundleId).mockResolvedValue('stored-1');
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValue(null);

    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('pay'));
    expect(LocksController.startPayment).not.toHaveBeenCalled();
    expect(LocksController.hasPaykitReceiver).not.toHaveBeenCalled(); // a purchase exists; the gate is moot
  });

  it('resumes waiting when the saved bundle id is still pending', async () => {
    vi.mocked(LocksController.fetchPurchaseBundleId).mockResolvedValue('stored-1');
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValue('pending');

    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('waiting'));
    expect(LocksController.startPayment).not.toHaveBeenCalled();
  });

  it('shows the paid confirmation when the saved bundle id already completed', async () => {
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

  // The stored id can change while the modal is closed (another tab paid), so a reopen must not
  // trust the stage it closed on.
  it('re-checks on reopen', async () => {
    vi.mocked(LocksController.fetchPurchaseBundleId).mockResolvedValue(null);
    vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValue(true);

    const { result, rerender } = renderPayWith({ open: true });
    await waitFor(() => expect(result.current.stage).toBe('pay'));

    rerender({ open: false });
    rerender({ open: true });
    expect(result.current.stage).toBe('checking');
    expect(LocksController.fetchPurchaseBundleId).toHaveBeenCalledTimes(2);
  });
});

describe('usePayToUnlock (submit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUserPubky = 'reader1';
    authState.session = {};
    vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValue(true);
    vi.mocked(LocksController.fetchPurchaseBundleId).mockResolvedValue(null);
    vi.mocked(LocksController.startPayment).mockResolvedValue({ bundleId: 'fresh-1', status: 'pending' });
  });

  it('starts the payment and moves to waiting', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValue('pending');

      const { result } = renderPay();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.stage).toBe('pay');

      await act(async () => {
        result.current.submit();
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.stage).toBe('waiting');
      expect(LocksController.startPayment).toHaveBeenCalledWith({
        lockFile,
        lockUrl: LOCK_URL,
        readerPubky: 'reader1',
        rejectBundleId: null,
      });
      // The submit response already carried a status, so the first lookup waits one interval.
      expect(LocksController.fetchPaymentStatus).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      });
      expect(LocksController.fetchPaymentStatus).toHaveBeenCalledTimes(1);
      expect(LocksController.fetchPaymentStatus).toHaveBeenCalledWith({ lockFile, bundleId: 'fresh-1' });
    } finally {
      vi.useRealTimers();
    }
  });

  // A saved id with no status never reached the server, so nothing is rejected and the same id is sent.
  it('re-submits with the saved id when it had no status behind it', async () => {
    vi.mocked(LocksController.fetchPurchaseBundleId).mockResolvedValue('stored-1');
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValue(null);

    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('pay'));
    result.current.submit();

    await waitFor(() => expect(LocksController.startPayment).toHaveBeenCalled());
    expect(LocksController.startPayment).toHaveBeenCalledWith(expect.objectContaining({ rejectBundleId: null }));
    expect(LocksController.hasPaykitReceiver).not.toHaveBeenCalled();
  });

  // failed/expired cannot be retried — the dead id is handed over so the application replaces it,
  // and only when the reader presses again: a dead payment must not re-charge anyone on its own.
  it.each(['failed', 'expired'] as const)('rejects the bundle id whose payment ended in %s', async (status) => {
    vi.mocked(LocksController.fetchPurchaseBundleId).mockResolvedValue('dead-1');
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValue(status);

    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('pay'));
    expect(LocksController.startPayment).not.toHaveBeenCalled();
    result.current.submit();

    await waitFor(() => expect(LocksController.startPayment).toHaveBeenCalled());
    expect(LocksController.startPayment).toHaveBeenCalledWith(expect.objectContaining({ rejectBundleId: 'dead-1' }));
  });

  it('stays on Pay with a toast when the submission fails (wallet not ready or Paykit down)', async () => {
    vi.mocked(LocksController.startPayment).mockRejectedValue(new Error('HTTP 502'));

    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('pay'));
    result.current.submit();

    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    expect(result.current.stage).toBe('pay');
    expect(result.current.isSubmitting).toBe(false);
  });

  // Two clicks in the same tick are the classic shape of a double payment.
  it('ignores a second press while a submission is in flight', async () => {
    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('pay'));
    result.current.submit();
    result.current.submit();

    await waitFor(() => expect(LocksController.startPayment).toHaveBeenCalled());
    expect(LocksController.startPayment).toHaveBeenCalledTimes(1);
  });

  // The session listing was taken before this purchase existed, so the recovery path needs telling.
  it('announces the purchase so this session can recover it', async () => {
    const { result } = renderPay();
    await waitFor(() => expect(result.current.stage).toBe('pay'));
    result.current.submit();

    await waitFor(() => expect(onPurchased).toHaveBeenCalledWith('LOCK1'));
  });
});

describe('usePayToUnlock (finishing)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUserPubky = 'reader1';
    authState.session = {};
    vi.mocked(LocksController.fetchPurchaseBundleId).mockResolvedValue('stored-1');
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValue('completed');
  });

  // A failed read must leave the reader something to press, not a spinner.
  it('parks in the waiting stage when the completion fails, so Check again is reachable', async () => {
    vi.mocked(LocksController.fetchPaidContent).mockRejectedValue(new Error('down'));

    const { result, onCompleted } = renderPay();

    await waitFor(() => expect(result.current.isStalled).toBe(true));
    expect(result.current.stage).toBe('waiting');
    expect(onCompleted).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringContaining('went through') }),
    );
  });

  // Parked with no polling behind it (the purchase was already complete when the modal opened):
  // recheck still has to retry, which it cannot do without a remembered bundle.
  it('retries the completion when Check again is pressed', async () => {
    vi.mocked(LocksController.fetchPaidContent).mockRejectedValue(new Error('down'));
    const { result, onCompleted } = renderPay();
    await waitFor(() => expect(result.current.isStalled).toBe(true));

    vi.mocked(LocksController.fetchPaidContent).mockResolvedValue(unlockedContent);
    const before = vi.mocked(LocksController.fetchPaidContent).mock.calls.length;
    result.current.recheck();

    await waitFor(() => expect(result.current.stage).toBe('paid'));
    expect(onCompleted).not.toHaveBeenCalled();
    act(() => result.current.viewContent());
    expect(onCompleted).toHaveBeenCalledWith(unlockedContent);
    expect(vi.mocked(LocksController.fetchPaidContent).mock.calls.length).toBeGreaterThan(before);
  });
});

describe('usePayToUnlock (waiting)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUserPubky = 'reader1';
    authState.session = {};
    vi.useFakeTimers();
    vi.mocked(LocksController.fetchPurchaseBundleId).mockResolvedValue('stored-1');
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValue('pending');
    vi.mocked(LocksController.fetchPaidContent).mockResolvedValue(unlockedContent);
  });
  afterEach(() => vi.useRealTimers());

  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });

  it('stops polling and shows the paid confirmation when a poll sees the payment complete', async () => {
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValueOnce('pending').mockResolvedValueOnce('completed');

    const { result, onCompleted } = renderPay();
    await advance(0);
    expect(result.current.stage).toBe('waiting');

    await advance(POLL_INTERVAL_MS);
    expect(LocksController.fetchPaidContent).toHaveBeenCalledWith({ lockFile, bundleId: 'stored-1' });
    expect(result.current.stage).toBe('paid');
    expect(onCompleted).not.toHaveBeenCalled();

    const lookupsWhenDone = statusCalls();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(statusCalls()).toBe(lookupsWhenDone);

    act(() => result.current.viewContent());
    expect(onCompleted).toHaveBeenCalledWith(unlockedContent);
  });

  it.each(['failed', 'expired'] as const)(
    'offers Pay again with the dead id rejected when the poll reports %s',
    async (status) => {
      vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValueOnce('pending').mockResolvedValueOnce(status);
      vi.mocked(LocksController.startPayment).mockResolvedValue({ bundleId: 'fresh-1', status: 'pending' });

      const { result } = renderPay();
      await advance(0);
      expect(result.current.stage).toBe('waiting');

      await advance(POLL_INTERVAL_MS);
      expect(result.current.stage).toBe('pay');
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining(status) }));

      const lookupsWhenDead = statusCalls();
      await advance(POLL_INTERVAL_MS);
      expect(statusCalls()).toBe(lookupsWhenDead);

      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(statusCalls()).toBe(lookupsWhenDead);
      expect(toastMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        result.current.submit();
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
    expect(result.current.stage).toBe('waiting');
    const lookupsAfterOpen = statusCalls();

    await advance(POLL_INTERVAL_MS);
    await advance(POLL_INTERVAL_MS);
    expect(result.current.stage).toBe('waiting');
    expect(result.current.isStalled).toBe(false);
    expect(toastMock).not.toHaveBeenCalled();
    expect(statusCalls()).toBe(lookupsAfterOpen + 2);
  });

  // A null mid-wait would mean the server lost the payment; one is treated like still-pending.
  it('keeps polling when the server briefly reports no task', async () => {
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValueOnce('pending').mockResolvedValueOnce(null);

    const { result } = renderPay();
    await advance(0);
    expect(result.current.stage).toBe('waiting');
    const lookupsAfterOpen = statusCalls();

    await advance(POLL_INTERVAL_MS);
    await advance(POLL_INTERVAL_MS);
    expect(result.current.stage).toBe('waiting');
    expect(result.current.isStalled).toBe(false);
    expect(toastMock).not.toHaveBeenCalled();
    expect(statusCalls()).toBe(lookupsAfterOpen + 2);
  });

  it('parks at the stall deadline and resumes with a fresh window on tab focus', async () => {
    const { result } = renderPay();
    await advance(0);
    expect(result.current.stage).toBe('waiting');
    // Only the open-time read so far; the first poll waits a full interval.
    expect(LocksController.fetchPaymentStatus).toHaveBeenCalledTimes(1);
    await advance(POLL_INTERVAL_MS - 1);
    expect(LocksController.fetchPaymentStatus).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(LocksController.fetchPaymentStatus).toHaveBeenCalledTimes(2);

    // Run past the deadline: the loop parks.
    await advance(STALL_AFTER_MS + POLL_INTERVAL_MS);
    const lookupsWhenParked = statusCalls();
    // Parked has to be visible: it is the only way back for a reader who never leaves the tab.
    expect(result.current.isStalled).toBe(true);
    expect(result.current.stage).toBe('waiting');

    // Parked means parked: more time, no more lookups.
    await advance(STALL_AFTER_MS);
    expect(statusCalls()).toBe(lookupsWhenParked);

    // The reader comes back from Bitkit: immediate lookup, and the loop truly resumes.
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
    });
    expect(result.current.isStalled).toBe(false);
    expect(statusCalls()).toBeGreaterThan(lookupsWhenParked + 1);
  });

  it('goes quiet when the modal closes mid-wait', async () => {
    const { result, rerender } = renderPayWith({ open: true });
    await advance(0);
    expect(result.current.stage).toBe('waiting');

    rerender({ open: false });
    const lookupsWhenClosed = statusCalls();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(statusCalls()).toBe(lookupsWhenClosed);
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
