import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markTried } from '@/libs/vibes/vibesReminder';
import { useVibesAlert } from './useVibesAlert';

const auth = vi.hoisted(() => ({ currentUserPubky: 'alice' as string | null }));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: typeof auth) => unknown) => selector(auth),
}));

const storageKey = 'pubky-feature-discovery:alice:vibes-alert-v1';
const hour = 60 * 60 * 1000;

describe('useVibesAlert', () => {
  beforeEach(() => {
    localStorage.clear();
    auth.currentUserPubky = 'alice';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps guests hidden and shows on the first authenticated visit', () => {
    auth.currentUserPubky = null;
    const { result, rerender } = renderHook(useVibesAlert);
    expect(result.current.visible).toBe(false);
    act(() => result.current.remindLater());
    expect(localStorage.getItem(storageKey)).toBeNull();
    auth.currentUserPubky = 'alice';
    rerender();
    expect(result.current.visible).toBe(true);
    auth.currentUserPubky = null;
    rerender();
    expect(result.current.visible).toBe(false);
  });

  it('waits for a return to the tab instead of interrupting an ongoing visit', () => {
    const { result, rerender } = renderHook(useVibesAlert);
    act(() => result.current.remindLater());
    act(() => vi.advanceTimersByTime(24 * hour));
    rerender();
    expect(result.current.visible).toBe(false);
    act(() => window.dispatchEvent(new Event('focus')));
    expect(result.current.visible).toBe(true);
  });

  it('checks eligibility when the tab becomes visible again', () => {
    const { result } = renderHook(useVibesAlert);
    act(() => result.current.remindLater());
    vi.setSystemTime(Date.now() + 24 * hour);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(result.current.visible).toBe(false);
    visibility.mockReturnValue('visible');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(result.current.visible).toBe(true);
  });

  it('honors a permanent dismissal on subsequent visits', () => {
    const first = renderHook(useVibesAlert);
    act(() => markTried('alice'));
    expect(first.result.current.visible).toBe(false);
    first.unmount();
    const next = renderHook(useVibesAlert);
    expect(next.result.current.visible).toBe(false);
  });

  it('keeps choices separate when switching accounts and restores them on return', () => {
    const { result, rerender } = renderHook(useVibesAlert);
    act(() => markTried('alice'));
    auth.currentUserPubky = 'bob';
    rerender();
    expect(result.current.visible).toBe(true);
    act(() => markTried('alice'));
    expect(result.current.visible).toBe(true);
    auth.currentUserPubky = 'alice';
    rerender();
    expect(result.current.visible).toBe(false);
  });

  it('hides an open alert when another tab dismisses it', () => {
    const { result } = renderHook(useVibesAlert);
    localStorage.setItem(storageKey, JSON.stringify({ tried: false, laterCount: 1, nextShowAt: Date.now() + hour }));
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: storageKey })));
    expect(result.current.visible).toBe(false);
  });

  it('dismisses every mounted alert for the account when Later is selected', () => {
    const first = renderHook(useVibesAlert);
    const second = renderHook(useVibesAlert);
    act(() => first.result.current.remindLater());
    expect(first.result.current.visible).toBe(false);
    expect(second.result.current.visible).toBe(false);
  });

  it('does not show mid-visit when another tab clears storage', () => {
    const { result } = renderHook(useVibesAlert);
    act(() => result.current.remindLater());
    localStorage.removeItem(storageKey);
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: null })));
    expect(result.current.visible).toBe(false);
    act(() => window.dispatchEvent(new Event('focus')));
    expect(result.current.visible).toBe(true);
  });

  it('stays hidden when browser storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Unavailable');
    });
    const { result } = renderHook(useVibesAlert);
    expect(result.current.visible).toBe(false);
  });

  it('still dismisses if saving fails', () => {
    const { result } = renderHook(useVibesAlert);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded');
    });
    act(() => markTried('alice'));
    expect(result.current.visible).toBe(false);
  });
});
