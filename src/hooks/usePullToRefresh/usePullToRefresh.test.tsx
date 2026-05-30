import { useRef } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice/useIsTouchDevice';
import { usePullToRefresh } from './usePullToRefresh';
import type { UsePullToRefreshResult } from './usePullToRefresh.types';

// Mock useIsTouchDevice hook
vi.mock('@/hooks/useIsTouchDevice/useIsTouchDevice', () => ({
  useIsTouchDevice: vi.fn(() => true),
}));

/**
 * Helper to create a container element and a ref pointing to it.
 * The container is appended to document.body so event listeners work.
 */
function createContainer() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

/**
 * Wrapper that provides a containerRef pointing to the given element.
 */
function renderPullToRefresh(container: HTMLElement, options: Partial<Parameters<typeof usePullToRefresh>[0]> = {}) {
  const mockOnRefresh = options.onRefresh ?? vi.fn().mockResolvedValue(undefined);
  return renderHook(() => {
    const containerRef = useRef<HTMLElement>(container);
    return usePullToRefresh({
      containerRef,
      onRefresh: mockOnRefresh,
      ...options,
    });
  });
}

describe('usePullToRefresh', () => {
  const mockOnRefresh = vi.fn().mockResolvedValue(undefined);
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useIsTouchDevice).mockReturnValue(true);
    // Mock window.scrollY
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
    // Mock navigator.vibrate
    Object.defineProperty(navigator, 'vibrate', { value: vi.fn(), writable: true, configurable: true });
    container = createContainer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    container.remove();
  });

  describe('Initialization', () => {
    it('should initialize with idle state', () => {
      const { result } = renderPullToRefresh(container, { onRefresh: mockOnRefresh });

      expect(result.current.state).toBe('idle');
      expect(result.current.pullDistance).toBe(0);
    });

    it('should return all expected properties', () => {
      const { result } = renderPullToRefresh(container, { onRefresh: mockOnRefresh });

      const expectedKeys: (keyof UsePullToRefreshResult)[] = ['state', 'pullDistance'];

      expectedKeys.forEach((key) => {
        expect(result.current).toHaveProperty(key);
      });
    });
  });

  describe('Disabled state', () => {
    it('should not respond to touch events when disabled', () => {
      const { result } = renderPullToRefresh(container, {
        onRefresh: mockOnRefresh,
        disabled: true,
      });

      // Simulate touch start on the container
      act(() => {
        container.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [{ clientY: 100 } as Touch],
            bubbles: true,
          }),
        );
      });

      expect(result.current.state).toBe('idle');
      expect(result.current.pullDistance).toBe(0);
    });

    it('should not respond to touch events on non-touch devices', () => {
      vi.mocked(useIsTouchDevice).mockReturnValue(false);

      const { result } = renderPullToRefresh(container, { onRefresh: mockOnRefresh });

      // Simulate touch start on the container
      act(() => {
        container.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [{ clientY: 100 } as Touch],
            bubbles: true,
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

      const { result } = renderPullToRefresh(container, { onRefresh: mockOnRefresh });

      act(() => {
        container.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [{ clientY: 100 } as Touch],
            bubbles: true,
          }),
        );
      });

      act(() => {
        container.dispatchEvent(
          new TouchEvent('touchmove', {
            touches: [{ clientY: 200 } as Touch],
            cancelable: true,
            bubbles: true,
          }),
        );
      });

      expect(result.current.state).toBe('idle');
      expect(result.current.pullDistance).toBe(0);
    });

    it('should update state to pulling when pulling down from top', () => {
      const { result } = renderPullToRefresh(container, { onRefresh: mockOnRefresh });

      act(() => {
        container.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [{ clientY: 100 } as Touch],
            bubbles: true,
          }),
        );
      });

      act(() => {
        container.dispatchEvent(
          new TouchEvent('touchmove', {
            touches: [{ clientY: 150 } as Touch],
            cancelable: true,
            bubbles: true,
          }),
        );
      });

      expect(result.current.state).toBe('pulling');
      expect(result.current.pullDistance).toBeGreaterThan(0);
    });

    it('should not pull on upward swipe', () => {
      const { result } = renderPullToRefresh(container, { onRefresh: mockOnRefresh });

      act(() => {
        container.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [{ clientY: 200 } as Touch],
            bubbles: true,
          }),
        );
      });

      act(() => {
        container.dispatchEvent(
          new TouchEvent('touchmove', {
            touches: [{ clientY: 100 } as Touch],
            cancelable: true,
            bubbles: true,
          }),
        );
      });

      expect(result.current.state).toBe('idle');
      expect(result.current.pullDistance).toBe(0);
    });

    it('should change to ready state when threshold is reached', () => {
      const { result } = renderPullToRefresh(container, {
        onRefresh: mockOnRefresh,
        threshold: 50,
      });

      act(() => {
        container.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [{ clientY: 0 } as Touch],
            bubbles: true,
          }),
        );
      });

      // Pull far enough to exceed threshold (accounting for resistance)
      act(() => {
        container.dispatchEvent(
          new TouchEvent('touchmove', {
            touches: [{ clientY: 150 } as Touch],
            cancelable: true,
            bubbles: true,
          }),
        );
      });

      expect(result.current.state).toBe('ready');
    });

    it('should reset state on touch end when below threshold', () => {
      const { result } = renderPullToRefresh(container, {
        onRefresh: mockOnRefresh,
        threshold: 100,
      });

      act(() => {
        container.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [{ clientY: 100 } as Touch],
            bubbles: true,
          }),
        );
      });

      act(() => {
        container.dispatchEvent(
          new TouchEvent('touchmove', {
            touches: [{ clientY: 120 } as Touch],
            cancelable: true,
            bubbles: true,
          }),
        );
      });

      act(() => {
        container.dispatchEvent(new TouchEvent('touchend', { bubbles: true }));
      });

      expect(result.current.state).toBe('idle');
      expect(result.current.pullDistance).toBe(0);
      expect(mockOnRefresh).not.toHaveBeenCalled();
    });

    it('should trigger refresh when released above threshold', async () => {
      const { result } = renderPullToRefresh(container, {
        onRefresh: mockOnRefresh,
        threshold: 50,
      });

      act(() => {
        container.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [{ clientY: 0 } as Touch],
            bubbles: true,
          }),
        );
      });

      // Pull far enough to exceed threshold
      act(() => {
        container.dispatchEvent(
          new TouchEvent('touchmove', {
            touches: [{ clientY: 200 } as Touch],
            cancelable: true,
            bubbles: true,
          }),
        );
      });

      act(() => {
        container.dispatchEvent(new TouchEvent('touchend', { bubbles: true }));
      });

      expect(result.current.state).toBe('refreshing');
      expect(mockOnRefresh).toHaveBeenCalledTimes(1);

      // Wait for refresh to complete
      await waitFor(() => {
        expect(result.current.state).toBe('idle');
      });
    });

    it('should not respond to touch events outside the container', () => {
      const { result } = renderPullToRefresh(container, { onRefresh: mockOnRefresh });

      // Dispatch touch events on window (simulating a touch on a dialog overlay)
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

    it('should not respond to touch events on a sibling element', () => {
      const sibling = document.createElement('div');
      document.body.appendChild(sibling);

      const { result } = renderPullToRefresh(container, { onRefresh: mockOnRefresh });

      // Dispatch touch events on the sibling element
      act(() => {
        sibling.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [{ clientY: 100 } as Touch],
            bubbles: true,
          }),
        );
      });

      act(() => {
        sibling.dispatchEvent(
          new TouchEvent('touchmove', {
            touches: [{ clientY: 200 } as Touch],
            cancelable: true,
            bubbles: true,
          }),
        );
      });

      expect(result.current.state).toBe('idle');
      expect(result.current.pullDistance).toBe(0);

      sibling.remove();
    });
  });

  describe('Rubber band resistance', () => {
    it('should apply resistance to pull distance', () => {
      const { result } = renderPullToRefresh(container, {
        onRefresh: mockOnRefresh,
        maxPull: 120,
      });

      act(() => {
        container.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [{ clientY: 0 } as Touch],
            bubbles: true,
          }),
        );
      });

      // Pull a large distance
      act(() => {
        container.dispatchEvent(
          new TouchEvent('touchmove', {
            touches: [{ clientY: 500 } as Touch],
            cancelable: true,
            bubbles: true,
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

      renderPullToRefresh(container, {
        onRefresh: mockOnRefresh,
        threshold: 50,
      });

      act(() => {
        container.dispatchEvent(
          new TouchEvent('touchstart', {
            touches: [{ clientY: 0 } as Touch],
            bubbles: true,
          }),
        );
      });

      // Pull past threshold
      act(() => {
        container.dispatchEvent(
          new TouchEvent('touchmove', {
            touches: [{ clientY: 200 } as Touch],
            cancelable: true,
            bubbles: true,
          }),
        );
      });

      expect(vibrateMock).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should remove event listeners on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(container, 'removeEventListener');

      const { unmount } = renderPullToRefresh(container, { onRefresh: mockOnRefresh });

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('touchstart', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('touchmove', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('touchend', expect.any(Function));
    });
  });
});
