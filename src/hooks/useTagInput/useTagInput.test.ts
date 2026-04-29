import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RefObject } from 'react';
import { asOpaque } from '@/test-utils/type-assertions';
import { mockClipboardEvent } from '@/test-utils/react-events';
import { useTagInput } from './useTagInput';
import { TAG_MAX_LENGTH } from '@/config';

// Mock useEmojiInsert
vi.mock('../useEmojiInsert/useEmojiInsert', () => ({
  useEmojiInsert: vi.fn(() => vi.fn()),
}));

function createPasteEvent(text: string): React.ClipboardEvent {
  return mockClipboardEvent({
    preventDefault: vi.fn(),
    clipboardData: asOpaque<DataTransfer>({ getData: vi.fn(() => text) }),
  });
}

function mockInputSelection(ref: RefObject<HTMLInputElement | null>, start: number, end: number) {
  (ref as { current: Partial<HTMLInputElement> | null }).current = {
    selectionStart: start,
    selectionEnd: end,
  } as HTMLInputElement;
}

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

  describe('handlePaste', () => {
    it('appends pasted text when no selection is set', () => {
      const { result } = renderHook(() => useTagInput({ onTagAdd: mockOnTagAdd }));

      act(() => {
        result.current.handleInputChange({
          target: { value: 'hello' },
        } as React.ChangeEvent<HTMLInputElement>);
      });

      act(() => {
        result.current.handlePaste(createPasteEvent('world'));
      });

      expect(result.current.inputValue).toBe('helloworld');
    });

    it('replaces selected text in the middle', () => {
      const { result } = renderHook(() => useTagInput({ onTagAdd: mockOnTagAdd }));

      act(() => {
        result.current.handleInputChange({
          target: { value: 'helloworld' },
        } as React.ChangeEvent<HTMLInputElement>);
      });

      mockInputSelection(result.current.inputRef, 3, 8);

      act(() => {
        result.current.handlePaste(createPasteEvent('XY'));
      });

      expect(result.current.inputValue).toBe('helxyld');
    });

    it('replaces selected text at the start', () => {
      const { result } = renderHook(() => useTagInput({ onTagAdd: mockOnTagAdd }));

      act(() => {
        result.current.handleInputChange({
          target: { value: 'abcdef' },
        } as React.ChangeEvent<HTMLInputElement>);
      });

      mockInputSelection(result.current.inputRef, 0, 3);

      act(() => {
        result.current.handlePaste(createPasteEvent('XY'));
      });

      expect(result.current.inputValue).toBe('xydef');
    });

    it('replaces selected text at the end', () => {
      const { result } = renderHook(() => useTagInput({ onTagAdd: mockOnTagAdd }));

      act(() => {
        result.current.handleInputChange({
          target: { value: 'abcdef' },
        } as React.ChangeEvent<HTMLInputElement>);
      });

      mockInputSelection(result.current.inputRef, 3, 6);

      act(() => {
        result.current.handlePaste(createPasteEvent('XY'));
      });

      expect(result.current.inputValue).toBe('abcxy');
    });

    it('replaces entire value when all text is selected', () => {
      const { result } = renderHook(() => useTagInput({ onTagAdd: mockOnTagAdd }));

      act(() => {
        result.current.handleInputChange({
          target: { value: 'abcdef' },
        } as React.ChangeEvent<HTMLInputElement>);
      });

      mockInputSelection(result.current.inputRef, 0, 6);

      act(() => {
        result.current.handlePaste(createPasteEvent('newtext'));
      });

      expect(result.current.inputValue).toBe('newtext');
    });

    it('truncates paste result to TAG_MAX_LENGTH', () => {
      const { result } = renderHook(() => useTagInput({ onTagAdd: mockOnTagAdd }));

      act(() => {
        result.current.handleInputChange({
          target: { value: 'existing' },
        } as React.ChangeEvent<HTMLInputElement>);
      });

      const longPaste = 'a'.repeat(TAG_MAX_LENGTH);

      act(() => {
        result.current.handlePaste(createPasteEvent(longPaste));
      });

      expect(result.current.inputValue).toHaveLength(TAG_MAX_LENGTH);
      expect(result.current.inputValue).toBe('existing' + 'a'.repeat(TAG_MAX_LENGTH - 8));
    });

    it('truncates after replacing selection near TAG_MAX_LENGTH', () => {
      const { result } = renderHook(() => useTagInput({ onTagAdd: mockOnTagAdd }));

      const initial = 'a'.repeat(TAG_MAX_LENGTH - 2);

      act(() => {
        result.current.handleInputChange({
          target: { value: initial },
        } as React.ChangeEvent<HTMLInputElement>);
      });

      mockInputSelection(result.current.inputRef, TAG_MAX_LENGTH - 4, TAG_MAX_LENGTH - 2);

      act(() => {
        result.current.handlePaste(createPasteEvent('xxxxx'));
      });

      expect(result.current.inputValue).toHaveLength(TAG_MAX_LENGTH);
    });

    it('sanitizes banned characters from pasted text', () => {
      const { result } = renderHook(() => useTagInput({ onTagAdd: mockOnTagAdd }));

      act(() => {
        result.current.handleInputChange({
          target: { value: 'tag' },
        } as React.ChangeEvent<HTMLInputElement>);
      });

      mockInputSelection(result.current.inputRef, 0, 3);

      act(() => {
        result.current.handlePaste(createPasteEvent('hello:world,test'));
      });

      expect(result.current.inputValue).toBe('helloworldtest');
    });

    it('converts pasted text to lowercase', () => {
      const { result } = renderHook(() => useTagInput({ onTagAdd: mockOnTagAdd }));

      act(() => {
        result.current.handlePaste(createPasteEvent('HELLO'));
      });

      expect(result.current.inputValue).toBe('hello');
    });

    it('shows suggestions after paste', () => {
      const { result } = renderHook(() => useTagInput({ onTagAdd: mockOnTagAdd }));

      act(() => {
        result.current.handlePaste(createPasteEvent('test'));
      });

      expect(result.current.showSuggestions).toBe(true);
    });
  });
});
