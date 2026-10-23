import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFeatureReminder } from '@/libs/featureDiscovery/featureReminder';
import { useFeatureReminderDue } from './useFeatureReminderDue';

const hour = 60 * 60 * 1000;
const reminder = createFeatureReminder('test-prompt-v1', [24 * hour]);
const storageKey = 'pubky-feature-discovery:alice:test-prompt-v1';

function renderDue(initial: { pubky: string | null; enabled?: boolean }) {
  return renderHook(({ pubky, enabled }) => useFeatureReminderDue(reminder, pubky, enabled), {
    initialProps: initial,
  });
}

describe('useFeatureReminderDue', () => {
  beforeEach(() => {
    localStorage.clear();
    reminder.resetMemory();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps guests hidden and is due on the first signed-in visit', () => {
    const { result, rerender } = renderDue({ pubky: null });
    expect(result.current).toBe(false);
    rerender({ pubky: 'alice' });
    expect(result.current).toBe(true);
    rerender({ pubky: null });
    expect(result.current).toBe(false);
  });

  it('does not read storage while disabled and never reports a stale due', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const { result, rerender } = renderDue({ pubky: 'alice', enabled: false });
    act(() => window.dispatchEvent(new Event('focus')));
    expect(result.current).toBe(false);
    expect(getItem).not.toHaveBeenCalled();

    rerender({ pubky: 'alice', enabled: true });
    expect(result.current).toBe(true);
    rerender({ pubky: 'alice', enabled: false });
    expect(result.current).toBe(false);
  });

  it('waits for a return to the tab instead of interrupting an ongoing visit', () => {
    const { result, rerender } = renderDue({ pubky: 'alice' });
    act(() => reminder.snooze('alice'));
    act(() => vi.advanceTimersByTime(24 * hour));
    rerender({ pubky: 'alice' });
    expect(result.current).toBe(false);
    act(() => window.dispatchEvent(new Event('focus')));
    expect(result.current).toBe(true);
  });

  it('re-checks when the tab becomes visible again', () => {
    const { result } = renderDue({ pubky: 'alice' });
    act(() => reminder.snooze('alice'));
    vi.setSystemTime(Date.now() + 24 * hour);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(result.current).toBe(false);
    visibility.mockReturnValue('visible');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(result.current).toBe(true);
  });

  it('hides every mounted prompt for the account on dismissal and honors it on the next visit', () => {
    const first = renderDue({ pubky: 'alice' });
    const second = renderDue({ pubky: 'alice' });
    act(() => reminder.markDone('alice'));
    expect(first.result.current).toBe(false);
    expect(second.result.current).toBe(false);
    first.unmount();
    second.unmount();
    expect(renderDue({ pubky: 'alice' }).result.current).toBe(false);
  });

  it('keeps accounts apart when switching and restores each account on return', () => {
    const { result, rerender } = renderDue({ pubky: 'alice' });
    act(() => reminder.markDone('alice'));
    rerender({ pubky: 'bob' });
    expect(result.current).toBe(true);
    act(() => reminder.markDone('alice'));
    expect(result.current).toBe(true);
    rerender({ pubky: 'alice' });
    expect(result.current).toBe(false);
  });

  it('hides an open prompt when another tab snoozes it', () => {
    const { result } = renderDue({ pubky: 'alice' });
    localStorage.setItem(storageKey, JSON.stringify({ done: false, laterCount: 1, nextShowAt: Date.now() + hour }));
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: storageKey })));
    expect(result.current).toBe(false);
  });

  it('does not show mid-visit when another tab clears storage', () => {
    const { result } = renderDue({ pubky: 'alice' });
    act(() => reminder.snooze('alice'));
    localStorage.removeItem(storageKey);
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: null })));
    expect(result.current).toBe(false);
    act(() => window.dispatchEvent(new Event('focus')));
    expect(result.current).toBe(true);
  });

  it('stays hidden when browser storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Unavailable');
    });
    expect(renderDue({ pubky: 'alice' }).result.current).toBe(false);
  });

  it('stops listening after unmount', () => {
    const subscribe = vi.spyOn(reminder, 'subscribeToDismissal');
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderDue({ pubky: 'alice' });
    expect(subscribe).toHaveBeenCalledOnce();
    unmount();
    expect(removeListener).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('storage', expect.any(Function));
  });
});
