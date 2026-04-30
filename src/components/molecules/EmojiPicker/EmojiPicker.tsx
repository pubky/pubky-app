'use client';

import { useEffect, useRef } from 'react';
import data from '@emoji-mart/data';
import { Picker } from 'emoji-mart';
import { Container } from '@/atoms/Container/Container';

import * as Types from './EmojiPicker.types';

export function EmojiPicker({ onEmojiSelect, maxLength, currentInput }: Types.EmojiPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const onEmojiSelectRef = useRef(onEmojiSelect);
  const maxLengthRef = useRef(maxLength);
  const currentInputRef = useRef(currentInput);

  // Keep refs in sync with props
  useEffect(() => {
    onEmojiSelectRef.current = onEmojiSelect;
    maxLengthRef.current = maxLength;
    currentInputRef.current = currentInput;
  }, [onEmojiSelect, maxLength, currentInput]);

  useEffect(() => {
    const pickerElement = pickerRef.current;
    if (!pickerElement) return;

    const handleEmojiSelect = (emojiObject: Types.EmojiData) => {
      const maxLen = maxLengthRef.current;
      const current = currentInputRef.current;

      if (maxLen && current) {
        const emojiLength = [...emojiObject.native].length;
        if (current.length + emojiLength <= maxLen) {
          onEmojiSelectRef.current(emojiObject);
        }
      } else {
        onEmojiSelectRef.current(emojiObject);
      }
    };

    // Clear any existing content
    pickerElement.innerHTML = '';

    // Initialize emoji-mart picker
    new Picker({
      data,
      theme: 'dark',
      onEmojiSelect: handleEmojiSelect,
      parent: pickerElement,
    } as Types.PickerOptions);

    return () => {
      // Cleanup
      if (pickerElement) {
        pickerElement.innerHTML = '';
      }
    };
  }, []); // Only run once on mount

  return <Container ref={pickerRef} overrideDefaults className="w-full overflow-hidden" />;
}
