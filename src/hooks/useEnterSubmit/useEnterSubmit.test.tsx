import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { mockKeyboardEvent } from '@/test-utils/react-events';
import { useEnterSubmit } from './useEnterSubmit';

describe('useEnterSubmit', () => {
  const createKeyboardEvent = (
    key: string,
    isComposing: boolean = false,
    shiftKey: boolean = false,
    ctrlKey: boolean = false,
    metaKey: boolean = false,
  ): React.KeyboardEvent =>
    mockKeyboardEvent({
      key,
      shiftKey,
      ctrlKey,
      metaKey,
      nativeEvent: { isComposing } as KeyboardEvent,
      preventDefault: vi.fn(),
    });

  it('calls onSubmit when Enter is pressed and form is valid', () => {
    const mockOnSubmit = vi.fn();
    const mockIsValid = vi.fn(() => true);

    const { result } = renderHook(() => useEnterSubmit(mockIsValid, mockOnSubmit));

    act(() => {
      result.current(createKeyboardEvent('Enter'));
    });

    expect(mockOnSubmit).toHaveBeenCalledTimes(1);
  });

  it('does not call onSubmit when form is invalid', () => {
    const mockOnSubmit = vi.fn();
    const mockIsValid = vi.fn(() => false);

    const { result } = renderHook(() => useEnterSubmit(mockIsValid, mockOnSubmit));

    act(() => {
      result.current(createKeyboardEvent('Enter'));
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('does not call onSubmit when key is not Enter', () => {
    const mockOnSubmit = vi.fn();
    const mockIsValid = vi.fn(() => true);

    const { result } = renderHook(() => useEnterSubmit(mockIsValid, mockOnSubmit));

    act(() => {
      result.current(createKeyboardEvent('Space'));
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('guards against IME composition', () => {
    const mockOnSubmit = vi.fn();
    const mockIsValid = vi.fn(() => true);

    const { result } = renderHook(() => useEnterSubmit(mockIsValid, mockOnSubmit));

    act(() => {
      result.current(createKeyboardEvent('Enter', true));
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('guards against double-submit for async functions', async () => {
    let resolveSubmit: () => void;
    const submitPromise = new Promise<void>((resolve) => {
      resolveSubmit = resolve;
    });

    const mockOnSubmit = vi.fn(() => submitPromise);
    const mockIsValid = vi.fn(() => true);

    const { result } = renderHook(() => useEnterSubmit(mockIsValid, mockOnSubmit));

    // First Enter press
    act(() => {
      result.current(createKeyboardEvent('Enter'));
    });

    // Second Enter press while first is still pending
    act(() => {
      result.current(createKeyboardEvent('Enter'));
    });

    expect(mockOnSubmit).toHaveBeenCalledTimes(1);

    // Resolve the promise
    await act(async () => {
      resolveSubmit!();
      await submitPromise;
    });

    // Now a third press should work
    act(() => {
      result.current(createKeyboardEvent('Enter'));
    });

    expect(mockOnSubmit).toHaveBeenCalledTimes(2);
  });

  it('prevents default behavior when Enter is pressed with valid form', () => {
    const mockOnSubmit = vi.fn();
    const mockIsValid = vi.fn(() => true);
    const mockPreventDefault = vi.fn();

    const { result } = renderHook(() => useEnterSubmit(mockIsValid, mockOnSubmit));

    const event = createKeyboardEvent('Enter');
    event.preventDefault = mockPreventDefault;

    act(() => {
      result.current(event);
    });

    expect(mockPreventDefault).toHaveBeenCalledTimes(1);
  });

  it('does not prevent default when form is invalid', () => {
    const mockOnSubmit = vi.fn();
    const mockIsValid = vi.fn(() => false);
    const mockPreventDefault = vi.fn();

    const { result } = renderHook(() => useEnterSubmit(mockIsValid, mockOnSubmit));

    const event = createKeyboardEvent('Enter');
    event.preventDefault = mockPreventDefault;

    act(() => {
      result.current(event);
    });

    expect(mockPreventDefault).not.toHaveBeenCalled();
  });

  it('works with synchronous submit functions', async () => {
    const mockOnSubmit = vi.fn(); // Synchronous function
    const mockIsValid = vi.fn(() => true);

    const { result } = renderHook(() => useEnterSubmit(mockIsValid, mockOnSubmit));

    // First press
    act(() => {
      result.current(createKeyboardEvent('Enter'));
    });

    expect(mockOnSubmit).toHaveBeenCalledTimes(1);

    // Wait for Promise.resolve to complete
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Second press should also work after promise resolves
    act(() => {
      result.current(createKeyboardEvent('Enter'));
    });

    expect(mockOnSubmit).toHaveBeenCalledTimes(2);
  });

  it('ignores Shift+Enter by default', () => {
    const mockOnSubmit = vi.fn();
    const mockIsValid = vi.fn(() => true);

    const { result } = renderHook(() => useEnterSubmit(mockIsValid, mockOnSubmit));

    act(() => {
      result.current(createKeyboardEvent('Enter', false, true));
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('allows Shift+Enter when ignoreShiftEnter is false', () => {
    const mockOnSubmit = vi.fn();
    const mockIsValid = vi.fn(() => true);

    const { result } = renderHook(() => useEnterSubmit(mockIsValid, mockOnSubmit, { ignoreShiftEnter: false }));

    act(() => {
      result.current(createKeyboardEvent('Enter', false, true));
    });

    expect(mockOnSubmit).toHaveBeenCalledTimes(1);
  });

  it('allows plain Enter even when ignoreShiftEnter is true', () => {
    const mockOnSubmit = vi.fn();
    const mockIsValid = vi.fn(() => true);

    const { result } = renderHook(() => useEnterSubmit(mockIsValid, mockOnSubmit, { ignoreShiftEnter: true }));

    act(() => {
      result.current(createKeyboardEvent('Enter', false, false));
    });

    expect(mockOnSubmit).toHaveBeenCalledTimes(1);
  });

  it('uses Promise.resolve for robust thenable detection', async () => {
    // Test that Promise.resolve works with both sync and async returns
    const mockOnSubmit = vi.fn().mockResolvedValue(undefined);
    const mockIsValid = vi.fn(() => true);

    const { result } = renderHook(() => useEnterSubmit(mockIsValid, mockOnSubmit));

    // First press with async return
    act(() => {
      result.current(createKeyboardEvent('Enter'));
    });

    expect(mockOnSubmit).toHaveBeenCalledTimes(1);

    // Wait for Promise.resolve to process
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    // Second press should work after promise resolves
    act(() => {
      result.current(createKeyboardEvent('Enter'));
    });

    expect(mockOnSubmit).toHaveBeenCalledTimes(2);
  });

  describe('requireModifier option', () => {
    it('ignores plain Enter when requireModifier is true', () => {
      const mockOnSubmit = vi.fn();
      const mockIsValid = vi.fn(() => true);

      const { result } = renderHook(() => useEnterSubmit(mockIsValid, mockOnSubmit, { requireModifier: true }));

      act(() => {
        result.current(createKeyboardEvent('Enter'));
      });

      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('submits on Ctrl+Enter when requireModifier is true', () => {
      const mockOnSubmit = vi.fn();
      const mockIsValid = vi.fn(() => true);

      const { result } = renderHook(() => useEnterSubmit(mockIsValid, mockOnSubmit, { requireModifier: true }));

      act(() => {
        result.current(createKeyboardEvent('Enter', false, false, true, false));
      });

      expect(mockOnSubmit).toHaveBeenCalledTimes(1);
    });

    it('submits on Cmd+Enter (metaKey) when requireModifier is true', () => {
      const mockOnSubmit = vi.fn();
      const mockIsValid = vi.fn(() => true);

      const { result } = renderHook(() => useEnterSubmit(mockIsValid, mockOnSubmit, { requireModifier: true }));

      act(() => {
        result.current(createKeyboardEvent('Enter', false, false, false, true));
      });

      expect(mockOnSubmit).toHaveBeenCalledTimes(1);
    });

    it('does not require modifier by default', () => {
      const mockOnSubmit = vi.fn();
      const mockIsValid = vi.fn(() => true);

      const { result } = renderHook(() => useEnterSubmit(mockIsValid, mockOnSubmit));

      act(() => {
        result.current(createKeyboardEvent('Enter'));
      });

      expect(mockOnSubmit).toHaveBeenCalledTimes(1);
    });

    it('allows Ctrl+Enter even when requireModifier is false', () => {
      const mockOnSubmit = vi.fn();
      const mockIsValid = vi.fn(() => true);

      const { result } = renderHook(() => useEnterSubmit(mockIsValid, mockOnSubmit, { requireModifier: false }));

      act(() => {
        result.current(createKeyboardEvent('Enter', false, false, true, false));
      });

      expect(mockOnSubmit).toHaveBeenCalledTimes(1);
    });
  });
});
