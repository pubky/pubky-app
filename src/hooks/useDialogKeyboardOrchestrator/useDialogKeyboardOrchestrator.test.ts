import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeyboardViewportState } from '../useKeyboardViewport/useKeyboardViewport.types';
import { useDialogKeyboardOrchestrator } from './useDialogKeyboardOrchestrator';

const mockUseKeyboardViewport = vi.hoisted(() =>
  vi.fn<(options?: { enabled?: boolean; threshold?: number }) => KeyboardViewportState>(() => ({
    isKeyboardVisible: false,
    keyboardHeight: 0,
    keyboardTop: 800,
    viewportHeight: 800,
    viewportOffsetTop: 0,
  })),
);

vi.mock('../useKeyboardViewport/useKeyboardViewport', () => ({
  useKeyboardViewport: mockUseKeyboardViewport,
}));

function createRect(top: number, bottom: number): DOMRect {
  return {
    bottom,
    height: bottom - top,
    left: 0,
    right: 320,
    top,
    width: 320,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
}

function createDialogContent() {
  const content = document.createElement('div');
  const input = document.createElement('textarea');
  const scrollTo = vi.fn();

  content.appendChild(input);
  document.body.appendChild(content);
  Object.defineProperty(content, 'scrollTo', {
    configurable: true,
    value: scrollTo,
  });
  Object.defineProperty(content, 'scrollTop', {
    configurable: true,
    writable: true,
    value: 20,
  });

  return { content, input, scrollTo };
}

describe('useDialogKeyboardOrchestrator', () => {
  let originalRequestAnimationFrame: typeof window.requestAnimationFrame;
  let originalCancelAnimationFrame: typeof window.cancelAnimationFrame;
  let originalResizeObserver: typeof ResizeObserver;
  let resizeCallback: ResizeObserverCallback | null;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    resizeCallback = null;
    originalRequestAnimationFrame = window.requestAnimationFrame;
    originalCancelAnimationFrame = window.cancelAnimationFrame;
    originalResizeObserver = globalThis.ResizeObserver;

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

    class TestResizeObserver implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }

      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }

    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: TestResizeObserver,
    });
    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: TestResizeObserver,
    });

    mockUseKeyboardViewport.mockReturnValue({
      isKeyboardVisible: false,
      keyboardHeight: 0,
      keyboardTop: 800,
      viewportHeight: 800,
      viewportOffsetTop: 0,
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
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
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: originalResizeObserver,
    });
    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: originalResizeObserver,
    });
  });

  it('does nothing when disabled', () => {
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
    const { content } = createDialogContent();
    const contentRef = { current: content };

    const { result } = renderHook(() => useDialogKeyboardOrchestrator(contentRef, { enabled: false }));

    expect(mockUseKeyboardViewport).toHaveBeenCalledWith({ enabled: false, threshold: 150 });
    expect(result.current.isKeyboardVisible).toBe(false);
    expect(result.current.spacerHeight).toBe(0);
    expect(result.current.contentStyle).toBeUndefined();
    expect(addEventListenerSpy).not.toHaveBeenCalledWith('focusin', expect.any(Function), true);
  });

  it('returns spacer styles instead of a transform when focused content overlaps the keyboard', async () => {
    mockUseKeyboardViewport.mockReturnValue({
      isKeyboardVisible: true,
      keyboardHeight: 300,
      keyboardTop: 500,
      viewportHeight: 500,
      viewportOffsetTop: 0,
    });
    const { content, input } = createDialogContent();
    const contentRef = { current: content };
    vi.spyOn(content, 'getBoundingClientRect').mockReturnValue(createRect(100, 780));
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue(createRect(700, 740));
    input.focus();

    const { result } = renderHook(() => useDialogKeyboardOrchestrator(contentRef));

    await waitFor(() => {
      expect(result.current.spacerHeight).toBe(304);
    });
    expect(result.current.contentStyle).toEqual({ scrollPaddingBottom: '328px' });
    expect(result.current.contentStyle).not.toHaveProperty('transform');
  });

  it('scrolls the focused element into the dialog visible area', async () => {
    mockUseKeyboardViewport.mockReturnValue({
      isKeyboardVisible: true,
      keyboardHeight: 300,
      keyboardTop: 500,
      viewportHeight: 500,
      viewportOffsetTop: 0,
    });
    const { content, input, scrollTo } = createDialogContent();
    const contentRef = { current: content };
    vi.spyOn(content, 'getBoundingClientRect').mockReturnValue(createRect(100, 780));
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue(createRect(700, 740));
    input.focus();

    renderHook(() => useDialogKeyboardOrchestrator(contentRef));

    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith({ top: 284, behavior: 'auto' });
    });
  });

  it('does not add a spacer for focus outside the dialog', () => {
    mockUseKeyboardViewport.mockReturnValue({
      isKeyboardVisible: true,
      keyboardHeight: 300,
      keyboardTop: 500,
      viewportHeight: 500,
      viewportOffsetTop: 0,
    });
    const { content } = createDialogContent();
    const contentRef = { current: content };
    const outsideInput = document.createElement('input');
    document.body.appendChild(outsideInput);
    vi.spyOn(content, 'getBoundingClientRect').mockReturnValue(createRect(100, 780));
    vi.spyOn(outsideInput, 'getBoundingClientRect').mockReturnValue(createRect(700, 740));
    outsideInput.focus();

    const { result } = renderHook(() => useDialogKeyboardOrchestrator(contentRef));

    expect(result.current.spacerHeight).toBe(0);
    expect(result.current.contentStyle).toBeUndefined();
  });

  it('recalculates spacer height when the dialog content resizes', async () => {
    mockUseKeyboardViewport.mockReturnValue({
      isKeyboardVisible: true,
      keyboardHeight: 300,
      keyboardTop: 500,
      viewportHeight: 500,
      viewportOffsetTop: 0,
    });
    const { content, input } = createDialogContent();
    const contentRef = { current: content };
    const contentRectSpy = vi
      .spyOn(content, 'getBoundingClientRect')
      .mockReturnValueOnce(createRect(100, 780))
      .mockReturnValue(createRect(100, 650));
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue(createRect(560, 620));
    input.focus();

    const { result } = renderHook(() => useDialogKeyboardOrchestrator(contentRef));

    await waitFor(() => {
      expect(result.current.spacerHeight).toBe(304);
    });

    act(() => {
      resizeCallback?.([], {} as ResizeObserver);
    });

    await waitFor(() => {
      expect(result.current.spacerHeight).toBe(174);
    });
    expect(contentRectSpy).toHaveBeenCalled();
  });

  it('cleans up document listeners on unmount', () => {
    mockUseKeyboardViewport.mockReturnValue({
      isKeyboardVisible: true,
      keyboardHeight: 300,
      keyboardTop: 500,
      viewportHeight: 500,
      viewportOffsetTop: 0,
    });
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
    const { content, input } = createDialogContent();
    const contentRef = { current: content };
    vi.spyOn(content, 'getBoundingClientRect').mockReturnValue(createRect(100, 780));
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue(createRect(700, 740));
    input.focus();

    const { unmount } = renderHook(() => useDialogKeyboardOrchestrator(contentRef));
    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('focusin', expect.any(Function), true);
    expect(removeEventListenerSpy).toHaveBeenCalledWith('focusout', expect.any(Function), true);
    expect(removeEventListenerSpy).toHaveBeenCalledWith('input', expect.any(Function), true);
  });
});
