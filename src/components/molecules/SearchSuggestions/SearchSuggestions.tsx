'use client';

import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { SEARCH_EXPANDED_STYLE } from '@/config/search';
import { MAX_RECENT_SEARCHES } from '@/stores/search/search.constants';
import { SearchRecentSection } from '../SearchRecentSection/SearchRecentSection';
import { SearchTagSection } from '../SearchTagSection/SearchTagSection';
import { SearchUsersSection } from '../SearchUsersSection/SearchUsersSection';
import type { SearchSuggestionsProps } from './SearchSuggestions.types';

export function SearchSuggestions({
  id,
  'aria-label': ariaLabel,
  hotTags,
  hasInput,
  autocompleteTags = [],
  autocompleteUsers = [],
  recentUsers = [],
  recentTags = [],
  onTagClick,
  onUserClick,
  onClearRecentSearches,
}: SearchSuggestionsProps) {
  const t = useTranslations('search.sections');

  // Limit recent items to display
  const displayRecentUsers = hasInput ? [] : (recentUsers || []).slice(0, MAX_RECENT_SEARCHES);
  const displayRecentTags = hasInput ? [] : (recentTags || []).slice(0, MAX_RECENT_SEARCHES);

  // Derive boolean flags for readability
  const hasAutocompleteTags = hasInput && autocompleteTags.length > 0;
  const hasAutocompleteUsers = hasInput && autocompleteUsers.length > 0;
  const hasRecentUsers = !hasInput && displayRecentUsers.length > 0;
  const hasRecentTags = !hasInput && displayRecentTags.length > 0;
  const hasRecentSearches = hasRecentUsers || hasRecentTags;
  const hasHotTags = hotTags.length > 0;

  const renderAutocompleteContent = () => {
    if (!hasInput) return null;

    return (
      <>
        {hasAutocompleteTags && <SearchTagSection title={t('tags')} tags={autocompleteTags} onTagClick={onTagClick} />}
        {hasAutocompleteUsers && (
          <SearchUsersSection title={t('users')} users={autocompleteUsers} onUserClick={onUserClick} />
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
            onUserClick={onUserClick}
            onTagClick={onTagClick}
            onClearAll={onClearRecentSearches}
          />
        )}
        {hasHotTags && <SearchTagSection title={t('hotTags')} tags={hotTags} onTagClick={onTagClick} />}
      </>
    );
  };

  return (
    <Container
      id={id}
      role="region"
      aria-label={ariaLabel}
      data-testid="search-suggestions"
      className="absolute top-full right-0 left-0 z-50 overflow-y-auto rounded-t-none rounded-b-2xl border-x border-b border-border"
      style={SEARCH_EXPANDED_STYLE}
      overrideDefaults
    >
      <Container className="flex flex-col space-y-6 px-6 pt-3 pb-6" overrideDefaults>
        {renderAutocompleteContent()}
        {renderRecentContent()}
      </Container>
    </Container>
  );
}
