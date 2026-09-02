'use client';
import { Search } from 'lucide-react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { SEARCH_EXPANDED_STYLE } from '@/config/search';
import type { HotTag } from '@/hooks/useHotTags/useHotTags.types';
import type { AutocompleteTag } from '@/hooks/useSearchAutocomplete/useSearchAutocomplete.types';
import type { AutocompleteUserData } from '@/hooks/useUserDetailsFromIds/useUserDetailsFromIds.types';
import type { Pubky } from '@/models/models.types';
import { MAX_RECENT_SEARCHES } from '@/stores/search/search.constants';
import { SearchRecentSection } from '../SearchRecentSection/SearchRecentSection';
import type {
  RecentQuerySearchItem,
  RecentTagSearchItem,
  RecentUserSearchItem,
} from '../SearchRecentUserItem/SearchRecentUserItem.types';
import { SearchTagSection } from '../SearchTagSection/SearchTagSection';
import { SearchUsersSection } from '../SearchUsersSection/SearchUsersSection';
import { SearchSuggestionsSkeleton } from './SearchSuggestions.skeleton';

interface SearchSuggestionsProps {
  /** ID for ARIA relationship with input */
  id?: string;
  /** ARIA label for the suggestions container */
  'aria-label'?: string;
  /** Hot tags to display (only when input is empty) */
  hotTags: HotTag[];
  /** Whether input has content */
  hasInput: boolean;
  /** True while autocomplete lookups for the current input are in flight */
  isLoading?: boolean;
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

export function SearchSuggestions({
  id,
  'aria-label': ariaLabel,
  hotTags,
  hasInput,
  isLoading = false,
  autocompleteTags = [],
  autocompleteUsers = [],
  recentUsers = [],
  recentTags = [],
  recentQueries = [],
  onTagClick,
  onUserClick,
  onQueryClick,
  onShowAllResults,
  onClearRecentSearches,
}: SearchSuggestionsProps) {
  // Limit recent items to display
  const displayRecentUsers = hasInput ? [] : recentUsers.slice(0, MAX_RECENT_SEARCHES);
  const displayRecentTags = hasInput ? [] : recentTags.slice(0, MAX_RECENT_SEARCHES);
  const displayRecentQueries = hasInput ? [] : recentQueries.slice(0, MAX_RECENT_SEARCHES);

  // Derive boolean flags for readability
  const hasAutocompleteTags = hasInput && autocompleteTags.length > 0;
  const hasAutocompleteUsers = hasInput && autocompleteUsers.length > 0;
  const hasRecentUsers = !hasInput && displayRecentUsers.length > 0;
  const hasRecentTags = !hasInput && displayRecentTags.length > 0;
  const hasRecentQueries = !hasInput && displayRecentQueries.length > 0;
  const hasRecentSearches = hasRecentUsers || hasRecentTags || hasRecentQueries;
  const hasHotTags = hotTags.length > 0;

  // Skeleton only before the first response for the current input. While a
  // query is being refined the previous suggestions stay on screen (the hook
  // keeps them until fresh results land), so nothing flickers per keystroke.
  const showAutocompleteSkeleton = hasInput && isLoading && !hasAutocompleteTags && !hasAutocompleteUsers;

  const renderAutocompleteContent = () => {
    if (!hasInput) return null;
    if (showAutocompleteSkeleton) return <SearchSuggestionsSkeleton />;

    return (
      <>
        {hasAutocompleteTags && <SearchTagSection title={'Tags'} tags={autocompleteTags} onTagClick={onTagClick} />}
        {hasAutocompleteUsers && (
          <SearchUsersSection title={'Users'} users={autocompleteUsers} onUserClick={onUserClick} />
        )}
      </>
    );
  };

  const renderRecentContent = () => {
    if (hasInput) return null;

    return (
      <>
        {hasRecentSearches && (
          <SearchRecentSection
            users={displayRecentUsers}
            tags={displayRecentTags}
            queries={displayRecentQueries}
            onUserClick={onUserClick}
            onTagClick={onTagClick}
            onQueryClick={onQueryClick}
            onClearAll={onClearRecentSearches}
          />
        )}
        {hasHotTags && <SearchTagSection title={'Hot tags'} tags={hotTags} onTagClick={onTagClick} />}
      </>
    );
  };

  return (
    <Container
      id={id}
      role="region"
      aria-label={ariaLabel}
      aria-busy={showAutocompleteSkeleton || undefined}
      data-testid="search-suggestions"
      className="absolute top-full right-0 left-0 z-50 overflow-y-auto rounded-t-none rounded-b-2xl border-x border-b border-border"
      style={SEARCH_EXPANDED_STYLE}
      overrideDefaults
    >
      <Container className="flex flex-col space-y-6 px-6 pt-3 pb-6" overrideDefaults>
        {renderAutocompleteContent()}
        {renderRecentContent()}
        {hasInput && (
          <Button
            type="button"
            variant={ButtonVariant.SECONDARY}
            size="sm"
            className="self-start"
            onClick={onShowAllResults}
          >
            <Search aria-hidden="true" />
            Show all results
          </Button>
        )}
      </Container>
    </Container>
  );
}
