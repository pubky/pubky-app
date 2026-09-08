import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from './toast';
import { subscribe, TOAST_DURATION, TOAST_REMOVE_DELAY } from './toast.store';
import { useToastState } from './useToastState';

describe('toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Drain the auto-dismiss (3s) and removal (20s) timers so the module-level
    // store is empty before the next test runs.
    act(() => {
      vi.runAllTimers();
    });
    vi.useRealTimers();
  });

  it('should add a toast with normalized defaults', () => {
    const { result } = renderHook(() => useToastState());

    act(() => {
      toast({ title: 'Saved', description: 'Your changes were saved' });
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]).toMatchObject({
      title: 'Saved',
      description: 'Your changes were saved',
      variant: 'default',
      dismissButton: false,
      open: true,
    });
  });

  it('should keep only the latest toast when exceeding the toast limit', () => {
    const { result } = renderHook(() => useToastState());

    act(() => {
      toast({ title: 'Toast 1' });
      toast({ title: 'Toast 2' });
      toast({ title: 'Toast 3' });
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].title).toBe('Toast 3');
  });

  it('should create toasts with unique ids', () => {
    const { result } = renderHook(() => useToastState());

    act(() => {
      toast({ title: 'First' });
    });
    const firstId = result.current.toasts[0].id;

    act(() => {
      toast({ title: 'Second' });
    });
    const secondId = result.current.toasts[0].id;

    expect(firstId).not.toBe(secondId);
  });

  it('should auto-dismiss the toast after the toast duration via the setTimeout fallback', () => {
    // Radix Toast's internal timer fails to start when isClosePausedRef stays true after user
    // interaction, so toast() schedules its own dismissal via setTimeout.
    // See https://github.com/radix-ui/primitives/issues/2233
    const { result } = renderHook(() => useToastState());

    act(() => {
      toast({ title: 'Auto dismissed' });
    });
    expect(result.current.toasts[0].open).toBe(true);

    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION - 1);
    });
    expect(result.current.toasts[0].open).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.toasts[0].open).toBe(false);
  });

  it('should dismiss the toast immediately via the returned handle', () => {
    const { result } = renderHook(() => useToastState());

    let handle: ReturnType<typeof toast>;
    act(() => {
      handle = toast({ title: 'Dismiss me' });
    });
    expect(result.current.toasts[0].open).toBe(true);

    act(() => {
      handle.dismiss();
    });
    expect(result.current.toasts[0].open).toBe(false);
  });

  it('should remove a dismissed toast from state after the removal delay', () => {
    const { result } = renderHook(() => useToastState());

    let handle: ReturnType<typeof toast>;
    act(() => {
      handle = toast({ title: 'Removed later' });
    });

    act(() => {
      handle.dismiss();
    });
    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(TOAST_REMOVE_DELAY - 1);
    });
    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('should cancel the auto-dismiss timer when a toast is dismissed manually', () => {
    let handle: ReturnType<typeof toast>;
    act(() => {
      handle = toast({ title: 'Dismissed early' });
    });
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      handle.dismiss();
    });
    // Only the removal timer remains — a lingering auto-dismiss timer would make this 2
    expect(vi.getTimerCount()).toBe(1);
  });

  it('should cancel timers for toasts evicted by the toast limit', () => {
    act(() => {
      toast({ title: 'Evicted' });
      toast({ title: 'Survivor' });
    });

    // Only the surviving toast's auto-dismiss timer remains
    expect(vi.getTimerCount()).toBe(1);
  });

  it('should not notify subscribers when dismissing an already-dismissed toast', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    let handle: ReturnType<typeof toast>;
    act(() => {
      handle = toast({ title: 'Once' });
      handle.dismiss();
    });
    const notifications = listener.mock.calls.length;

    act(() => {
      handle.dismiss();
    });
    expect(listener).toHaveBeenCalledTimes(notifications);

    unsubscribe();
  });
});
