import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePullToRefresh } from './usePullToRefresh';
import type { UsePullToRefreshResult } from './usePullToRefresh.types';

// Mock useIsTouchDevice hook
vi.mock('@/hooks', async () => {
  const actual = await vi.importActual('@/hooks');
  return {
    ...actual,
    useIsTouchDevice: vi.fn(() => true),
  };
});

import * as Hooks from '@/hooks';

describe('usePullToRefresh', () => {
  const mockOnRefresh = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Hooks.useIsTouchDevice).mockReturnValue(true);
    // Mock window.scrollY
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
    // Mock navigator.vibrate
    Object.defineProperty(navigator, 'vibrate', { value: vi.fn(), writable: true, configurable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with idle state', () => {
      const { result } = renderHook(() =>
        usePullToRefresh({
          onRefresh: mockOnRefresh,
        }),
      );

      expect(result.current.state).toBe('idle');
      expect(result.current.pullDistance).toBe(0);
    });

    it('should return all expected properties', () => {
      const { result } = renderHook(() =>
        usePullToRefresh({
          onRefresh: mockOnRefresh,
        }),
      );

      const expectedKeys: (keyof UsePullToRefreshResult)[] = ['state', 'pullDistance'];

      expectedKeys.forEach((key) => {
        expect(result.current).toHaveProperty(key);
      });
    });
  });

  describe('Disabled state', () => {
    it('should not respond to touch events when disabled', () => {
      const { result } = renderHook(() =>
        usePullToRefresh({
          onRefresh: mockOnRefresh,
          disabled: true,
        }),
      );

      // Simulate touch start
      act(() => {
        window.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [{ clientY: 100 } as Touch],
          }),
        );
      });

      expect(result.current.state).toBe('idle');
      expect(result.current.pullDistance).toBe(0);
    });

    it('should not respond to touch events on non-touch devices', () => {
      vi.mocked(Hooks.useIsTouchDevice).mockReturnValue(false);

      const { result } = renderHook(() =>
        usePullToRefresh({
          onRefresh: mockOnRefresh,
        }),
      );

      // Simulate touch start
      act(() => {
        window.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [{ clientY: 100 } as Touch],
          }),
        );
      });

      expect(result.current.state).toBe('idle');
    });
  });

  describe('Touch interactions', () => {
    it('should not start pulling when not at top of page', () => {
      // Set scrollY to a non-zero value
      Object.defineProperty(window, 'scrollY', { value: 100, writable: true, configurable: true });

      const { result } = renderHook(() =>
        usePullToRefresh({
          onRefresh: mockOnRefresh,
        }),
      );

      act(() => {
        window.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [{ clientY: 100 } as Touch],
          }),
        );
      });

      act(() => {
        window.dispatchEvent(
          new TouchEvent('touchmove', {
            touches: [{ clientY: 200 } as Touch],
            cancelable: true,
          }),
        );
      });

      expect(result.current.state).toBe('idle');
      expect(result.current.pullDistance).toBe(0);
    });

    it('should update state to pulling when pulling down from top', () => {
      const { result } = renderHook(() =>
        usePullToRefresh({
          onRefresh: mockOnRefresh,
        }),
      );

      act(() => {
        window.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [{ clientY: 100 } as Touch],
          }),
        );
      });

      act(() => {
        window.dispatchEvent(
          new TouchEvent('touchmove', {
            touches: [{ clientY: 150 } as Touch],
            cancelable: true,
          }),
        );
      });

      expect(result.current.state).toBe('pulling');
      expect(result.current.pullDistance).toBeGreaterThan(0);
    });

    it('should not pull on upward swipe', () => {
      const { result } = renderHook(() =>
        usePullToRefresh({
          onRefresh: mockOnRefresh,
        }),
      );

      act(() => {
        window.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [{ clientY: 200 } as Touch],
          }),
        );
      });

      act(() => {
        window.dispatchEvent(
          new TouchEvent('touchmove', {
            touches: [{ clientY: 100 } as Touch],
            cancelable: true,
          }),
        );
      });

      expect(result.current.state).toBe('idle');
      expect(result.current.pullDistance).toBe(0);
    });

    it('should change to ready state when threshold is reached', () => {
      const { result } = renderHook(() =>
        usePullToRefresh({
          onRefresh: mockOnRefresh,
          threshold: 50,
        }),
      );

      act(() => {
        window.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [{ clientY: 0 } as Touch],
          }),
        );
      });

      // Pull far enough to exceed threshold (accounting for resistance)
      act(() => {
        window.dispatchEvent(
          new TouchEvent('touchmove', {
            touches: [{ clientY: 150 } as Touch],
            cancelable: true,
          }),
        );
      });

      expect(result.current.state).toBe('ready');
    });

    it('should reset state on touch end when below threshold', () => {
      const { result } = renderHook(() =>
        usePullToRefresh({
          onRefresh: mockOnRefresh,
          threshold: 100,
        }),
      );

      act(() => {
        window.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [{ clientY: 100 } as Touch],
          }),
        );
      });

      act(() => {
        window.dispatchEvent(
          new TouchEvent('touchmove', {
            touches: [{ clientY: 120 } as Touch],
            cancelable: true,
          }),
        );
      });

      act(() => {
        window.dispatchEvent(new TouchEvent('touchend', {}));
      });

      expect(result.current.state).toBe('idle');
      expect(result.current.pullDistance).toBe(0);
      expect(mockOnRefresh).not.toHaveBeenCalled();
    });

    it('should trigger refresh when released above threshold', async () => {
      const { result } = renderHook(() =>
        usePullToRefresh({
          onRefresh: mockOnRefresh,
          threshold: 50,
        }),
      );

      act(() => {
        window.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [{ clientY: 0 } as Touch],
          }),
        );
      });

      // Pull far enough to exceed threshold
      act(() => {
        window.dispatchEvent(
          new TouchEvent('touchmove', {
            touches: [{ clientY: 200 } as Touch],
            cancelable: true,
          }),
        );
      });

      act(() => {
        window.dispatchEvent(new TouchEvent('touchend', {}));
      });

      expect(result.current.state).toBe('refreshing');
      expect(mockOnRefresh).toHaveBeenCalledTimes(1);

      // Wait for refresh to complete
      await waitFor(() => {
        expect(result.current.state).toBe('idle');
      });
    });
  });

  describe('Rubber band resistance', () => {
    it('should apply resistance to pull distance', () => {
      const { result } = renderHook(() =>
        usePullToRefresh({
          onRefresh: mockOnRefresh,
          maxPull: 120,
        }),
      );

      act(() => {
        window.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [{ clientY: 0 } as Touch],
          }),
        );
      });

      // Pull a large distance
      act(() => {
        window.dispatchEvent(
          new TouchEvent('touchmove', {
            touches: [{ clientY: 500 } as Touch],
            cancelable: true,
          }),
        );
      });

      // Pull distance should be capped by maxPull due to resistance
      expect(result.current.pullDistance).toBeLessThanOrEqual(120);
      expect(result.current.pullDistance).toBeGreaterThan(0);
    });
  });

  describe('Haptic feedback', () => {
    it('should trigger haptic feedback when crossing threshold', () => {
      const vibrateMock = vi.fn();
      Object.defineProperty(navigator, 'vibrate', { value: vibrateMock, writable: true, configurable: true });

      renderHook(() =>
        usePullToRefresh({
          onRefresh: mockOnRefresh,
          threshold: 50,
        }),
      );

      act(() => {
        window.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [{ clientY: 0 } as Touch],
          }),
        );
      });

      // Pull past threshold
      act(() => {
        window.dispatchEvent(
          new TouchEvent('touchmove', {
            touches: [{ clientY: 200 } as Touch],
            cancelable: true,
          }),
        );
      });

      expect(vibrateMock).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should remove event listeners on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = renderHook(() =>
        usePullToRefresh({
          onRefresh: mockOnRefresh,
        }),
      );

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('touchstart', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('touchmove', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('touchend', expect.any(Function));
    });
  });
});
