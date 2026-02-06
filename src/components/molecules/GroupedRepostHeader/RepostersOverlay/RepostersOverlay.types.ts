import type { AutocompleteUserData } from '@/hooks';

export interface RepostersOverlayProps {
  /** Display variant - dialog for desktop, sheet for mobile */
  variant: 'dialog' | 'sheet';
  /** Whether the overlay is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** List of reposters to display */
  reposters: AutocompleteUserData[];
}
