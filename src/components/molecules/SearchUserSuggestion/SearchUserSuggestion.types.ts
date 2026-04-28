import type { Pubky } from '@/core';
import type { AutocompleteUserData } from '@/hooks/useUserDetailsFromIds/useUserDetailsFromIds.types';

export interface SearchUserSuggestionProps {
  /** User data */
  user: AutocompleteUserData;
  /** Callback when user is clicked */
  onClick?: (userId: Pubky) => void;
}
