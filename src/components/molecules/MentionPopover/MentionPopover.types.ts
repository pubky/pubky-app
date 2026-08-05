import type { RefObject } from 'react';
import type { AutocompleteUserData } from '@/hooks/useUserDetailsFromIds/useUserDetailsFromIds.types';

/**
 * Props for the MentionPopover component
 */
export interface MentionPopoverProps {
  /** List of users to display */
  users: AutocompleteUserData[];
  /** Currently selected index for keyboard navigation */
  selectedIndex: number | null;
  /** Callback when a user is selected */
  onSelect: (userId: string) => void;
  /** Callback when hovering over a user (for keyboard navigation sync) */
  onHover: (index: number) => void;
  /** Element the popover is positioned under — it renders in a portal, so this is its only anchor */
  anchorRef: RefObject<HTMLElement | null>;
}
