import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocksController } from '@/controllers/locks/locks';
import { usePurchasedLocks } from './usePurchasedLocks';

vi.mock('@/controllers/locks/locks', () => ({
  LocksController: { fetchPurchasedLockIds: vi.fn() },
}));

const authState = vi.hoisted(() => ({
  currentUserPubky: 'reader1' as string | null,
  session: { pubky: 'reader1' } as { pubky: string } | null,
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (s: typeof authState) => unknown) => selector(authState),
}));

describe('usePurchasedLocks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // A different reader each test, so the module-level purchasedIdsByReader (one listing per reader) can't leak
    // an answer from the previous one.
    authState.currentUserPubky = `reader-${Math.random().toString(36).slice(2)}`;
    authState.session = { pubky: authState.currentUserPubky };
    vi.mocked(LocksController.fetchPurchasedLockIds).mockResolvedValue(['lock1']);
  });

  it('answers from a single listing rather than a request per lock', async () => {
    const { result } = renderHook(() => usePurchasedLocks({ enabled: true }));

    await waitFor(() => expect(result.current.hasPurchase('lock1')).toBe(true));
    expect(result.current.hasPurchase('lock2')).toBe(false);
    expect(LocksController.fetchPurchasedLockIds).toHaveBeenCalledTimes(1);
  });

  it('reuses the listing across mounts for the same reader', async () => {
    const first = renderHook(() => usePurchasedLocks({ enabled: true }));
    await waitFor(() => expect(first.result.current.hasPurchase('lock1')).toBe(true));

    const second = renderHook(() => usePurchasedLocks({ enabled: true }));
    await waitFor(() => expect(second.result.current.hasPurchase('lock1')).toBe(true));
    expect(LocksController.fetchPurchasedLockIds).toHaveBeenCalledTimes(1);
  });

  // A purchase made in this session must be visible before any re-listing.
  it('counts a lock marked purchased this session', async () => {
    const { result } = renderHook(() => usePurchasedLocks({ enabled: true }));
    await waitFor(() => expect(result.current.hasPurchase('lock1')).toBe(true));

    act(() => result.current.markPurchased('lock-new'));
    await waitFor(() => expect(result.current.hasPurchase('lock-new')).toBe(true));
  });

  // The listing is shared by every card on the page. Replacing it while still in flight would let
  // the server answer land afterwards and drop the purchase just made.
  it('keeps a purchase marked while the listing is still in flight', async () => {
    let resolveListing: (ids: string[]) => void = () => {};
    vi.mocked(LocksController.fetchPurchasedLockIds).mockReturnValue(
      new Promise((resolve) => {
        resolveListing = resolve;
      }),
    );
    const { result } = renderHook(() => usePurchasedLocks({ enabled: true }));

    act(() => result.current.markPurchased('lock-new'));
    await act(async () => resolveListing(['lock1']));

    await waitFor(() => expect(result.current.hasPurchase('lock1')).toBe(true));
    expect(result.current.hasPurchase('lock-new')).toBe(true);
  });

  it('reports nothing purchased when the listing fails, without throwing', async () => {
    vi.mocked(LocksController.fetchPurchasedLockIds).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => usePurchasedLocks({ enabled: true }));

    await waitFor(() => expect(LocksController.fetchPurchasedLockIds).toHaveBeenCalled());
    expect(result.current.hasPurchase('lock1')).toBe(false);
  });

  // Otherwise the purchase is invisible until a reload, and the recovery path cannot pick it up.
  it('still counts a purchase marked after a failed listing', async () => {
    vi.mocked(LocksController.fetchPurchasedLockIds).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => usePurchasedLocks({ enabled: true }));
    await waitFor(() => expect(LocksController.fetchPurchasedLockIds).toHaveBeenCalled());

    act(() => result.current.markPurchased('lock-new'));
    await waitFor(() => expect(result.current.hasPurchase('lock-new')).toBe(true));
  });

  it('lists nothing while disabled', () => {
    renderHook(() => usePurchasedLocks({ enabled: false }));

    expect(LocksController.fetchPurchasedLockIds).not.toHaveBeenCalled();
  });

  it('stays idle for a signed-out reader', () => {
    authState.currentUserPubky = null;
    authState.session = null;
    renderHook(() => usePurchasedLocks({ enabled: true }));

    expect(LocksController.fetchPurchasedLockIds).not.toHaveBeenCalled();
  });

  // The pubky rehydrates before the session; listing without one reads `/priv` unauthenticated.
  it('waits for the session before listing', async () => {
    authState.session = null;
    const { rerender, result } = renderHook(() => usePurchasedLocks({ enabled: true }));
    expect(LocksController.fetchPurchasedLockIds).not.toHaveBeenCalled();

    authState.session = { pubky: authState.currentUserPubky as string };
    rerender();

    await waitFor(() => expect(result.current.hasPurchase('lock1')).toBe(true));
    expect(LocksController.fetchPurchasedLockIds).toHaveBeenCalledTimes(1);
  });

  // A failed listing must not be cached as "nothing purchased" for the rest of the page load.
  it('lists again on the next mount after a failure', async () => {
    vi.mocked(LocksController.fetchPurchasedLockIds).mockRejectedValueOnce(new Error('offline'));
    const first = renderHook(() => usePurchasedLocks({ enabled: true }));
    await waitFor(() => expect(LocksController.fetchPurchasedLockIds).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    first.unmount();

    vi.mocked(LocksController.fetchPurchasedLockIds).mockResolvedValue(['lock1']);
    const second = renderHook(() => usePurchasedLocks({ enabled: true }));

    await waitFor(() => expect(second.result.current.hasPurchase('lock1')).toBe(true));
    expect(LocksController.fetchPurchasedLockIds).toHaveBeenCalledTimes(2);
  });

  it('re-lists for a different reader and does not inherit the previous ids', async () => {
    const { result, rerender } = renderHook(() => usePurchasedLocks({ enabled: true }));
    await waitFor(() => expect(result.current.hasPurchase('lock1')).toBe(true));

    authState.currentUserPubky = `reader-${Math.random().toString(36).slice(2)}`;
    authState.session = { pubky: authState.currentUserPubky };
    vi.mocked(LocksController.fetchPurchasedLockIds).mockResolvedValue(['lock2']);
    rerender();

    await waitFor(() => expect(result.current.hasPurchase('lock2')).toBe(true));
    expect(result.current.hasPurchase('lock1')).toBe(false);
    expect(LocksController.fetchPurchasedLockIds).toHaveBeenCalledTimes(2);
  });

  it('two cards mounting at once share one in-flight listing', async () => {
    let resolveListing: (ids: string[]) => void = () => {};
    vi.mocked(LocksController.fetchPurchasedLockIds).mockReturnValue(
      new Promise((resolve) => {
        resolveListing = resolve;
      }),
    );
    const first = renderHook(() => usePurchasedLocks({ enabled: true }));
    const second = renderHook(() => usePurchasedLocks({ enabled: true }));

    await act(async () => resolveListing(['lock1']));

    await waitFor(() => expect(first.result.current.hasPurchase('lock1')).toBe(true));
    await waitFor(() => expect(second.result.current.hasPurchase('lock1')).toBe(true));
    expect(LocksController.fetchPurchasedLockIds).toHaveBeenCalledTimes(1);
  });
});
