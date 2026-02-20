import { RefObject } from 'react';

/** Represents a tag with a label */
export interface TagLabel {
  label: string;
}

export interface UseTagInputOptions {
  /** Callback when a tag is added. Can return Promise for async handling. */
  onTagAdd: (tag: string) => void | Promise<unknown>;
  /** User's existing tags for duplicate checking (string labels) */
  existingTags?: string[];
  /** All available tags for suggestions */
  allTags?: TagLabel[];
}

export interface UseTagInputReturn {
  /** Current input value */
  inputValue: string;
  /** Set input value directly (for programmatic updates) */
  setInputValue: (value: string) => void;
  /** Ref to attach to input element */
  inputRef: RefObject<HTMLInputElement | null>;
  /** Whether emoji picker is open */
  showEmojiPicker: boolean;
  /** Set emoji picker visibility */
  setShowEmojiPicker: (show: boolean) => void;
  /** Whether suggestions dropdown is visible */
  showSuggestions: boolean;
  /** Set suggestions visibility */
  setShowSuggestions: (show: boolean) => void;
  /** Filtered suggestions based on input */
  suggestions: readonly TagLabel[];
  /** Handle input change with sanitization */
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Handle input focus */
  handleInputFocus: () => void;
  /** Handle tag submission */
  handleTagSubmit: () => Promise<unknown>;
  /** Handle emoji selection */
  handleEmojiSelect: (emoji: { native: string }) => void;
  /** Handle paste event */
  handlePaste: (e: React.ClipboardEvent) => void;
}
