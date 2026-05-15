'use client';

import { useRef, useState } from 'react';
import { TAG_MAX_LENGTH } from '@/config/posts';
import { Logger } from '@/libs/logger/logger';
import { getCharacterCount, sanitizeTagInput } from '@/libs/utils/utils';
import { useEmojiInsert } from '../useEmojiInsert/useEmojiInsert';
import type { UseTagInputOptions, UseTagInputReturn } from './useTagInput.types';
import { filterSuggestions } from './useTagInput.utils';

/**
 * Hook for managing tag input state and local suggestions.
 *
 * Features:
 * - Input value management with sanitization
 * - Emoji picker integration
 * - Suggestions filtering
 * - Duplicate tag prevention
 * - Paste handling with character limit
 *
 * @example
 * ```tsx
 * const {
 *   inputValue,
 *   inputRef,
 *   showEmojiPicker,
 *   setShowEmojiPicker,
 *   suggestions,
 *   handleInputChange,
 *   handleTagSubmit,
 *   handleEmojiSelect,
 *   handlePaste,
 * } = useTagInput({
 *   onTagAdd: (tag) => addTag(tag),
 *   existingTags: ['tag1', 'tag2'],
 *   allTags: [{ label: 'tag1' }, { label: 'tag2' }, { label: 'tag3' }],
 * });
 * ```
 */
export function useTagInput({ onTagAdd, existingTags = [], allTags = [] }: UseTagInputOptions): UseTagInputReturn {
  const [inputValue, setInputValue] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredSuggestions = filterSuggestions(allTags, inputValue);

  const clearInput = () => {
    setInputValue('');
    setShowSuggestions(false);
  };

  const handleTagSubmit = async () => {
    const trimmedTag = inputValue.trim();
    if (!trimmedTag) return;

    // Check for duplicates (case-insensitive)
    const normalizedTag = trimmedTag.toLowerCase();
    const isDuplicate = existingTags.some((tag) => tag.toLowerCase() === normalizedTag);

    if (isDuplicate) {
      clearInput();
      return;
    }

    // Wait for completion before clearing - handles both sync and async onTagAdd
    try {
      await onTagAdd(trimmedTag);
      clearInput();
    } catch (error: unknown) {
      Logger.error('Failed to add tag:', error);
      // Don't clear input on failure so user can retry
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = sanitizeTagInput(e.target.value);
    const value = sanitized.toLowerCase();
    setInputValue(value);
    setShowSuggestions(value.trim().length > 0);
  };

  const handleInputFocus = () => {
    if (inputValue.trim()) {
      setShowSuggestions(true);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    const sanitized = sanitizeTagInput(pasted).toLowerCase();

    const input = inputRef.current;
    const start = input?.selectionStart ?? inputValue.length;
    const end = input?.selectionEnd ?? inputValue.length;

    const before = inputValue.slice(0, start);
    const after = inputValue.slice(end);
    const merged = before + sanitized + after;

    const newValue =
      getCharacterCount(merged) <= TAG_MAX_LENGTH ? merged : Array.from(merged).slice(0, TAG_MAX_LENGTH).join('');

    setInputValue(newValue);
    setShowSuggestions(true);

    const caretTarget = Math.min(start + sanitized.length, newValue.length);
    requestAnimationFrame(() => {
      if (input?.isConnected) {
        input.setSelectionRange(caretTarget, caretTarget);
      }
    });
  };

  const handleEmojiChange = (newValue: string) => {
    const sanitized = sanitizeTagInput(newValue);
    const value = sanitized.toLowerCase();
    const charCount = getCharacterCount(value);

    if (charCount <= TAG_MAX_LENGTH) {
      setInputValue(value);
    }
  };

  const handleEmojiSelect = useEmojiInsert({
    inputRef,
    value: inputValue,
    onChange: handleEmojiChange,
  });

  // Set input value with sanitization (for programmatic updates like suggestion selection)
  const setSanitizedInputValue = (value: string) => {
    const sanitized = sanitizeTagInput(value).toLowerCase();
    setInputValue(sanitized);
  };

  return {
    inputValue,
    setInputValue: setSanitizedInputValue,
    inputRef,
    showEmojiPicker,
    setShowEmojiPicker,
    // Suggestions
    showSuggestions,
    setShowSuggestions,
    suggestions: filteredSuggestions,
    // Handlers
    handleInputChange,
    handleInputFocus,
    handleTagSubmit,
    handleEmojiSelect,
    handlePaste,
  };
}
