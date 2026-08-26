'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { APP_ROUTES, getContentSearchUrl, getUserProfileUrl } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { CLICKABLE_TAGS_DEFAULT_MAX_LENGTH } from '@/config/tags';
import { useHotTags } from '@/hooks/useHotTags/useHotTags';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useSearchAutocomplete } from '@/hooks/useSearchAutocomplete/useSearchAutocomplete';
import { useSearchInput } from '@/hooks/useSearchInput/useSearchInput';
import { useSearchCriteria } from '@/hooks/useSearchStreamId/useSearchStreamId';
import { useTagSearch } from '@/hooks/useTagSearch/useTagSearch';
import { validateContentSearchQuery } from '@/libs/search/contentSearch';
import type { Pubky } from '@/models/models.types';
import { SearchInputBar } from '@/molecules/SearchInputBar/SearchInputBar';
import { SearchSuggestions } from '@/molecules/SearchSuggestions/SearchSuggestions';
import { toast } from '@/molecules/Toaster/use-toast';
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
    // Tag chips are NOT cleared here: the bar already hides them on content
    // results (see the render below), and the URL-sync effect empties the store
    // once the params actually change — clearing eagerly would blank the chips
    // while the old tag results are still on screen (or if navigation fails).
    // The destination shows this query in the input; set it directly rather than
    // clear-and-reseed — a same-query resubmit changes no URL and never re-seeds.
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

  // Keep the store and the input in sync with the URL criteria: active tag chips
  // exist only for tag searches, and an active (or invalid shared) full-text query
  // is shown in the input so it can be refined without retyping. Only values this
  // effect seeded are ever cleared — a draft the user is typing must survive
  // unrelated navigations (chip removal, route changes re-create searchParams).
  // Deps are primitives on purpose: the criteria object's identity is only stable
  // where the React Compiler runs, and correctness must not depend on that.
  const urlQuery = criteria.mode === 'content' || criteria.mode === 'invalid' ? criteria.query : null;
  // Tags can never contain ',' (the URL parser splits on it), so the join is
  // lossless — and the parser already trims + lowercases, so the split-back
  // needs no re-normalization.
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
  const { tags: autocompleteTags, users: autocompleteUserData } = useSearchAutocomplete({
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
    // X deletes the whole search from the bar (design decision): the typed
    // draft, the active query, and any tag chips — the URL sync clears the
    // store once the params are gone. A draft outside an active search just
    // clears and closes.
    setInputValue('');
    if (criteria.mode !== 'none') {
      router.push(APP_ROUTES.SEARCH);
    }
    setFocus(false);
  };

  // Show dropdown immediately when focused
  // The dropdown will display hot tags, recent searches, or empty state
  const hasSuggestions = isFocused;
  const suggestionsId = 'search-suggestions';

  return (
    <Container ref={containerRef} data-testid="search-input" className="relative min-w-0">
      {/* Input bar with active tags */}
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

      {/* Suggestions dropdown */}
      {hasSuggestions && (
        <SearchSuggestions
          id={suggestionsId}
          aria-label="Search suggestions"
          hotTags={hotTags}
          hasInput={hasInput}
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
