import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mockKeyboardEvent } from '@/test-utils/react-events';
import { useSearchInput } from './useSearchInput';

describe('useSearchInput', () => {
  const createKeyboardEvent = (key: string, isComposing: boolean = false): React.KeyboardEvent<HTMLInputElement> =>
    mockKeyboardEvent<HTMLInputElement>({
      key,
      nativeEvent: { isComposing } as KeyboardEvent,
    });

  it('initializes with default values', () => {
    const { result } = renderHook(() => useSearchInput());

    expect(result.current.inputValue).toBe('');
    expect(result.current.isFocused).toBe(false);
    expect(result.current.containerRef.current).toBe(null);
  });

  it('updates input value on change', () => {
    const { result } = renderHook(() => useSearchInput());

    act(() => {
      result.current.handleInputChange({ target: { value: 'new value' } } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.inputValue).toBe('new value');
  });

  it('sets isFocused to true on focus', () => {
    const { result } = renderHook(() => useSearchInput());

    act(() => {
      result.current.handleFocus();
    });

    expect(result.current.isFocused).toBe(true);
  });

  it('calls onEnter callback on Enter key with trimmed value', () => {
    const onEnter = vi.fn();
    const { result } = renderHook(() => useSearchInput({ onEnter }));

    act(() => {
      result.current.handleFocus();
      result.current.handleInputChange({ target: { value: '  test query  ' } } as React.ChangeEvent<HTMLInputElement>);
    });

    act(() => {
      result.current.handleKeyDown(createKeyboardEvent('Enter'));
    });

    expect(onEnter).toHaveBeenCalledWith('test query');
    // The handler owns the input value after submit; the hook leaves it untouched
    expect(result.current.inputValue).toBe('  test query  ');
    expect(result.current.isFocused).toBe(true); // Focus remains after Enter
  });

  it('does not call onEnter on Enter key with empty input', () => {
    const onEnter = vi.fn();
    const { result } = renderHook(() => useSearchInput({ onEnter }));

    act(() => {
      result.current.handleKeyDown(createKeyboardEvent('Enter'));
    });

    expect(onEnter).not.toHaveBeenCalled();
  });

  it('does not call onEnter on Enter during IME composition', () => {
    const onEnter = vi.fn();
    const { result } = renderHook(() => useSearchInput({ onEnter }));

    act(() => {
      result.current.handleInputChange({ target: { value: 'にほん' } } as React.ChangeEvent<HTMLInputElement>);
    });

    // Enter while composing commits the IME candidate — must not submit
    act(() => {
      result.current.handleKeyDown(createKeyboardEvent('Enter', true));
    });

    expect(onEnter).not.toHaveBeenCalled();

    // A normal Enter after composition ends still submits
    act(() => {
      result.current.handleKeyDown(createKeyboardEvent('Enter'));
    });

    expect(onEnter).toHaveBeenCalledWith('にほん');
  });

  it('does not blur on Escape during IME composition', () => {
    const { result } = renderHook(() => useSearchInput());

    act(() => {
      result.current.handleFocus();
    });

    // Escape while composing cancels the IME candidate — must not blur
    act(() => {
      result.current.handleKeyDown(createKeyboardEvent('Escape', true));
    });

    expect(result.current.isFocused).toBe(true);
  });

  it('closes on Escape key', () => {
    const { result } = renderHook(() => useSearchInput());

    act(() => {
      result.current.handleFocus();
    });
    expect(result.current.isFocused).toBe(true);

    act(() => {
      result.current.handleKeyDown(createKeyboardEvent('Escape'));
    });
    expect(result.current.isFocused).toBe(false);
  });

  it('sets input value via setInputValue', () => {
    const { result } = renderHook(() => useSearchInput());

    act(() => {
      result.current.setInputValue('seeded from url');
    });

    expect(result.current.inputValue).toBe('seeded from url');
  });

  it('clears input value correctly', () => {
    const { result } = renderHook(() => useSearchInput());

    // Set some input value first
    act(() => {
      result.current.handleInputChange({ target: { value: 'some text' } } as React.ChangeEvent<HTMLInputElement>);
      result.current.handleFocus();
    });

    expect(result.current.inputValue).toBe('some text');
    expect(result.current.isFocused).toBe(true);

    act(() => {
      result.current.clearInputValue();
    });

    expect(result.current.inputValue).toBe('');
    expect(result.current.isFocused).toBe(true); // Focus remains
  });
});
