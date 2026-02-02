import type { TagLabel } from '@/hooks/useTagInput/useTagInput.types';

export interface TagInputProps {
  /** Callback when a tag is added. Can return a Promise for async handling. */
  onTagAdd: (tag: string) => void | Promise<unknown>;
  /** Placeholder text for the input */
  placeholder?: string;
  /** All tags for autocomplete suggestions */
  existingTags?: TagLabel[];
  /** Viewer's own tags for duplicate checking (defaults to existingTags) */
  viewerTags?: TagLabel[];
  /** Whether to show the close button (X) */
  showCloseButton?: boolean;
  /** Callback when close button is clicked */
  onClose?: () => void;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Maximum number of tags (for limit checking) */
  maxTags?: number;
  /** Current tags count (for limit checking) */
  currentTagsCount?: number;
  /** Custom class for the input placeholder when at limit */
  limitReachedPlaceholder?: string;
  /** Callback when input loses focus */
  onBlur?: () => void;
  /** Callback when the input container is clicked (useful for auth prompts) */
  onClick?: (e: React.MouseEvent) => void;
  /** Enable API-based tag suggestions (fetches from Nexus) */
  enableApiSuggestions?: boolean;
  /** Tags to exclude from API suggestions (e.g., already added tags on the entity) */
  excludeFromApiSuggestions?: string[];
  /** When true, clicking a suggestion directly adds the tag instead of filling the input */
  addOnSuggestionClick?: boolean;
  /** Whether to auto-focus the input on mount */
  autoFocus?: boolean;
  /** Additional className for the container (useful for width override) */
  className?: string;
}
