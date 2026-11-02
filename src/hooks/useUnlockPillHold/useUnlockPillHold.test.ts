import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UNLOCK_PILL_HOLD_MS } from '@/config/locks';
import { useUnlockPillHold } from './useUnlockPillHold';
import type { UseUnlockPillHoldParams } from './useUnlockPillHold.types';

const authState = vi.hoisted(() => ({ currentUserPubky: 'reader1' as string | null, session: {} as object | null }));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (s: typeof authState) => unknown) => selector(authState),
}));

const LOCK_URL = 'pubky://bob/pub/app.locks/lock1.json';

/** A listed purchase whose replicated copy is being read: the start of every wait. */
const reading: UseUnlockPillHoldParams = {
  lock: LOCK_URL,
  isPayableReader: true,
  isPayOpen: false,
  isResolvingReplica: true,
  purchasesStatus: 'ready',
  isListedPurchase: true,
  purchaseStatus: 'checking',
};
/** The read came back empty and recovery is looking the listed purchase up. */
const lookingUp: UseUnlockPillHoldParams = { ...reading, isResolvingReplica: false };

const renderHold = (initialProps: UseUnlockPillHoldParams) =>
  renderHook((props: UseUnlockPillHoldParams) => useUnlockPillHold(props), { initialProps });
const advance = (ms: number) => act(async () => vi.advanceTimersByTime(ms));

describe('useUnlockPillHold', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(authState, { currentUserPubky: 'reader1', session: {} });
  });
  afterEach(() => vi.useRealTimers());

  it('holds while the copy of a listed purchase is read, and releases at the limit', async () => {
    const { result } = renderHold(reading);
    expect(result.current).toBe(true);
    await advance(UNLOCK_PILL_HOLD_MS - 1);
    expect(result.current).toBe(true);
    await advance(1);
    expect(result.current).toBe(false);
  });

  it('holds while the purchase list is not in, or failed, and the copy is read', () => {
    for (const purchasesStatus of ['idle', 'loading', 'error'] as const) {
      const { result, unmount } = renderHold({ ...reading, purchasesStatus, isListedPurchase: false });
      expect(result.current).toBe(true);
      unmount();
    }
  });

  it('does not hold a reader the purchase list rules out', () => {
    const { result } = renderHold({ ...reading, isListedPurchase: false, purchaseStatus: 'none' });
    expect(result.current).toBe(false);
  });

  it('does not hold an own lock, a lock without a price, or while the pay dialog is open', () => {
    expect(renderHold({ ...reading, isPayableReader: false }).result.current).toBe(false);
    expect(renderHold({ ...reading, isPayOpen: true }).result.current).toBe(false);
  });

  it('keeps holding from the read into the recovery lookup, and releases when nothing is left', async () => {
    const { result, rerender } = renderHold(reading);
    await advance(4_000);
    rerender(lookingUp);
    expect(result.current).toBe(true);
    rerender({ ...lookingUp, purchaseStatus: 'none' });
    expect(result.current).toBe(false);
  });

  // Path 1 in the review: a slow read must not earn the lookup a fresh limit after it.
  it('counts one limit across the read and the lookup, and does not take a released pill back', async () => {
    const { result, rerender } = renderHold(reading);
    await advance(UNLOCK_PILL_HOLD_MS);
    expect(result.current).toBe(false);
    rerender(lookingUp);
    expect(result.current).toBe(false);
    await advance(UNLOCK_PILL_HOLD_MS);
    expect(result.current).toBe(false);
  });

  it('counts the lookup against the limit started by the read', async () => {
    const { result, rerender } = renderHold(reading);
    await advance(6_000);
    rerender(lookingUp);
    await advance(UNLOCK_PILL_HOLD_MS - 6_000 - 1);
    expect(result.current).toBe(true);
    await advance(1);
    expect(result.current).toBe(false);
  });

  // Path 2: the read settles empty before the list is in, then the list names this lock.
  it('keeps holding after the read while the purchase list is still loading', () => {
    const { result, rerender } = renderHold({ ...reading, purchasesStatus: 'loading', isListedPurchase: false });
    rerender({ ...lookingUp, purchasesStatus: 'loading', isListedPurchase: false, purchaseStatus: 'none' });
    expect(result.current).toBe(true);
    rerender(lookingUp);
    expect(result.current).toBe(true);
  });

  // Path 3: opening the dialog hands the purchase to it; closing it must not start another hold.
  it('stays released after the pay dialog opens and closes again', async () => {
    const { result, rerender } = renderHold(lookingUp);
    rerender({ ...lookingUp, isPayOpen: true });
    expect(result.current).toBe(false);
    rerender(lookingUp);
    expect(result.current).toBe(false);
  });

  it('does not count a session restore against the limit', async () => {
    Object.assign(authState, { session: null });
    const { result, rerender } = renderHold(reading);
    await advance(UNLOCK_PILL_HOLD_MS * 2);
    expect(result.current).toBe(true);

    authState.session = {};
    rerender({ ...reading });
    await advance(UNLOCK_PILL_HOLD_MS - 1);
    expect(result.current).toBe(true);
    await advance(1);
    expect(result.current).toBe(false);
  });

  it('starts a fresh hold for another post or another account', async () => {
    const { result, rerender } = renderHold(reading);
    await advance(UNLOCK_PILL_HOLD_MS);
    expect(result.current).toBe(false);

    rerender({ ...reading, lock: 'pubky://bob/pub/app.locks/lock2.json' });
    expect(result.current).toBe(true);

    authState.currentUserPubky = 'reader2';
    rerender({ ...reading });
    expect(result.current).toBe(true);
  });
});
