import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocksController } from '@/controllers/locks/locks';
import type { LockFile, TUnlockedContent } from '@/services/locks/locks.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { usePurchaseResume } from './usePurchaseResume';

vi.mock('@/controllers/locks/locks', () => ({
  LocksController: {
    fetchPaidContentIfCompleted: vi.fn(),
  },
}));
const authState = vi.hoisted(() => ({ currentUserPubky: 'reader1' as string | null, session: {} as object | null }));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (s: typeof authState) => unknown) => selector(authState),
}));

const lockFile = asOpaque<LockFile>({ creator: 'pubkybob' });
const LOCK_URL = 'pubky://pubkybob/pub/locks.app/LOCK1.json';
const content = asOpaque<TUnlockedContent>({
  post: { content: 'paid', kind: 'short', attachments: null },
  attachments: [],
});

/** Hands the resolver back so a test can finish the read after the hook has moved on. */
const deferredRead = () => {
  let resolve: (content: TUnlockedContent | null) => void = () => {};
  vi.mocked(LocksController.fetchPaidContentIfCompleted).mockReturnValue(new Promise((r) => (resolve = r)));
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
    vi.mocked(LocksController.fetchPaidContentIfCompleted).mockResolvedValue(content);
  });

  // The whole point: the reader paid, left, and the post would otherwise still say Unlock.
  it('reads and hands back content for a purchase that completed while the reader was away', async () => {
    const { onResumed } = renderResume();

    await waitFor(() => expect(onResumed).toHaveBeenCalledWith(content));
    expect(LocksController.fetchPaidContentIfCompleted).toHaveBeenCalledWith({
      lockFile,
      lockUrl: LOCK_URL,
      readerPubky: 'reader1',
    });
  });

  // The purchases listing and the lock file arrive independently. When the listing lands second,
  // the answer flips to true and the recovery still has to start.
  it('starts once the purchases listing lands after the lock file', async () => {
    const { rerender } = renderResume(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(LocksController.fetchPaidContentIfCompleted).not.toHaveBeenCalled();

    rerender({ purchased: true, resolving: false, content: false });
    await waitFor(() => expect(LocksController.fetchPaidContentIfCompleted).toHaveBeenCalled());
  });

  // A slow replica read must not read as "never unlocked" — otherwise a slow connection pays the
  // download cost twice for content the reader already has.
  it('waits for the replica read before deciding anything is missing', async () => {
    const { rerender } = renderResume(true, vi.fn(), false, true);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(LocksController.fetchPaidContentIfCompleted).not.toHaveBeenCalled();

    // The read finishes and the replica was there all along.
    rerender({ purchased: true, resolving: false, content: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(LocksController.fetchPaidContentIfCompleted).not.toHaveBeenCalled();

    // The read finishes with nothing: now there is something to recover.
    rerender({ purchased: true, resolving: false, content: false });
    await waitFor(() => expect(LocksController.fetchPaidContentIfCompleted).toHaveBeenCalled());
  });

  // Purchase entries are kept forever, so this is what stops an old unlock being re-downloaded
  // (and re-replicated) on every mount.
  it('does nothing when the content already renders from the replica', async () => {
    renderResume(true, vi.fn(), true);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(LocksController.fetchPaidContentIfCompleted).not.toHaveBeenCalled();
  });

  // Nothing to recover yet (no saved id, or still pending): the modal owns that wait.
  it('does nothing when there is nothing to recover', async () => {
    vi.mocked(LocksController.fetchPaidContentIfCompleted).mockResolvedValue(null);
    const { onResumed } = renderResume();

    await waitFor(() => expect(LocksController.fetchPaidContentIfCompleted).toHaveBeenCalled());
    expect(onResumed).not.toHaveBeenCalled();
  });

  it('waits for the restored session before reading the reader storage', async () => {
    authState.session = null;
    renderResume();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(LocksController.fetchPaidContentIfCompleted).not.toHaveBeenCalled();
  });

  // The reader still has the modal, and the next mount of the post tries again.
  it('stays quiet when the completion fails', async () => {
    vi.mocked(LocksController.fetchPaidContentIfCompleted).mockRejectedValue(new Error('down'));
    const { onResumed } = renderResume();

    await waitFor(() => expect(LocksController.fetchPaidContentIfCompleted).toHaveBeenCalled());
    expect(onResumed).not.toHaveBeenCalled();
  });

  it('drops a late result after unmount', async () => {
    const resolveRead = deferredRead();
    const { onResumed, unmount } = renderResume();
    await waitFor(() => expect(LocksController.fetchPaidContentIfCompleted).toHaveBeenCalled());

    unmount();
    resolveRead(content);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onResumed).not.toHaveBeenCalled();
  });

  // The replica read and the recovery run side by side; the replica landing first must win.
  it('drops a late result once the replica arrived', async () => {
    const resolveRead = deferredRead();
    const { onResumed, rerender } = renderResume();
    await waitFor(() => expect(LocksController.fetchPaidContentIfCompleted).toHaveBeenCalled());

    rerender({ purchased: true, resolving: false, content: true });
    resolveRead(content);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onResumed).not.toHaveBeenCalled();
  });
});
