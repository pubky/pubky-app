import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSearchInput } from './useSearchInput';

describe('useSearchInput', () => {
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
      result.current.handleKeyDown({ key: 'Enter' } as React.KeyboardEvent<HTMLInputElement>);
    });

    expect(onEnter).toHaveBeenCalledWith('test query');
    expect(result.current.inputValue).toBe('');
    expect(result.current.isFocused).toBe(true); // Focus remains after Enter
  });

  it('does not call onEnter on Enter key with empty input', () => {
    const onEnter = vi.fn();
    const { result } = renderHook(() => useSearchInput({ onEnter }));

    act(() => {
      result.current.handleKeyDown({ key: 'Enter' } as React.KeyboardEvent<HTMLInputElement>);
    });

    expect(onEnter).not.toHaveBeenCalled();
  });

  it('closes on Escape key', () => {
    const { result } = renderHook(() => useSearchInput());

    act(() => {
      result.current.handleFocus();
    });
    expect(result.current.isFocused).toBe(true);

    act(() => {
      result.current.handleKeyDown({ key: 'Escape' } as React.KeyboardEvent<HTMLInputElement>);
    });
    expect(result.current.isFocused).toBe(false);
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
