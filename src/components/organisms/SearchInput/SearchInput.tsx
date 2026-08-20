'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { APP_ROUTES, getContentSearchUrl, getUserProfileUrl } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { CLICKABLE_TAGS_DEFAULT_MAX_LENGTH } from '@/config/tags';
import { useHotTags } from '@/hooks/useHotTags/useHotTags';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useSearchAutocomplete } from '@/hooks/useSearchAutocomplete/useSearchAutocomplete';
import { useSearchInput } from '@/hooks/useSearchInput/useSearchInput';
import { useContentSearchQuery } from '@/hooks/useSearchStreamId/useSearchStreamId';
import { useTagSearch } from '@/hooks/useTagSearch/useTagSearch';
import { validateContentSearchQuery } from '@/libs/search/contentSearch';
import type { Pubky } from '@/models/models.types';
import { SearchInputBar } from '@/molecules/SearchInputBar/SearchInputBar';
import { SearchSuggestions } from '@/molecules/SearchSuggestions/SearchSuggestions';
import { toast } from '@/molecules/Toaster/use-toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useSearchStore } from '@/stores/search/search.store';
import { SearchInputProps } from './SearchInput.types';
import { parseTagsFromUrl } from './SearchInput.utils';

export function SearchInput({ autoFocus = false }: SearchInputProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { addTagToSearch, removeTagFromSearch, activeTags, isReadOnly } = useTagSearch();
  const { setActiveTags, recentUsers, recentTags, addUser, clearRecentSearches } = useSearchStore();
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const isMobile = useIsMobile();
  const contentSearchQuery = useContentSearchQuery();

  const submitContentSearch = (value: string): boolean => {
    const validation = validateContentSearchQuery(value);
    if (!validation.isValid) {
      toast({ variant: 'error', description: validation.message });
      return false;
    }

    setActiveTags([]);
    router.push(getContentSearchUrl(validation.query));
    setFocus(false);
    return true;
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
    setFocus,
  } = useSearchInput({ onEnter: submitContentSearch });

  const tagsParam = searchParams.get('tags');
  useEffect(() => {
    const urlTags = contentSearchQuery ? [] : parseTagsFromUrl(tagsParam);
    setActiveTags(urlTags);
  }, [contentSearchQuery, tagsParam, setActiveTags]);

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

  const handleShowAllResults = () => {
    if (submitContentSearch(inputValue)) {
      clearInputValue();
    }
  };

  const handleCloseSearch = () => {
    clearInputValue();
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
        activeTags={contentSearchQuery ? [] : activeTags}
        inputValue={inputValue}
        isFocused={isFocused}
        isReadOnly={contentSearchQuery ? false : isReadOnly}
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
          onTagClick={handleTagClick}
          onUserClick={handleUserClick}
          onShowAllResults={handleShowAllResults}
          onClearRecentSearches={clearRecentSearches}
        />
      )}
    </Container>
  );
}
