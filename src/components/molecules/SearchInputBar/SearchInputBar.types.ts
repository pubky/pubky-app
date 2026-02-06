import type { ChangeEvent, KeyboardEvent, RefObject } from 'react';

/**
 * Props for SearchInputBar component
 */
export interface SearchInputBarProps {
  /** Currently active search tags */
  activeTags: string[];
  /** Current input value */
  inputValue: string;
  /** Whether the input is focused/expanded */
  isFocused: boolean;
  /** Whether the input is read-only (at max tags) */
  isReadOnly: boolean;
  /** Whether suggestions popover is expanded */
  isExpanded?: boolean;
  /** ID of the suggestions listbox (for ARIA relationship) */
  suggestionsId?: string;
  /** Ref for the input element */
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Callback when a tag's close button is clicked */
  onTagRemove: (tag: string) => void;
  /** Callback when input value changes */
  onInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  /** Callback when a key is pressed in the input */
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** Callback when input receives focus */
  onFocus: () => void;
  /** Whether to auto-focus the input on mount */
  autoFocus?: boolean;
}
