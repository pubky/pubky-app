import { type Dispatch, type RefObject, type SetStateAction, useEffect, useRef, useState } from 'react';

interface UseSearchInputParams {
  /** Callback when Enter is pressed with the trimmed input value. The handler owns the input value after submit. */
  onEnter?: (value: string) => void;
}

interface UseSearchInputResult {
  inputValue: string;
  isFocused: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  handleFocus: () => void;
  /** Clears input value */
  clearInputValue: () => void;
  /** Sets the input value programmatically (e.g. seeding from the URL query); accepts functional updates */
  setInputValue: Dispatch<SetStateAction<string>>;
  /** Sets focus state (true = focused, false = blurred) */
  setFocus: (focused: boolean) => void;
}

/**
 * useSearchInput
 *
 * Hook for managing search input state and behavior.
 * Handles input value, focus state, click outside, and keyboard events.
 */
export function useSearchInput({ onEnter }: UseSearchInputParams = {}): UseSearchInputResult {
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Guard against IME composition (Enter commits the CJK candidate and Escape cancels it — neither should submit or blur)
    if (e.nativeEvent.isComposing) return;

    if (e.key === 'Enter' && inputValue.trim()) {
      // The handler owns the input value after submit (clear, keep, or replace).
      onEnter?.(inputValue.trim());
    } else if (e.key === 'Escape') {
      // Keep blur behavior consistent with `setFocus(false)`
      setFocus(false);
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  const clearInputValue = () => {
    setInputValue('');
  };

  const setFocus = (focused: boolean) => {
    setIsFocused(focused);
    if (!focused && inputRef.current) {
      inputRef.current.blur();
    }
  };

  // Close on click outside
  useEffect(() => {
    if (!isFocused) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFocused]);

  return {
    inputValue,
    isFocused,
    containerRef,
    inputRef,
    handleInputChange,
    handleKeyDown,
    handleFocus,
    clearInputValue,
    setInputValue,
    setFocus,
  };
}
