import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardOffset } from './useKeyboardOffset';

// Mock useKeyboardVisible
vi.mock('../useKeyboardVisible', () => ({
  useKeyboardVisible: vi.fn(() => false),
}));

// Mock visualViewport
const mockVisualViewport = {
  height: 800,
  offsetTop: 0,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

describe('useKeyboardOffset', () => {
  let originalVisualViewport: typeof window.visualViewport;
  let originalInnerHeight: number;

  beforeEach(async () => {
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

    // Reset the mock
    const { useKeyboardVisible } = await import('../useKeyboardVisible');
    vi.mocked(useKeyboardVisible).mockReturnValue(false);
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

  it('returns isKeyboardVisible as false and keyboardOffset as 0 when keyboard is not visible', async () => {
    const { useKeyboardVisible } = await import('../useKeyboardVisible');
    vi.mocked(useKeyboardVisible).mockReturnValue(false);

    const { result } = renderHook(() => useKeyboardOffset());

    expect(result.current.isKeyboardVisible).toBe(false);
    expect(result.current.keyboardOffset).toBe(0);
  });

  it('returns isKeyboardVisible as true and calculates keyboardOffset when keyboard is visible', async () => {
    const { useKeyboardVisible } = await import('../useKeyboardVisible');
    vi.mocked(useKeyboardVisible).mockReturnValue(true);
    mockVisualViewport.height = 500; // Keyboard open
    mockVisualViewport.offsetTop = 0;

    const { result } = renderHook(() => useKeyboardOffset());

    expect(result.current.isKeyboardVisible).toBe(true);
    // 800 (innerHeight) - 500 (viewport height) - 0 (offsetTop) = 300
    expect(result.current.keyboardOffset).toBe(300);
  });

  it('adds event listeners to visualViewport when keyboard is visible', async () => {
    const { useKeyboardVisible } = await import('../useKeyboardVisible');
    vi.mocked(useKeyboardVisible).mockReturnValue(true);

    renderHook(() => useKeyboardOffset());

    expect(mockVisualViewport.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(mockVisualViewport.addEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
  });

  it('removes event listeners on unmount', async () => {
    const { useKeyboardVisible } = await import('../useKeyboardVisible');
    vi.mocked(useKeyboardVisible).mockReturnValue(true);

    const { unmount } = renderHook(() => useKeyboardOffset());

    unmount();

    expect(mockVisualViewport.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(mockVisualViewport.removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
  });

  it('handles missing visualViewport API gracefully', async () => {
    const { useKeyboardVisible } = await import('../useKeyboardVisible');
    vi.mocked(useKeyboardVisible).mockReturnValue(true);

    Object.defineProperty(window, 'visualViewport', {
      writable: true,
      configurable: true,
      value: undefined,
    });

    const { result } = renderHook(() => useKeyboardOffset());

    expect(result.current.isKeyboardVisible).toBe(true);
    expect(result.current.keyboardOffset).toBe(0);
    // Should not throw error
  });

  it('calculates offset with non-zero offsetTop', async () => {
    const { useKeyboardVisible } = await import('../useKeyboardVisible');
    vi.mocked(useKeyboardVisible).mockReturnValue(true);
    mockVisualViewport.height = 500;
    mockVisualViewport.offsetTop = 50;

    const { result } = renderHook(() => useKeyboardOffset());

    // 800 (innerHeight) - 500 (viewport height) - 50 (offsetTop) = 250
    expect(result.current.keyboardOffset).toBe(250);
  });

  it('resets offset to 0 when keyboard closes', async () => {
    const { useKeyboardVisible } = await import('../useKeyboardVisible');

    // Reset offsetTop for this test
    mockVisualViewport.offsetTop = 0;

    // Start with keyboard open
    vi.mocked(useKeyboardVisible).mockReturnValue(true);
    mockVisualViewport.height = 500;

    const { result, rerender } = renderHook(() => useKeyboardOffset());

    expect(result.current.keyboardOffset).toBe(300);

    // Close keyboard
    vi.mocked(useKeyboardVisible).mockReturnValue(false);
    mockVisualViewport.height = 800;
    rerender();

    expect(result.current.keyboardOffset).toBe(0);
  });

  it('applies offsetAdjustment to reduce the calculated offset', async () => {
    const { useKeyboardVisible } = await import('../useKeyboardVisible');
    vi.mocked(useKeyboardVisible).mockReturnValue(true);
    mockVisualViewport.height = 500; // Keyboard open
    mockVisualViewport.offsetTop = 0;

    // Without adjustment: 800 - 500 - 0 = 300
    // With adjustment of 100: 300 - 100 = 200
    const { result } = renderHook(() => useKeyboardOffset({ offsetAdjustment: 100 }));

    expect(result.current.keyboardOffset).toBe(200);
  });

  it('applies larger offsetAdjustment for centered dialogs', async () => {
    const { useKeyboardVisible } = await import('../useKeyboardVisible');
    vi.mocked(useKeyboardVisible).mockReturnValue(true);
    mockVisualViewport.height = 500;
    mockVisualViewport.offsetTop = 0;

    // With adjustment of 200: 300 - 200 = 100
    const { result } = renderHook(() => useKeyboardOffset({ offsetAdjustment: 200 }));

    expect(result.current.keyboardOffset).toBe(100);
  });

  it('ensures offset never goes below 0 with large adjustments', async () => {
    const { useKeyboardVisible } = await import('../useKeyboardVisible');
    vi.mocked(useKeyboardVisible).mockReturnValue(true);
    mockVisualViewport.height = 500;
    mockVisualViewport.offsetTop = 0;

    // Raw offset: 300, adjustment: 400, result should be clamped to 0
    const { result } = renderHook(() => useKeyboardOffset({ offsetAdjustment: 400 }));

    expect(result.current.keyboardOffset).toBe(0);
  });

  it('uses default offsetAdjustment of 0 when not provided', async () => {
    const { useKeyboardVisible } = await import('../useKeyboardVisible');
    vi.mocked(useKeyboardVisible).mockReturnValue(true);
    mockVisualViewport.height = 500;
    mockVisualViewport.offsetTop = 0;

    const { result } = renderHook(() => useKeyboardOffset());

    // Should return full offset: 800 - 500 - 0 = 300
    expect(result.current.keyboardOffset).toBe(300);
  });
});
