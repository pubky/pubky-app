import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeyboardViewportState } from '../useKeyboardViewport/useKeyboardViewport.types';
import { useKeyboardOffset } from './useKeyboardOffset';

const mockUseKeyboardViewport = vi.hoisted(() =>
  vi.fn<() => KeyboardViewportState>(() => ({
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

describe('useKeyboardOffset', () => {
  beforeEach(() => {
    mockUseKeyboardViewport.mockReturnValue({
      isKeyboardVisible: false,
      keyboardHeight: 0,
      keyboardTop: 800,
      viewportHeight: 800,
      viewportOffsetTop: 0,
    });
  });

  it('returns isKeyboardVisible as false and keyboardOffset as 0 when keyboard is not visible', () => {
    const { result } = renderHook(() => useKeyboardOffset());

    expect(result.current.isKeyboardVisible).toBe(false);
    expect(result.current.keyboardOffset).toBe(0);
  });

  it('returns the keyboard height when keyboard is visible', () => {
    mockUseKeyboardViewport.mockReturnValue({
      isKeyboardVisible: true,
      keyboardHeight: 300,
      keyboardTop: 500,
      viewportHeight: 500,
      viewportOffsetTop: 0,
    });

    const { result } = renderHook(() => useKeyboardOffset());

    expect(result.current.isKeyboardVisible).toBe(true);
    expect(result.current.keyboardOffset).toBe(300);
  });

  it('applies offsetAdjustment to reduce the calculated offset', () => {
    mockUseKeyboardViewport.mockReturnValue({
      isKeyboardVisible: true,
      keyboardHeight: 300,
      keyboardTop: 500,
      viewportHeight: 500,
      viewportOffsetTop: 0,
    });

    const { result } = renderHook(() => useKeyboardOffset({ offsetAdjustment: 100 }));

    expect(result.current.keyboardOffset).toBe(200);
  });

  it('ensures offset never goes below 0 with large adjustments', () => {
    mockUseKeyboardViewport.mockReturnValue({
      isKeyboardVisible: true,
      keyboardHeight: 300,
      keyboardTop: 500,
      viewportHeight: 500,
      viewportOffsetTop: 0,
    });

    const { result } = renderHook(() => useKeyboardOffset({ offsetAdjustment: 400 }));

    expect(result.current.keyboardOffset).toBe(0);
  });
});
