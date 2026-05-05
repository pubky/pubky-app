import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardVisible } from './useKeyboardVisible';

// Mock visualViewport
const mockVisualViewport = {
  height: 800,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

describe('useKeyboardVisible', () => {
  let originalVisualViewport: typeof window.visualViewport;
  let originalInnerHeight: number;

  beforeEach(() => {
    // Save original values
    originalVisualViewport = window.visualViewport;
    originalInnerHeight = window.innerHeight;

    // Mock window.innerHeight
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 800,
    });

    // Mock visualViewport
    Object.defineProperty(window, 'visualViewport', {
      writable: true,
      configurable: true,
      value: mockVisualViewport,
    });
  });

  afterEach(() => {
    // Restore original values
    Object.defineProperty(window, 'visualViewport', {
      writable: true,
      configurable: true,
      value: originalVisualViewport,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: originalInnerHeight,
    });
    vi.clearAllMocks();
  });

  it('returns false when keyboard is not visible', () => {
    mockVisualViewport.height = 800; // Same as innerHeight
    const { result } = renderHook(() => useKeyboardVisible());

    expect(result.current).toBe(false);
  });

  it('returns true when keyboard is visible (viewport difference > threshold)', () => {
    mockVisualViewport.height = 500; // 300px difference, default threshold is 150px
    const { result } = renderHook(() => useKeyboardVisible());

    expect(result.current).toBe(true);
  });

  it('returns false when viewport difference is below threshold', () => {
    mockVisualViewport.height = 750; // 50px difference, below default 150px threshold
    const { result } = renderHook(() => useKeyboardVisible());

    expect(result.current).toBe(false);
  });

  it('respects custom threshold', () => {
    mockVisualViewport.height = 700; // 100px difference
    const { result } = renderHook(() => useKeyboardVisible({ threshold: 80 }));

    // 100px difference > 80px threshold
    expect(result.current).toBe(true);
  });

  it('adds event listeners to visualViewport on mount', () => {
    renderHook(() => useKeyboardVisible());

    expect(mockVisualViewport.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(mockVisualViewport.addEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
  });

  it('removes event listeners on unmount', () => {
    const { unmount } = renderHook(() => useKeyboardVisible());

    unmount();

    expect(mockVisualViewport.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(mockVisualViewport.removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
  });

  it('handles missing visualViewport API gracefully', () => {
    Object.defineProperty(window, 'visualViewport', {
      writable: true,
      configurable: true,
      value: undefined,
    });

    const { result } = renderHook(() => useKeyboardVisible());

    expect(result.current).toBe(false);
    // Should not throw error
  });

  it('debounces viewport changes when opening', async () => {
    const { result, rerender } = renderHook(() => useKeyboardVisible({ debounceMs: 50 }));

    // Initial state
    expect(result.current).toBe(false);

    // Simulate viewport change
    mockVisualViewport.height = 400; // Keyboard opens

    // Get the resize handler that was registered
    const resizeHandler = mockVisualViewport.addEventListener.mock.calls.find((call) => call[0] === 'resize')?.[1];

    if (resizeHandler) {
      // Trigger resize
      resizeHandler();

      // Should not update immediately (debounced)
      expect(result.current).toBe(false);

      // Wait for debounce
      await waitFor(
        () => {
          rerender();
          expect(result.current).toBe(true);
        },
        { timeout: 200 },
      );
    }
  });

  it('updates immediately when keyboard closes (no debounce)', async () => {
    // Start with keyboard open
    mockVisualViewport.height = 400; // Keyboard is open
    const { result, rerender } = renderHook(() => useKeyboardVisible({ debounceMs: 50 }));

    // Initial state should show keyboard visible
    expect(result.current).toBe(true);

    // Simulate keyboard closing
    mockVisualViewport.height = 800; // Same as innerHeight - keyboard closed

    // Get the resize handler
    const resizeHandler = mockVisualViewport.addEventListener.mock.calls.find((call) => call[0] === 'resize')?.[1];

    if (resizeHandler) {
      // Trigger resize (keyboard closing)
      resizeHandler();
      rerender();

      // Should update immediately without debounce when closing
      expect(result.current).toBe(false);
    }
  });
});
