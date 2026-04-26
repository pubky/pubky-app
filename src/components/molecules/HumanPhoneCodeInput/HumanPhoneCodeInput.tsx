'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import * as Atoms from '@/atoms';
import { DIGITS } from './HumanPhoneCodeInput.constants';
import type { HumanPhoneCodeInputProps } from './HumanPhoneCodeInput.types';
import { cn } from '@/libs/utils/utils';

/**
 * HumanPhoneCodeInput component. Takes a 6 digit verification code and displays it as a grid of input fields.
 * @param value - The current verification code as an array of digits.
 * @param onChange - Callback fired when the code changes.
 * @returns
 */
export const HumanPhoneCodeInput = ({ value, onChange, onEnter = () => {} }: HumanPhoneCodeInputProps) => {
  const isCodeComplete = value.every((digit) => digit !== '') && value.join('').length === DIGITS;
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // Auto-focus the first input when the component mounts or when the code is cleared
    const hasAnyDigit = value.some((digit) => digit !== '');
    if (!hasAnyDigit) {
      inputRefs.current[0]?.focus();
    }
  }, [value]);

  const handleCodeChange = useCallback(
    (index: number, digitValue: string) => {
      // Only allow single digit
      if (digitValue.length > 1) {
        return;
      }

      // Only allow digits
      if (digitValue && !/^\d$/.test(digitValue)) {
        return;
      }

      const newCode = [...value];
      newCode[index] = digitValue;
      onChange(newCode);

      // Auto-focus next input if digit entered
      if (digitValue && index < DIGITS - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [value, onChange],
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      // Handle backspace - move focus to previous input when current is empty
      if (e.key === 'Backspace' && !value[index] && index > 0) {
        const prevInput = inputRefs.current[index - 1];
        prevInput?.focus();
        prevInput?.select();
      }

      // Handle enter - if the code is complete, call onEnter
      if (e.key === 'Enter' && isCodeComplete) {
        onEnter();
      }
    },
    [value, onEnter, isCodeComplete],
  );

  const handlePaste = useCallback(
    (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pastedText = e.clipboardData.getData('text');
      const digits = pastedText.replace(/\D/g, '').slice(0, DIGITS).split('');

      if (digits.length === 0) return;

      const newCode = [...value];
      digits.forEach((digit, i) => {
        if (index + i < DIGITS) {
          newCode[index + i] = digit;
        }
      });
      onChange(newCode);

      // Focus the next empty input or the last filled one
      const lastFilledIndex = Math.min(index + digits.length - 1, DIGITS - 1);
      const nextEmptyIndex = newCode.findIndex((d, i) => i > lastFilledIndex && d === '');
      const focusIndex = nextEmptyIndex !== -1 ? nextEmptyIndex : lastFilledIndex;
      inputRefs.current[focusIndex]?.focus();
    },
    [value, onChange],
  );

  return (
    <Atoms.Container className={cn('flex-row flex-wrap gap-3')} data-testid="code-input-container">
      {value.map((digit, index) => (
        <Atoms.Container
          key={index}
          overrideDefaults={true}
          data-testid={`human-phone-code-input-${index}`}
          className={cn(
            'rounded-md border border-dashed border-brand',
            'px-2 py-4 shadow-xs',
            'flex items-center justify-center',
            'w-[33px] flex-shrink-0 flex-grow-0 md:w-[50px]',
          )}
        >
          <Atoms.Input
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            data-testid={`human-phone-code-input-${index}-input`}
            id={`human-phone-code-input-${index}-input`}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleCodeChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={(e) => handlePaste(index, e)}
            className={cn(
              'text-center text-base font-medium text-brand',
              '!h-auto !border-none !bg-transparent !p-0',
              'focus:ring-0 focus:outline-none',
            )}
          />
        </Atoms.Container>
      ))}
    </Atoms.Container>
  );
};
