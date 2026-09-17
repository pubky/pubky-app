import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotificationStore } from '@/stores/notification/notification.store';
import { useAppBadge } from './useAppBadge';

const setAppBadge = vi.fn<(count?: number) => Promise<void>>().mockResolvedValue(undefined);
const clearAppBadge = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

function installBadgeApi() {
  Object.defineProperty(window.navigator, 'setAppBadge', { configurable: true, value: setAppBadge });
  Object.defineProperty(window.navigator, 'clearAppBadge', { configurable: true, value: clearAppBadge });
}

function removeBadgeApi() {
  Reflect.deleteProperty(window.navigator, 'setAppBadge');
  Reflect.deleteProperty(window.navigator, 'clearAppBadge');
}

describe('useAppBadge', () => {
  beforeEach(() => {
    useNotificationStore.getState().reset();
    setAppBadge.mockClear();
    clearAppBadge.mockClear();
  });

  afterEach(() => {
    removeBadgeApi();
    useNotificationStore.getState().reset();
  });

  it('does nothing when the Badging API is unavailable', () => {
    removeBadgeApi();
    act(() => useNotificationStore.getState().setUnread(3));

    renderHook(() => useAppBadge());

    expect(setAppBadge).not.toHaveBeenCalled();
    expect(clearAppBadge).not.toHaveBeenCalled();
  });

  it('clears the badge when there is nothing unread', () => {
    installBadgeApi();

    renderHook(() => useAppBadge());

    expect(clearAppBadge).toHaveBeenCalledTimes(1);
    expect(setAppBadge).not.toHaveBeenCalled();
  });

  it('mirrors the unread count onto the badge and follows changes', () => {
    installBadgeApi();
    act(() => useNotificationStore.getState().setUnread(3));

    renderHook(() => useAppBadge());
    expect(setAppBadge).toHaveBeenLastCalledWith(3);

    act(() => useNotificationStore.getState().setUnread(5));
    expect(setAppBadge).toHaveBeenLastCalledWith(5);

    act(() => useNotificationStore.getState().reset());
    expect(clearAppBadge).toHaveBeenCalled();
  });

  it('leaves the badge alone on unmount (it is OS state)', () => {
    installBadgeApi();
    act(() => useNotificationStore.getState().setUnread(2));
    const { unmount } = renderHook(() => useAppBadge());
    clearAppBadge.mockClear();

    unmount();

    expect(clearAppBadge).not.toHaveBeenCalled();
  });

  it('swallows a rejected badge call', async () => {
    installBadgeApi();
    setAppBadge.mockRejectedValueOnce(new Error('not installed'));
    act(() => useNotificationStore.getState().setUnread(1));

    renderHook(() => useAppBadge());
    await act(async () => {
      await Promise.resolve();
    });

    expect(setAppBadge).toHaveBeenCalledWith(1);
  });
});
