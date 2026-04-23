import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { asInvalid } from '@/test-utils';
import { useEmojiInsert } from './useEmojiInsert';

describe('useEmojiInsert', () => {
  let mockInput: HTMLInputElement;
  let mockRef: { current: HTMLInputElement | null };
  let originalRequestAnimationFrame: typeof requestAnimationFrame;

  beforeEach(() => {
    // Create mock input element
    mockInput = document.createElement('input');
    mockInput.value = 'Hello World';
    mockInput.selectionStart = 5;
    mockInput.selectionEnd = 5;
    mockInput.focus = vi.fn();
    mockInput.setSelectionRange = vi.fn();

    mockRef = { current: mockInput };

    // Mock requestAnimationFrame to execute immediately
    originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback(0);
      return 0;
    });
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    vi.clearAllMocks();
  });

  it('inserts emoji at cursor position', () => {
    const onChange = vi.fn();

    const { result } = renderHook(() =>
      useEmojiInsert({
        inputRef: mockRef,
        value: 'Hello World',
        onChange,
      }),
    );

    act(() => {
      result.current({ native: '😀' });
    });

    expect(onChange).toHaveBeenCalledWith('Hello😀 World');
  });

  it('inserts emoji at beginning when cursor is at position 0', () => {
    mockInput.selectionStart = 0;
    mockInput.selectionEnd = 0;
    const onChange = vi.fn();

    const { result } = renderHook(() =>
      useEmojiInsert({
        inputRef: mockRef,
        value: 'Hello',
        onChange,
      }),
    );

    act(() => {
      result.current({ native: '🎉' });
    });

    expect(onChange).toHaveBeenCalledWith('🎉Hello');
  });

  it('inserts emoji at end when cursor is at end', () => {
    mockInput.selectionStart = 5;
    mockInput.selectionEnd = 5;
    const onChange = vi.fn();

    const { result } = renderHook(() =>
      useEmojiInsert({
        inputRef: mockRef,
        value: 'Hello',
        onChange,
      }),
    );

    act(() => {
      result.current({ native: '🚀' });
    });

    expect(onChange).toHaveBeenCalledWith('Hello🚀');
  });

  it('replaces selected text with emoji', () => {
    mockInput.selectionStart = 0;
    mockInput.selectionEnd = 5;
    const onChange = vi.fn();

    const { result } = renderHook(() =>
      useEmojiInsert({
        inputRef: mockRef,
        value: 'Hello World',
        onChange,
      }),
    );

    act(() => {
      result.current({ native: '👋' });
    });

    expect(onChange).toHaveBeenCalledWith('👋 World');
  });

  it('focuses input and sets cursor position after insertion', () => {
    mockInput.selectionStart = 5;
    mockInput.selectionEnd = 5;
    const onChange = vi.fn();

    const { result } = renderHook(() =>
      useEmojiInsert({
        inputRef: mockRef,
        value: 'Hello World',
        onChange,
      }),
    );

    act(() => {
      result.current({ native: '😀' });
    });

    expect(mockInput.focus).toHaveBeenCalled();
    expect(mockInput.setSelectionRange).toHaveBeenCalledWith(7, 7); // 5 + emoji length (2)
  });

  it('does nothing when inputRef is null', () => {
    const nullRef = { current: null };
    const onChange = vi.fn();

    const { result } = renderHook(() =>
      useEmojiInsert({
        inputRef: nullRef,
        value: 'Hello',
        onChange,
      }),
    );

    act(() => {
      result.current({ native: '😀' });
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('handles null selection positions', () => {
    mockInput.selectionStart = asInvalid<number>(null);
    mockInput.selectionEnd = asInvalid<number>(null);
    const onChange = vi.fn();

    const { result } = renderHook(() =>
      useEmojiInsert({
        inputRef: mockRef,
        value: 'Hello',
        onChange,
      }),
    );

    act(() => {
      result.current({ native: '😀' });
    });

    // Should default to position 0
    expect(onChange).toHaveBeenCalledWith('😀Hello');
  });

  it('does not focus if input is removed before requestAnimationFrame', () => {
    const onChange = vi.fn();

    // Override requestAnimationFrame to simulate component unmount
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      mockRef.current = null; // Simulate unmount
      callback(0);
      return 0;
    });

    const { result } = renderHook(() =>
      useEmojiInsert({
        inputRef: mockRef,
        value: 'Hello',
        onChange,
      }),
    );

    act(() => {
      result.current({ native: '😀' });
    });

    expect(mockInput.focus).not.toHaveBeenCalled();
  });

  it('does not focus if input reference changed', () => {
    const onChange = vi.fn();
    const newInput = document.createElement('input');
    newInput.focus = vi.fn();

    // Override requestAnimationFrame to simulate ref change
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      mockRef.current = newInput; // Different input
      callback(0);
      return 0;
    });

    const { result } = renderHook(() =>
      useEmojiInsert({
        inputRef: mockRef,
        value: 'Hello',
        onChange,
      }),
    );

    act(() => {
      result.current({ native: '😀' });
    });

    // Original input should not be focused, new input should not be focused either
    // because the captured input !== current ref
    expect(mockInput.focus).not.toHaveBeenCalled();
  });

  it('handles empty string value', () => {
    mockInput.selectionStart = 0;
    mockInput.selectionEnd = 0;
    const onChange = vi.fn();

    const { result } = renderHook(() =>
      useEmojiInsert({
        inputRef: mockRef,
        value: '',
        onChange,
      }),
    );

    act(() => {
      result.current({ native: '🎯' });
    });

    expect(onChange).toHaveBeenCalledWith('🎯');
  });
});
