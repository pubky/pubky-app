import type { AutocompleteUserData } from '@/hooks/useUserDetailsFromIds/useUserDetailsFromIds.types';

export interface AutocompleteTag {
  name: string;
}

export interface UseSearchAutocompleteParams {
  query: string;
  enabled?: boolean;
}

export interface UseSearchAutocompleteResult {
  tags: AutocompleteTag[];
  users: AutocompleteUserData[];
  isLoading: boolean;
}
