'use client';

import { useEffect, useRef } from 'react';
import data from '@emoji-mart/data';
import { Picker } from 'emoji-mart';
import { useTheme } from 'next-themes';
import { Container } from '@/atoms/Container/Container';
import type { EmojiData, EmojiPickerProps, PickerOptions } from './EmojiPicker.types';

function toPickerTheme(resolvedTheme: string | undefined): 'light' | 'dark' {
  return resolvedTheme === 'light' ? 'light' : 'dark';
}

export function EmojiPicker({ onEmojiSelect, maxLength, currentInput }: EmojiPickerProps) {
  const { resolvedTheme } = useTheme();
  const pickerRef = useRef<HTMLDivElement>(null);
  const onEmojiSelectRef = useRef(onEmojiSelect);
  const maxLengthRef = useRef(maxLength);
  const currentInputRef = useRef(currentInput);
  const resolvedThemeRef = useRef(resolvedTheme);
  const pickerInstanceRef = useRef<Picker | null>(null);

  // Keep refs in sync with props
  useEffect(() => {
    onEmojiSelectRef.current = onEmojiSelect;
    maxLengthRef.current = maxLength;
    currentInputRef.current = currentInput;
    resolvedThemeRef.current = resolvedTheme;
  }, [onEmojiSelect, maxLength, currentInput, resolvedTheme]);

  // Follow later theme changes (e.g. Auto tracking the OS) on the live instance
  useEffect(() => {
    pickerInstanceRef.current?.update({ theme: toPickerTheme(resolvedTheme) });
  }, [resolvedTheme]);

  useEffect(() => {
    const pickerElement = pickerRef.current;
    if (!pickerElement) return;

    const handleEmojiSelect = (emojiObject: EmojiData) => {
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

    // Initialize emoji-mart picker. It renders in its own Shadow DOM, out of reach of the
    // `.light` tokens, so it takes the resolved scheme. The picker initialises asynchronously,
    // so it is built once per mount: rebuilding it into the same parent races the first build.
    pickerInstanceRef.current = new Picker({
      data,
      theme: toPickerTheme(resolvedThemeRef.current),
      onEmojiSelect: handleEmojiSelect,
      parent: pickerElement,
    } as PickerOptions);

    return () => {
      pickerInstanceRef.current = null;
      if (pickerElement) {
        pickerElement.innerHTML = '';
      }
    };
  }, []); // Only run once on mount

  return <Container ref={pickerRef} overrideDefaults className="w-full overflow-hidden" />;
}
