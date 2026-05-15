import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIsScrolledFromTop } from './useIsScrolledFromTop';

describe('useIsScrolledFromTop', () => {
  const originalScrollY = window.scrollY;
  const originalRAF = window.requestAnimationFrame;
  const originalCAF = window.cancelAnimationFrame;

  beforeEach(() => {
    // Reset scrollY
    Object.defineProperty(window, 'scrollY', {
      value: 0,
      writable: true,
      configurable: true,
    });

    // Mock requestAnimationFrame to execute callback synchronously for testing
    // We use setTimeout(0) to defer execution, allowing the rafRef assignment to complete first
    let rafId = 0;
    window.requestAnimationFrame = vi.fn((callback) => {
      const id = ++rafId;
      // Execute synchronously but after the assignment completes
      Promise.resolve().then(() => callback(performance.now()));
      return id;
    });
    window.cancelAnimationFrame = vi.fn();
  });

  afterEach(() => {
    // Restore original scrollY
    Object.defineProperty(window, 'scrollY', {
      value: originalScrollY,
      writable: true,
      configurable: true,
    });

    // Restore original RAF/CAF
    window.requestAnimationFrame = originalRAF;
    window.cancelAnimationFrame = originalCAF;
  });

  it('should return false when at top of page', () => {
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });

    const { result } = renderHook(() => useIsScrolledFromTop());

    expect(result.current).toBe(false);
  });

  it('should return false when scroll is below threshold', () => {
    Object.defineProperty(window, 'scrollY', { value: 50, writable: true, configurable: true });

    const { result } = renderHook(() => useIsScrolledFromTop(100));

    expect(result.current).toBe(false);
  });

  it('should return true when scroll exceeds default threshold', async () => {
    Object.defineProperty(window, 'scrollY', { value: 150, writable: true, configurable: true });

    const { result } = renderHook(() => useIsScrolledFromTop());

    // Simulate scroll event to trigger update
    await act(async () => {
      window.dispatchEvent(new Event('scroll'));
    });

    expect(result.current).toBe(true);
  });

  it('should use custom threshold', async () => {
    Object.defineProperty(window, 'scrollY', { value: 250, writable: true, configurable: true });

    const { result } = renderHook(() => useIsScrolledFromTop(200));

    await act(async () => {
      window.dispatchEvent(new Event('scroll'));
    });

    expect(result.current).toBe(true);
  });

  it('should return false when scroll equals threshold', async () => {
    Object.defineProperty(window, 'scrollY', { value: 100, writable: true, configurable: true });

    const { result } = renderHook(() => useIsScrolledFromTop(100));

    await act(async () => {
      window.dispatchEvent(new Event('scroll'));
    });

    expect(result.current).toBe(false);
  });

  it('should update when user scrolls down', async () => {
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });

    const { result } = renderHook(() => useIsScrolledFromTop(100));

    expect(result.current).toBe(false);

    // Simulate scrolling down
    await act(async () => {
      Object.defineProperty(window, 'scrollY', { value: 150, writable: true, configurable: true });
      window.dispatchEvent(new Event('scroll'));
    });

    expect(result.current).toBe(true);
  });

  it('should update when user scrolls back to top', async () => {
    Object.defineProperty(window, 'scrollY', { value: 150, writable: true, configurable: true });

    const { result } = renderHook(() => useIsScrolledFromTop(100));

    await act(async () => {
      window.dispatchEvent(new Event('scroll'));
    });

    expect(result.current).toBe(true);

    // Simulate scrolling back to top
    await act(async () => {
      Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
      window.dispatchEvent(new Event('scroll'));
    });

    expect(result.current).toBe(false);
  });

  it('should remove event listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useIsScrolledFromTop());

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function));

    removeEventListenerSpy.mockRestore();
  });
});
