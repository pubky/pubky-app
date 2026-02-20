'use client';

import { useState, useRef } from 'react';
import { useEmojiInsert } from '../useEmojiInsert';
import { filterSuggestions } from './useTagInput.utils';
import * as Libs from '@/libs';
import { TAG_MAX_LENGTH } from '@/config';
import type { UseTagInputOptions, UseTagInputReturn } from './useTagInput.types';

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
      Libs.Logger.error('Failed to add tag:', error);
      // Don't clear input on failure so user can retry
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = Libs.sanitizeTagInput(e.target.value);
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
    const sanitized = Libs.sanitizeTagInput(pasted).toLowerCase();

    const newValue = inputValue + sanitized;
    const charCount = Libs.getCharacterCount(newValue);

    if (charCount <= TAG_MAX_LENGTH) {
      setInputValue(newValue);
    } else {
      const chars = Array.from(newValue);
      setInputValue(chars.slice(0, TAG_MAX_LENGTH).join(''));
    }
    setShowSuggestions(true);
  };

  const handleEmojiChange = (newValue: string) => {
    const sanitized = Libs.sanitizeTagInput(newValue);
    const value = sanitized.toLowerCase();
    const charCount = Libs.getCharacterCount(value);

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
    const sanitized = Libs.sanitizeTagInput(value).toLowerCase();
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
