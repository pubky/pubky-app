import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '@/molecules/Toaster/toast';
import { useNetworkStatusToasts } from './useNetworkStatusToasts';

vi.mock('@/molecules/Toaster/toast');

function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
}

function goOffline() {
  act(() => {
    setOnLine(false);
    window.dispatchEvent(new Event('offline'));
  });
}

function goOnline() {
  act(() => {
    setOnLine(true);
    window.dispatchEvent(new Event('online'));
  });
}

describe('useNetworkStatusToasts', () => {
  beforeEach(() => {
    setOnLine(true);
  });

  afterEach(() => {
    setOnLine(true);
  });

  it('shows nothing on an online mount', () => {
    renderHook(() => useNetworkStatusToasts());
    expect(vi.mocked(toast)).not.toHaveBeenCalled();
  });

  it('shows the offline toast when mounted offline', () => {
    setOnLine(false);
    renderHook(() => useNetworkStatusToasts());

    expect(vi.mocked(toast)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast)).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'warning', title: "You're offline" }),
    );
  });

  it('shows the offline toast, then dismisses it and confirms when back online', () => {
    const dismiss = vi.fn();
    vi.mocked(toast).mockReturnValueOnce({ dismiss });
    renderHook(() => useNetworkStatusToasts());

    goOffline();
    expect(vi.mocked(toast)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast)).toHaveBeenLastCalledWith(expect.objectContaining({ variant: 'warning' }));

    goOnline();
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(toast)).toHaveBeenLastCalledWith({ variant: 'info', title: 'Back online' });
  });

  it('does not repeat a toast when re-rendered without a status change', () => {
    const { rerender } = renderHook(() => useNetworkStatusToasts());

    goOffline();
    rerender();
    rerender();

    expect(vi.mocked(toast)).toHaveBeenCalledTimes(1);
  });
});
