import type { AutocompleteUserData } from '@/hooks/useUserDetailsFromIds/useUserDetailsFromIds.types';

/**
 * Parameters for the useMentionAutocomplete hook
 */
export interface UseMentionAutocompleteParams {
  /** Current content of the textarea */
  content: string;
  /** Callback when a user is selected (via Enter key or click) */
  onSelect?: (userId: string) => void;
}

/**
 * Return type for the useMentionAutocomplete hook
 */
export interface UseMentionAutocompleteResult {
  /** List of matching users */
  users: AutocompleteUserData[];
  /** Whether the popover should be shown */
  isOpen: boolean;
  /** Currently selected user index for keyboard navigation */
  selectedIndex: number | null;
  /** Set the selected index */
  setSelectedIndex: (index: number | null) => void;
  /** Close the popover */
  close: () => void;
  /**
   * Handle keyboard navigation
   * @param e - The keyboard event
   * @returns true if the event was handled, false otherwise
   */
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
}
