import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocksController } from '@/controllers/locks/locks';
import type { LockFile, TUnlockedContent } from '@/services/locks/locks.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { usePurchaseResume } from './usePurchaseResume';

vi.mock('@/controllers/locks/locks', () => ({
  LocksController: {
    fetchResolvedPurchase: vi.fn(),
    fetchPaidContent: vi.fn(),
  },
}));
const authState = vi.hoisted(() => ({ currentUserPubky: 'reader1' as string | null, session: {} as object | null }));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: Object.assign((selector: (s: typeof authState) => unknown) => selector(authState), {
    getState: () => authState,
  }),
}));

const lockFile = asOpaque<LockFile>({ creator: 'pubkybob' });
const LOCK_URL = 'pubky://pubkybob/pub/app.locks/LOCK1.json';
const content = asOpaque<TUnlockedContent>({
  post: { content: 'paid', kind: 'short', attachments: null },
  attachments: [],
});

/** Hands the resolver back so a test can finish the read after the hook has moved on. */
const deferredRead = () => {
  let resolve: (content: TUnlockedContent) => void = () => {};
  vi.mocked(LocksController.fetchPaidContent).mockReturnValue(new Promise((r) => (resolve = r)));
  return resolve;
};

const renderResume = (isPurchased = true, onResumed = vi.fn(), hasContent = false, isResolvingContent = false) => ({
  onResumed,
  ...renderHook(
    ({ purchased, resolving, content }: { purchased: boolean; resolving: boolean; content: boolean }) =>
      usePurchaseResume({
        lock: LOCK_URL,
        lockFile,
        isPurchased: purchased,
        hasContent: content,
        isResolvingContent: resolving,
        onResumed,
      }),
    { initialProps: { purchased: isPurchased, resolving: isResolvingContent, content: hasContent } },
  ),
});

