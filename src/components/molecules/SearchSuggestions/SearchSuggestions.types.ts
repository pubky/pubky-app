import type { HotTag } from '@/hooks/useHotTags/useHotTags.types';
import type { AutocompleteTag } from '@/hooks/useSearchAutocomplete/useSearchAutocomplete.types';
import type { AutocompleteUserData } from '@/hooks/useUserDetailsFromIds/useUserDetailsFromIds.types';
import type { Pubky } from '@/models/models.types';
import type {
  RecentQuerySearchItem,
  RecentTagSearchItem,
  RecentUserSearchItem,
} from '../SearchRecentUserItem/SearchRecentUserItem.types';

export interface SearchSuggestionsProps {
  /** ID for ARIA relationship with input */
  id?: string;
  /** ARIA label for the suggestions container */
  'aria-label'?: string;
  /** Hot tags to display (only when input is empty) */
  hotTags: HotTag[];
  /** Whether input has content */
  hasInput: boolean;
  /** Autocomplete tag suggestions */
  autocompleteTags?: AutocompleteTag[];
  /** Autocomplete user suggestions */
  autocompleteUsers?: AutocompleteUserData[];
  /** Recent user searches */
  recentUsers?: RecentUserSearchItem[];
  /** Recent tag searches */
  recentTags?: RecentTagSearchItem[];
  /** Recent full-text query searches */
  recentQueries?: RecentQuerySearchItem[];
  /** Callback when a tag is clicked */
  onTagClick: (tag: string) => void;
  /** Callback when a user is clicked */
  onUserClick: (userId: Pubky) => void;
  /** Callback when a recent query is clicked (re-runs the full-text search) */
  onQueryClick: (query: string) => void;
  /** Runs a full-text content search for the current input. */
  onShowAllResults: () => void;
  /** Callback to clear all recent searches */
  onClearRecentSearches?: () => void;
}
