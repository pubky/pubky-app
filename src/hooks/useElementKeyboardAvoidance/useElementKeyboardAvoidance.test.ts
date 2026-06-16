import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useElementKeyboardAvoidance } from './useElementKeyboardAvoidance';

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

describe('useElementKeyboardAvoidance', () => {
  let originalInnerHeight: number;
  let originalVisualViewport: typeof window.visualViewport;
  let originalRequestAnimationFrame: typeof window.requestAnimationFrame;
  let originalCancelAnimationFrame: typeof window.cancelAnimationFrame;

  beforeEach(() => {
    originalInnerHeight = window.innerHeight;
    originalVisualViewport = window.visualViewport;
    originalRequestAnimationFrame = window.requestAnimationFrame;
    originalCancelAnimationFrame = window.cancelAnimationFrame;
    listeners.clear();
    mockVisualViewport.height = 800;
    mockVisualViewport.offsetTop = 0;
    vi.clearAllMocks();

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
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: vi.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      }),
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      writable: true,
      value: vi.fn(),
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
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: originalRequestAnimationFrame,
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      writable: true,
      value: originalCancelAnimationFrame,
    });
  });

  function createElementRef(bottom: number) {
    const element = document.createElement('div');
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      bottom,
      height: 200,
      left: 0,
      right: 300,
      top: bottom - 200,
      width: 300,
      x: 0,
      y: bottom - 200,
      toJSON: () => ({}),
    });

    return { current: element };
  }

  it('returns no transform when the keyboard is not visible', () => {
    const ref = createElementRef(700);

    const { result } = renderHook(() => useElementKeyboardAvoidance(ref));

    expect(result.current.isKeyboardVisible).toBe(false);
    expect(result.current.keyboardAvoidanceOffset).toBe(0);
    expect(result.current.keyboardAvoidanceStyle).toBeUndefined();
  });

  it('does not calculate or listen for viewport changes when disabled', () => {
    mockVisualViewport.height = 500;
    const ref = createElementRef(700);

    const { result } = renderHook(() => useElementKeyboardAvoidance(ref, { enabled: false }));

    expect(result.current.isKeyboardVisible).toBe(false);
    expect(result.current.keyboardAvoidanceOffset).toBe(0);
    expect(result.current.keyboardAvoidanceStyle).toBeUndefined();
    expect(mockVisualViewport.addEventListener).not.toHaveBeenCalled();
  });

  it('returns no transform when the keyboard is visible but the element does not overlap it', () => {
    mockVisualViewport.height = 500;
    const ref = createElementRef(450);

    const { result } = renderHook(() => useElementKeyboardAvoidance(ref));

    expect(result.current.isKeyboardVisible).toBe(true);
    expect(result.current.keyboardAvoidanceOffset).toBe(0);
    expect(result.current.keyboardAvoidanceStyle).toBeUndefined();
  });

  it('translates upward by the keyboard overlap plus margin', () => {
    mockVisualViewport.height = 500;
    const ref = createElementRef(700);

    const { result } = renderHook(() => useElementKeyboardAvoidance(ref));

    expect(result.current.isKeyboardVisible).toBe(true);
    expect(result.current.keyboardAvoidanceOffset).toBe(216);
    expect(result.current.keyboardAvoidanceStyle).toEqual({ transform: 'translateY(-216px)' });
  });

  it('handles visual viewport offsetTop', () => {
    mockVisualViewport.height = 500;
    mockVisualViewport.offsetTop = 50;
    const ref = createElementRef(700);

    const { result } = renderHook(() => useElementKeyboardAvoidance(ref));

    expect(result.current.keyboardAvoidanceOffset).toBe(166);
  });

  it('handles missing visualViewport gracefully', () => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    const ref = createElementRef(700);

    const { result } = renderHook(() => useElementKeyboardAvoidance(ref));

    expect(result.current.isKeyboardVisible).toBe(false);
    expect(result.current.keyboardAvoidanceOffset).toBe(0);
  });

  it('cleans up viewport listeners on unmount', () => {
    const ref = createElementRef(700);

    const { unmount } = renderHook(() => useElementKeyboardAvoidance(ref));
    unmount();

    expect(mockVisualViewport.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(mockVisualViewport.removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});
