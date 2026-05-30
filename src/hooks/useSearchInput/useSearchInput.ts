import { useEffect, useRef, useState } from 'react';
import type { UseSearchInputParams, UseSearchInputResult } from './useSearchInput.types';

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
    if (e.key === 'Enter' && inputValue.trim()) {
      const accepted = onEnter?.(inputValue.trim());
      if (accepted !== false) setInputValue('');
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
    setFocus,
  };
}
