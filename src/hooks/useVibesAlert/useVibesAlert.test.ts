import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { vibesReminder } from '@/libs/vibes/vibesReminder';
import { useVibesAlert } from './useVibesAlert';

const auth = vi.hoisted(() => ({ currentUserPubky: 'alice' as string | null }));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: typeof auth) => unknown) => selector(auth),
}));

const storageKey = 'pubky-feature-discovery:alice:vibes-alert-v2';
const hour = 60 * 60 * 1000;

describe('useVibesAlert', () => {
  beforeEach(() => {
    localStorage.clear();
    vibesReminder.resetMemory();
    auth.currentUserPubky = 'alice';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-22T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows on the first signed-in visit and snoozes the Vibes reminder on Later', () => {
    const { result } = renderHook(useVibesAlert);
    expect(result.current.visible).toBe(true);
    act(() => result.current.remindLater());
    expect(result.current.visible).toBe(false);
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({
      done: false,
      laterCount: 1,
      nextShowAt: Date.now() + 24 * hour,
    });
  });

  it('ignores Later for guests', () => {
    auth.currentUserPubky = null;
    const { result } = renderHook(useVibesAlert);
    expect(result.current.visible).toBe(false);
    act(() => result.current.remindLater());
    expect(localStorage.length).toBe(0);
  });

  it('ignores Later while the alert is hidden', () => {
    vibesReminder.markDone('alice');
    const { result } = renderHook(useVibesAlert);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    act(() => result.current.remindLater());
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('hides when Vibes is opened from any entry point', () => {
    const { result } = renderHook(useVibesAlert);
    act(() => vibesReminder.markDone('alice'));
    expect(result.current.visible).toBe(false);
  });
});
