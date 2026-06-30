import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardViewport } from './useKeyboardViewport';

const listeners = new Map<string, Set<EventListener>>();
const mockVisualViewport = {
  height: 800,
  offsetTop: 0,
  addEventListener: vi.fn((event: string, listener: EventListener) => {
    const eventListeners = listeners.get(event) ?? new Set<EventListener>();
    eventListeners.add(listener);
    listeners.set(event, eventListeners);
  }),
  removeEventListener: vi.fn((event: string, listener: EventListener) => {
    listeners.get(event)?.delete(listener);
  }),
};

function dispatchViewportEvent(eventName: string) {
  listeners.get(eventName)?.forEach((listener) => listener(new Event(eventName)));
}

describe('useKeyboardViewport', () => {
  let originalVisualViewport: typeof window.visualViewport;
  let originalInnerHeight: number;

  beforeEach(() => {
    originalVisualViewport = window.visualViewport;
    originalInnerHeight = window.innerHeight;
    listeners.clear();
    vi.clearAllMocks();

    mockVisualViewport.height = 800;
    mockVisualViewport.offsetTop = 0;

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 800,
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      writable: true,
      value: mockVisualViewport,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: originalInnerHeight,
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      writable: true,
      value: originalVisualViewport,
    });
  });

  it('returns hidden state when viewport is not reduced', () => {
    const { result } = renderHook(() => useKeyboardViewport());

    expect(result.current).toEqual({
      isKeyboardVisible: false,
      keyboardHeight: 0,
      keyboardTop: 800,
      viewportHeight: 800,
      viewportOffsetTop: 0,
    });
  });

  it('returns visible state with keyboard measurements', () => {
    mockVisualViewport.height = 500;

    const { result } = renderHook(() => useKeyboardViewport());

    expect(result.current).toEqual({
      isKeyboardVisible: true,
      keyboardHeight: 300,
      keyboardTop: 500,
      viewportHeight: 500,
      viewportOffsetTop: 0,
    });
  });

  it('accounts for visual viewport offsetTop', () => {
    mockVisualViewport.height = 500;
    mockVisualViewport.offsetTop = 50;

    const { result } = renderHook(() => useKeyboardViewport());

    expect(result.current.keyboardHeight).toBe(250);
    expect(result.current.keyboardTop).toBe(550);
    expect(result.current.viewportOffsetTop).toBe(50);
  });

  it('respects a custom threshold', () => {
    mockVisualViewport.height = 700;

    const { result } = renderHook(() => useKeyboardViewport({ threshold: 80 }));

    expect(result.current.isKeyboardVisible).toBe(true);
    expect(result.current.keyboardHeight).toBe(100);
  });

  it('does not measure or listen when disabled', () => {
    mockVisualViewport.height = 500;

    const { result } = renderHook(() => useKeyboardViewport({ enabled: false }));

    expect(result.current.isKeyboardVisible).toBe(false);
    expect(result.current.keyboardHeight).toBe(0);
    expect(mockVisualViewport.addEventListener).not.toHaveBeenCalled();
  });

  it('debounces viewport updates while opening', async () => {
    const { result } = renderHook(() => useKeyboardViewport({ debounceMs: 50 }));

    expect(result.current.isKeyboardVisible).toBe(false);

    act(() => {
      mockVisualViewport.height = 400;
      dispatchViewportEvent('resize');
    });

    expect(result.current.isKeyboardVisible).toBe(false);

    await waitFor(() => {
      expect(result.current.isKeyboardVisible).toBe(true);
    });
  });

  it('updates immediately when keyboard closes', () => {
    mockVisualViewport.height = 400;
    const { result } = renderHook(() => useKeyboardViewport({ debounceMs: 50 }));

    expect(result.current.isKeyboardVisible).toBe(true);

    act(() => {
      mockVisualViewport.height = 800;
      dispatchViewportEvent('resize');
    });

    expect(result.current.isKeyboardVisible).toBe(false);
    expect(result.current.keyboardHeight).toBe(0);
  });

  it('handles missing visualViewport gracefully', () => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      writable: true,
      value: undefined,
    });

    const { result } = renderHook(() => useKeyboardViewport());

    expect(result.current.isKeyboardVisible).toBe(false);
    expect(result.current.keyboardHeight).toBe(0);
    expect(result.current.keyboardTop).toBe(800);
  });

  it('cleans up viewport listeners on unmount', () => {
    const { unmount } = renderHook(() => useKeyboardViewport());

    unmount();

    expect(mockVisualViewport.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(mockVisualViewport.removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});
