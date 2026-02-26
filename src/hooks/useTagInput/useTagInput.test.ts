import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTagInput } from './useTagInput';

// Mock useEmojiInsert
vi.mock('../useEmojiInsert', () => ({
  useEmojiInsert: vi.fn(() => vi.fn()),
}));

describe('useTagInput', () => {
  const mockOnTagAdd = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial state with empty input', () => {
    const { result } = renderHook(() =>
      useTagInput({
        onTagAdd: mockOnTagAdd,
      }),
    );

    expect(result.current.inputValue).toBe('');
    expect(result.current.showEmojiPicker).toBe(false);
    expect(result.current.showSuggestions).toBe(false);
    expect(result.current.suggestions).toEqual([]);
  });

  it('updates input value via handleInputChange', () => {
    const { result } = renderHook(() =>
      useTagInput({
        onTagAdd: mockOnTagAdd,
      }),
    );

    act(() => {
      result.current.handleInputChange({
        target: { value: 'new-tag' },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.inputValue).toBe('new-tag');
  });

  it('converts uppercase input to lowercase', () => {
    const { result } = renderHook(() =>
      useTagInput({
        onTagAdd: mockOnTagAdd,
      }),
    );

    act(() => {
      result.current.handleInputChange({
        target: { value: 'NEW-TAG' },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.inputValue).toBe('new-tag');
  });

  it('calls onTagAdd and clears input on submit', async () => {
    const { result } = renderHook(() =>
      useTagInput({
        onTagAdd: mockOnTagAdd,
      }),
    );

    act(() => {
      result.current.handleInputChange({
        target: { value: 'new-tag' },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      await result.current.handleTagSubmit();
    });

    expect(mockOnTagAdd).toHaveBeenCalledWith('new-tag');
    expect(result.current.inputValue).toBe('');
  });

  it('does not add duplicate tags (case-insensitive)', () => {
    const { result } = renderHook(() =>
      useTagInput({
        onTagAdd: mockOnTagAdd,
        existingTags: ['existing-tag'],
      }),
    );

    act(() => {
      result.current.handleInputChange({
        target: { value: 'EXISTING-TAG' },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    act(() => {
      result.current.handleTagSubmit();
    });

    expect(mockOnTagAdd).not.toHaveBeenCalled();
    expect(result.current.inputValue).toBe('');
  });

  it('does not submit empty tags', () => {
    const { result } = renderHook(() =>
      useTagInput({
        onTagAdd: mockOnTagAdd,
      }),
    );

    act(() => {
      result.current.handleInputChange({
        target: { value: '   ' },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    act(() => {
      result.current.handleTagSubmit();
    });

    expect(mockOnTagAdd).not.toHaveBeenCalled();
  });

  it('toggles emoji picker visibility', () => {
    const { result } = renderHook(() =>
      useTagInput({
        onTagAdd: mockOnTagAdd,
      }),
    );

    expect(result.current.showEmojiPicker).toBe(false);

    act(() => {
      result.current.setShowEmojiPicker(true);
    });

    expect(result.current.showEmojiPicker).toBe(true);

    act(() => {
      result.current.setShowEmojiPicker(false);
    });

    expect(result.current.showEmojiPicker).toBe(false);
  });

  it('filters suggestions based on input', () => {
    const { result } = renderHook(() =>
      useTagInput({
        onTagAdd: mockOnTagAdd,
        allTags: [{ label: 'hello' }, { label: 'help' }, { label: 'world' }],
      }),
    );

    act(() => {
      result.current.handleInputChange({
        target: { value: 'hel' },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.suggestions).toEqual([{ label: 'hello' }, { label: 'help' }]);
    expect(result.current.showSuggestions).toBe(true);
  });

  it('provides inputRef for external use', () => {
    const { result } = renderHook(() =>
      useTagInput({
        onTagAdd: mockOnTagAdd,
      }),
    );

    expect(result.current.inputRef).toBeDefined();
    expect(result.current.inputRef.current).toBeNull();
  });
});
