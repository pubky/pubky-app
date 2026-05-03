import type { AutocompleteUserData } from '@/hooks/useUserDetailsFromIds/useUserDetailsFromIds.types';
import type { Pubky } from '@/models/models.types';

export interface SearchUsersSectionProps {
  title: string;
  users: AutocompleteUserData[];
  onUserClick: (userId: Pubky) => void;
}
