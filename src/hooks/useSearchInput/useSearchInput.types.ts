import { Dispatch, RefObject, SetStateAction } from 'react';

export interface UseSearchInputParams {
  /** Callback when Enter is pressed with the trimmed input value. The handler owns the input value after submit. */
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
  /** Sets the input value programmatically (e.g. seeding from the URL query); accepts functional updates */
  setInputValue: Dispatch<SetStateAction<string>>;
  /** Sets focus state (true = focused, false = blurred) */
  setFocus: (focused: boolean) => void;
}
