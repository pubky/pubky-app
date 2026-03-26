import { RefObject } from 'react';

export interface UseSearchInputParams {
  /** Callback when Enter is pressed with input value. Return false to keep input. */
  onEnter?: (value: string) => boolean | void;
}

export interface UseSearchInputResult {
  inputValue: string;
  isFocused: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  handleFocus: () => void;
  /** Clears input value */
  clearInputValue: () => void;
  /** Sets focus state (true = focused, false = blurred) */
  setFocus: (focused: boolean) => void;
}
