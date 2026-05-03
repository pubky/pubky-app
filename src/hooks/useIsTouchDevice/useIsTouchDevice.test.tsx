import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIsTouchDevice } from './useIsTouchDevice';

// Mock functions
const mockAddEventListener = vi.fn();
const mockRemoveEventListener = vi.fn();
const mockMatchMedia = vi.fn();

// Store original values
let originalNavigator: Navigator;
let originalAddEventListener: typeof global.addEventListener;
let originalRemoveEventListener: typeof global.removeEventListener;
let originalMatchMedia: typeof global.matchMedia;

describe('useIsTouchDevice', () => {
  beforeEach(() => {
    // Store original values
    originalNavigator = global.navigator;
    originalAddEventListener = global.addEventListener;
    originalRemoveEventListener = global.removeEventListener;
    originalMatchMedia = global.matchMedia;

    // Clear all mocks
    vi.clearAllMocks();

    // Mock window methods
    global.addEventListener = mockAddEventListener;
    global.removeEventListener = mockRemoveEventListener;
    global.matchMedia = mockMatchMedia;

    // Reset navigator
    Object.defineProperty(global, 'navigator', {
      value: {
        maxTouchPoints: 0,
      },
      writable: true,
      configurable: true,
    });

    // Reset window properties
    Object.defineProperty(global, 'ontouchstart', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    // Default matchMedia mock
    mockMatchMedia.mockReturnValue({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
  });

  afterEach(() => {
    // Restore original values
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
    global.addEventListener = originalAddEventListener;
    global.removeEventListener = originalRemoveEventListener;
    global.matchMedia = originalMatchMedia;
  });

  it('should return false for non-touch devices', () => {
    const { result } = renderHook(() => useIsTouchDevice());

    expect(result.current).toBe(false);
  });

  it('should return true when ontouchstart is present', () => {
    Object.defineProperty(global, 'ontouchstart', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useIsTouchDevice());

    expect(result.current).toBe(true);
  });

  it('should return true when maxTouchPoints > 0', () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        maxTouchPoints: 5,
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useIsTouchDevice());

    expect(result.current).toBe(true);
  });

  it('should return true when matchMedia detects coarse pointer', () => {
    mockMatchMedia.mockReturnValue({
      matches: true,
      media: '(pointer: coarse)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    const { result } = renderHook(() => useIsTouchDevice());

    expect(result.current).toBe(true);
  });

  it('should handle multiple touch indicators', () => {
    Object.defineProperty(global, 'ontouchstart', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(global, 'navigator', {
      value: {
        maxTouchPoints: 3,
      },
      writable: true,
      configurable: true,
    });

    mockMatchMedia.mockReturnValue({
      matches: true,
      media: '(pointer: coarse)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    const { result } = renderHook(() => useIsTouchDevice());

    expect(result.current).toBe(true);
  });

  it('should add resize event listener on mount', () => {
    renderHook(() => useIsTouchDevice());

    expect(mockAddEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('should remove resize event listener on unmount', () => {
    const { unmount } = renderHook(() => useIsTouchDevice());

    unmount();

    expect(mockRemoveEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('should update when resize event is triggered', () => {
    let resizeCallback: (() => void) | null = null;

    mockAddEventListener.mockImplementation((event: string, callback: () => void) => {
      if (event === 'resize') {
        resizeCallback = callback;
      }
    });

    const { result } = renderHook(() => useIsTouchDevice());

    expect(result.current).toBe(false);

    // Simulate resize event that changes touch detection
    act(() => {
      Object.defineProperty(global, 'ontouchstart', {
        value: vi.fn(),
        writable: true,
        configurable: true,
      });
      if (resizeCallback) {
        resizeCallback();
      }
    });

    expect(result.current).toBe(true);
  });

  it('should handle missing matchMedia gracefully', () => {
    // Mock window without matchMedia
    Object.defineProperty(global, 'matchMedia', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useIsTouchDevice());

    expect(result.current).toBe(false);
  });

  it('should handle navigator.maxTouchPoints being undefined', () => {
    Object.defineProperty(global, 'navigator', {
      value: {},
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useIsTouchDevice());

    expect(result.current).toBe(false);
  });

  it('should be consistent across multiple hook calls', () => {
    const { result: result1 } = renderHook(() => useIsTouchDevice());
    const { result: result2 } = renderHook(() => useIsTouchDevice());

    expect(result1.current).toBe(result2.current);
  });
});
