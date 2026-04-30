import type { AutocompleteUserData } from '@/hooks/useUserDetailsFromIds/useUserDetailsFromIds.types';
import type { Pubky } from '@/models/models.types';
export interface SearchUserSuggestionProps {
  /** User data */
  user: AutocompleteUserData;
  /** Callback when user is clicked */
  onClick?: (userId: Pubky) => void;
}
