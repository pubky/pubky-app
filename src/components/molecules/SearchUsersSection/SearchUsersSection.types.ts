import type { Pubky } from '@/core';
import type { AutocompleteUserData } from '@/hooks/useUserDetailsFromIds/useUserDetailsFromIds.types';

export interface SearchUsersSectionProps {
  title: string;
  users: AutocompleteUserData[];
  onUserClick: (userId: Pubky) => void;
}
