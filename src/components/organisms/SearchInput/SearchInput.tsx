'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { APP_ROUTES, getContentSearchUrl, getUserProfileUrl } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { CLICKABLE_TAGS_DEFAULT_MAX_LENGTH } from '@/config/tags';
import { useHotTags } from '@/hooks/useHotTags/useHotTags';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useSearchAutocomplete } from '@/hooks/useSearchAutocomplete/useSearchAutocomplete';
import { useSearchCriteria } from '@/hooks/useSearchCriteria/useSearchCriteria';
import { useSearchInput } from '@/hooks/useSearchInput/useSearchInput';
import { useTagSearch } from '@/hooks/useTagSearch/useTagSearch';
import { validateContentSearchQuery } from '@/libs/search/contentSearch';
import type { Pubky } from '@/models/models.types';
import { SearchInputBar } from '@/molecules/SearchInputBar/SearchInputBar';
import { SearchSuggestions } from '@/molecules/SearchSuggestions/SearchSuggestions';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useSearchStore } from '@/stores/search/search.store';
import { SearchInputProps } from './SearchInput.types';

export function SearchInput({ autoFocus = false }: SearchInputProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { addTagToSearch, removeTagFromSearch, activeTags } = useTagSearch();
  const { setActiveTags, recentUsers, recentTags, recentQueries, addUser, addQuery, clearRecentSearches } =
    useSearchStore();
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const isMobile = useIsMobile();
  const criteria = useSearchCriteria();

  const submitContentSearch = (value: string): void => {
    const validation = validateContentSearchQuery(value);
    if (!validation.isValid) {
      toast({ variant: 'error', description: validation.message });
      return;
    }

    addQuery(validation.query);
    // Tag chips are not cleared here: the bar hides them on content results and
    // the URL-sync effect empties the store once the params change. Clearing now
    // would blank them while the old tag results are still on screen.
    // The input keeps the query directly — resubmitting the same query changes
    // no URL, so the sync effect would never put the text back after a clear.
    setInputValue(validation.query);
    router.push(getContentSearchUrl(validation.query));
    setFocus(false);
  };

  const {
    inputValue,
    isFocused,
    containerRef,
    inputRef,
    handleInputChange,
    handleKeyDown,
    handleFocus,
    clearInputValue,
    setInputValue,
    setFocus,
  } = useSearchInput({ onEnter: submitContentSearch });

  // Sync tag chips and input text with the URL: chips exist only for tag
  // searches; an active (or invalid shared) query is shown in the input for
  // editing. Only values this effect seeded are ever cleared — a draft the
  // user is typing must survive unrelated navigations. Keyed on primitives
  // because the criteria object gets a new identity on every unmemoized render.
  const urlQuery = criteria.mode === 'content' || criteria.mode === 'invalid' ? criteria.query : null;
  // Tags can never contain ',' (the URL parser splits on it) and arrive already
  // trimmed + lowercased, so joining and splitting back is lossless.
  const urlTagsKey = criteria.mode === 'tags' ? criteria.tags.join(',') : null;
  const lastSeededQueryRef = useRef<string | null>(null);
  useEffect(() => {
    setActiveTags(urlTagsKey === null ? [] : urlTagsKey.split(','));

    if (urlQuery !== null) {
      lastSeededQueryRef.current = urlQuery;
      setInputValue(urlQuery);
      return;
    }
    const seeded = lastSeededQueryRef.current;
    lastSeededQueryRef.current = null;
    if (seeded !== null) {
      setInputValue((prev) => (prev === seeded ? '' : prev));
    }
  }, [urlQuery, urlTagsKey, setActiveTags, setInputValue]);

  const { tags: hotTags } = useHotTags({ limit: CLICKABLE_TAGS_DEFAULT_MAX_LENGTH });

  const hasInput = inputValue.trim().length > 0;
  const {
    tags: autocompleteTags,
    users: autocompleteUserData,
    isLoading: isAutocompleteLoading,
  } = useSearchAutocomplete({
    query: inputValue,
    enabled: isFocused && hasInput,
  });

  const handleUserClick = (userId: Pubky) => {
    addUser(userId);
    clearInputValue();
    setFocus(false);
    router.push(getUserProfileUrl(userId, currentUserPubky));
  };

  const handleTagClick = (tag: string) => {
    addTagToSearch(tag, { addToRecent: true });
    clearInputValue();

    if (isMobile || pathname !== APP_ROUTES.SEARCH) {
      setFocus(false);
    }
  };

  const handleCloseSearch = () => {
    // The X clears the whole search: typed draft, active query, and tag chips
    // (the URL sync empties the store once the params are gone). With no
    // active search it just clears the draft and closes.
    setInputValue('');
    if (criteria.mode !== 'none') {
      router.push(APP_ROUTES.SEARCH);
    }
    setFocus(false);
  };

  // Focus alone opens the dropdown; SearchSuggestions decides what to show
  // (hot tags, recents, autocomplete).
  const hasSuggestions = isFocused;
  const suggestionsId = 'search-suggestions';

  return (
    <Container ref={containerRef} data-testid="search-input" className="relative min-w-0">
      <SearchInputBar
        activeTags={criteria.mode === 'content' ? [] : activeTags}
        inputValue={inputValue}
        isFocused={isFocused}
        isExpanded={hasSuggestions}
        suggestionsId={hasSuggestions ? suggestionsId : undefined}
        inputRef={inputRef}
        onTagRemove={removeTagFromSearch}
        onInputChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onCloseSearch={handleCloseSearch}
        autoFocus={autoFocus}
      />

      {hasSuggestions && (
        <SearchSuggestions
          id={suggestionsId}
          aria-label="Search suggestions"
          hotTags={hotTags}
          hasInput={hasInput}
          isLoading={isAutocompleteLoading}
          autocompleteTags={autocompleteTags}
          autocompleteUsers={autocompleteUserData}
          recentUsers={recentUsers}
          recentTags={recentTags}
          recentQueries={recentQueries}
          onTagClick={handleTagClick}
          onUserClick={handleUserClick}
          onQueryClick={submitContentSearch}
          onShowAllResults={() => submitContentSearch(inputValue)}
          onClearRecentSearches={clearRecentSearches}
        />
      )}
    </Container>
  );
}