describe('usePurchaseResume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUserPubky = 'reader1';
    authState.session = {};
    vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue({
      kind: 'reusable',
      bundleId: 'saved-bundle',
      task: { status: 'completed', walletSetupNeeded: false, admissionDeadlineAt: null },
    });
    vi.mocked(LocksController.fetchPaidContent).mockResolvedValue(content);
  });

  // The whole point: the reader paid, left, and the post would otherwise still say Unlock.
  it('reads and hands back content for a purchase that completed while the reader was away', async () => {
    const { onResumed } = renderResume();

    await waitFor(() => expect(onResumed).toHaveBeenCalledWith(content));
    expect(LocksController.fetchPaidContent).toHaveBeenCalledWith({
      lockFile,
      bundleId: 'saved-bundle',
    });
  });

  // The purchases listing and the lock file arrive independently. When the listing lands second,
  // the answer flips to true and the recovery still has to start.
  it('starts once the purchases listing lands after the lock file', async () => {
    const { rerender } = renderResume(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(LocksController.fetchPaidContent).not.toHaveBeenCalled();

    rerender({ purchased: true, resolving: false, content: false });
    await waitFor(() => expect(LocksController.fetchPaidContent).toHaveBeenCalled());
  });

  // A slow replica read must not read as "never unlocked" — otherwise a slow connection pays the
  // download cost twice for content the reader already has.
  it('waits for the replica read before deciding anything is missing', async () => {
    const { rerender } = renderResume(true, vi.fn(), false, true);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(LocksController.fetchPaidContent).not.toHaveBeenCalled();

    // The read finishes and the replica was there all along.
    rerender({ purchased: true, resolving: false, content: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(LocksController.fetchPaidContent).not.toHaveBeenCalled();

    // The read finishes with nothing: now there is something to recover.
    rerender({ purchased: true, resolving: false, content: false });
    await waitFor(() => expect(LocksController.fetchPaidContent).toHaveBeenCalled());
  });

  // Purchase entries are kept forever, so this is what stops an old unlock being re-downloaded
  // (and re-replicated) on every mount.
  it('does nothing when the content already renders from the replica', async () => {
    renderResume(true, vi.fn(), true);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(LocksController.fetchPaidContent).not.toHaveBeenCalled();
  });

  // Nothing to recover yet (no saved id, or still pending): the modal owns that wait.
  it('does nothing when there is nothing to recover', async () => {
    vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(null);
    const { onResumed } = renderResume();

    await waitFor(() => expect(LocksController.fetchResolvedPurchase).toHaveBeenCalled());
    expect(onResumed).not.toHaveBeenCalled();
  });

  it('waits for the restored session before reading the reader storage', async () => {
    authState.session = null;
    renderResume();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(LocksController.fetchPaidContent).not.toHaveBeenCalled();
  });

  // The reader still has the modal, and the next mount of the post tries again.
  it('stays quiet when the completion fails', async () => {
    vi.mocked(LocksController.fetchPaidContent).mockRejectedValue(new Error('down'));
    const { onResumed } = renderResume();

    await waitFor(() => expect(LocksController.fetchResolvedPurchase).toHaveBeenCalled());
    expect(onResumed).not.toHaveBeenCalled();
  });

  it('drops a late result after unmount', async () => {
    const resolveRead = deferredRead();
    const { onResumed, unmount } = renderResume();
    await waitFor(() => expect(LocksController.fetchPaidContent).toHaveBeenCalled());

    unmount();
    resolveRead(content);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onResumed).not.toHaveBeenCalled();
  });

  // The replica read and the recovery run side by side; the replica landing first must win.
  it('drops a late result once the replica arrived', async () => {
    const resolveRead = deferredRead();
    const { onResumed, rerender } = renderResume();
    await waitFor(() => expect(LocksController.fetchPaidContent).toHaveBeenCalled());

    rerender({ purchased: true, resolving: false, content: true });
    resolveRead(content);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onResumed).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { kind: 'reusable' as const, bundleId: 'saved-bundle', task: null },
    { kind: 'terminal' as const, bundleId: 'saved-bundle', status: 'failed' as const },
    { kind: 'terminal' as const, bundleId: 'saved-bundle', status: 'expired' as const },
    // The Lock Server refused the lookup for the region (HTTP 451): not "unknown", which keeps Unlock live.
    { kind: 'region-blocked' as const },
  ])('does not exempt a saved id without a running/completed task: %j', async (purchase) => {
    vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(purchase);
    const { result } = renderResume();
    await waitFor(() => expect(result.current).toBe('none'));
    expect(LocksController.fetchPaidContent).not.toHaveBeenCalled();
  });

  it.each(['pending', 'in_progress'] as const)('permits read-only recovery for a %s task', async (status) => {
    vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue({
      kind: 'reusable',
      bundleId: 'saved-bundle',
      task: { status, walletSetupNeeded: false, admissionDeadlineAt: null },
    });
    const { result } = renderResume();
    await waitFor(() => expect(result.current).toBe('recoverable'));
    expect(LocksController.fetchResolvedPurchase).toHaveBeenCalledTimes(1);
    expect(LocksController.fetchPaidContent).not.toHaveBeenCalled();
  });

  it('keeps a completed purchase recoverable when only its content read failed', async () => {
    vi.mocked(LocksController.fetchPaidContent).mockRejectedValue(new Error('offline'));
    const { result } = renderResume();
    await waitFor(() => expect(result.current).toBe('recoverable'));
    expect(LocksController.fetchResolvedPurchase).toHaveBeenCalledTimes(1);
    expect(LocksController.fetchPaidContent).toHaveBeenCalledWith({ lockFile, bundleId: 'saved-bundle' });
  });

  it('exposes a failed task read as unknown so the modal can retry only the read', async () => {
    vi.mocked(LocksController.fetchResolvedPurchase).mockRejectedValue(new Error('offline'));
    const { result } = renderResume();
    await waitFor(() => expect(result.current).toBe('unknown'));
    expect(LocksController.fetchPaidContent).not.toHaveBeenCalled();
  });

  it('hides the old reader status and drops their late download after an account change', async () => {
    const resolveRead = deferredRead();
    const { result, rerender, onResumed } = renderResume();
    await waitFor(() => expect(result.current).toBe('recoverable'));
    authState.currentUserPubky = 'reader2';
    authState.session = {};
    vi.mocked(LocksController.fetchResolvedPurchase).mockReturnValue(new Promise(() => {}));
    rerender({ purchased: true, resolving: false, content: false });
    expect(result.current).toBe('checking');
    await act(async () => resolveRead(content));
    expect(onResumed).not.toHaveBeenCalled();
  });
  it('does not start a download for a task that resolves after logout', async () => {
    let resolveTask!: (value: Awaited<ReturnType<typeof LocksController.fetchResolvedPurchase>>) => void;
    vi.mocked(LocksController.fetchResolvedPurchase).mockReturnValue(
      new Promise((resolve) => {
        resolveTask = resolve;
      }),
    );
    const { onResumed } = renderResume();
    authState.currentUserPubky = null;
    authState.session = null;
    await act(async () =>
      resolveTask({
        kind: 'reusable',
        bundleId: 'saved-bundle',
        task: { status: 'completed', walletSetupNeeded: false, admissionDeadlineAt: null },
      }),
    );
    expect(LocksController.fetchPaidContent).not.toHaveBeenCalled();
    expect(onResumed).not.toHaveBeenCalled();
  });
});
