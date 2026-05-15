import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useViewportObserver } from './useViewportObserver';

// Mock IntersectionObserver
let intersectionCallback: ((entries: IntersectionObserverEntry[]) => void) | null = null;
const mockObserve = vi.fn();
const mockUnobserve = vi.fn();
const mockDisconnect = vi.fn();

class MockIntersectionObserver {
  constructor(callback: (entries: IntersectionObserverEntry[]) => void) {
    intersectionCallback = callback;
  }

  observe = mockObserve;
  unobserve = mockUnobserve;
  disconnect = mockDisconnect;
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: MockIntersectionObserver,
});

Object.defineProperty(global, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: MockIntersectionObserver,
});

// Helper to simulate visibility changes
function simulateVisibility(isIntersecting: boolean) {
  if (intersectionCallback) {
    intersectionCallback([{ isIntersecting } as IntersectionObserverEntry]);
  }
}

describe('useViewportObserver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    intersectionCallback = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
    intersectionCallback = null;
  });

  describe('Initialization', () => {
    it('should return ref callback and visibility state', () => {
      const { result } = renderHook(() => useViewportObserver());

      expect(result.current.ref).toBeDefined();
      expect(typeof result.current.ref).toBe('function');
      expect(result.current.isVisible).toBe(false);
    });

    it('should not observe when no element is attached', () => {
      renderHook(() => useViewportObserver());

      expect(mockObserve).not.toHaveBeenCalled();
    });

    it('should observe when element is attached via ref', () => {
      const { result } = renderHook(() => useViewportObserver());

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      expect(mockObserve).toHaveBeenCalledWith(mockElement);
    });
  });

  describe('Visibility Detection', () => {
    it('should update isVisible to true when element enters viewport', () => {
      const { result } = renderHook(() => useViewportObserver());

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      expect(result.current.isVisible).toBe(false);

      act(() => {
        simulateVisibility(true);
      });

      expect(result.current.isVisible).toBe(true);
    });

    it('should update isVisible to false when element leaves viewport', () => {
      const { result } = renderHook(() => useViewportObserver());

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      act(() => {
        simulateVisibility(true);
      });
      expect(result.current.isVisible).toBe(true);

      act(() => {
        simulateVisibility(false);
      });
      expect(result.current.isVisible).toBe(false);
    });

    it('should handle multiple visibility changes', () => {
      const { result } = renderHook(() => useViewportObserver());

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      // Toggle visibility multiple times
      act(() => {
        simulateVisibility(true);
      });
      expect(result.current.isVisible).toBe(true);

      act(() => {
        simulateVisibility(false);
      });
      expect(result.current.isVisible).toBe(false);

      act(() => {
        simulateVisibility(true);
      });
      expect(result.current.isVisible).toBe(true);
    });
  });

  describe('Enabled Option', () => {
    it('should not observe when enabled is false', () => {
      const { result } = renderHook(() => useViewportObserver({ enabled: false }));

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      expect(mockObserve).not.toHaveBeenCalled();
      expect(result.current.isVisible).toBe(false);
    });

    it('should start observing when enabled changes from false to true', () => {
      const { result, rerender } = renderHook(({ enabled }) => useViewportObserver({ enabled }), {
        initialProps: { enabled: false },
      });

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      expect(mockObserve).not.toHaveBeenCalled();

      rerender({ enabled: true });

      expect(mockObserve).toHaveBeenCalledWith(mockElement);
    });

    it('should stop observing and reset visibility when enabled changes to false', () => {
      const { result, rerender } = renderHook(({ enabled }) => useViewportObserver({ enabled }), {
        initialProps: { enabled: true },
      });

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      act(() => {
        simulateVisibility(true);
      });
      expect(result.current.isVisible).toBe(true);

      rerender({ enabled: false });

      expect(mockDisconnect).toHaveBeenCalled();
      expect(result.current.isVisible).toBe(false);
    });
  });

  describe('Configuration Options', () => {
    it('should use default options when none provided', () => {
      const { result } = renderHook(() => useViewportObserver());

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      expect(mockObserve).toHaveBeenCalled();
    });

    it('should accept custom rootMargin', () => {
      const { result } = renderHook(() => useViewportObserver({ rootMargin: '100px 0px' }));

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      expect(mockObserve).toHaveBeenCalled();
    });

    it('should accept custom threshold', () => {
      const { result } = renderHook(() => useViewportObserver({ threshold: 0.5 }));

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      expect(mockObserve).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should disconnect observer on unmount', () => {
      const { result, unmount } = renderHook(() => useViewportObserver());

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      unmount();

      expect(mockDisconnect).toHaveBeenCalled();
    });

    it('should disconnect and reconnect when element changes', () => {
      const { result } = renderHook(() => useViewportObserver());

      const mockElement1 = document.createElement('div');
      act(() => {
        result.current.ref(mockElement1);
      });

      expect(mockObserve).toHaveBeenCalledWith(mockElement1);

      mockDisconnect.mockClear();
      mockObserve.mockClear();

      const mockElement2 = document.createElement('div');
      act(() => {
        result.current.ref(mockElement2);
      });

      expect(mockDisconnect).toHaveBeenCalled();
      expect(mockObserve).toHaveBeenCalledWith(mockElement2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle ref being set to null', () => {
      const { result } = renderHook(() => useViewportObserver());

      const mockElement = document.createElement('div');
      act(() => {
        result.current.ref(mockElement);
      });

      act(() => {
        simulateVisibility(true);
      });
      expect(result.current.isVisible).toBe(true);

      mockDisconnect.mockClear();

      act(() => {
        result.current.ref(null);
      });

      expect(mockDisconnect).toHaveBeenCalled();
      expect(result.current.isVisible).toBe(false);
    });

    it('should have stable ref callback across renders', () => {
      const { result, rerender } = renderHook(() => useViewportObserver());

      const refCallback1 = result.current.ref;
      rerender();
      const refCallback2 = result.current.ref;

      expect(refCallback1).toBe(refCallback2);
    });
  });
});
