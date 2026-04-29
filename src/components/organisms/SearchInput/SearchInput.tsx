'use client';

import { useHotTags } from '@/hooks/useHotTags/useHotTags';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useSearchAutocomplete } from '@/hooks/useSearchAutocomplete/useSearchAutocomplete';
import { useSearchInput } from '@/hooks/useSearchInput/useSearchInput';
import { useTagSearch } from '@/hooks/useTagSearch/useTagSearch';
import { useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as Molecules from '@/molecules';
import * as Atoms from '@/atoms';
import { APP_ROUTES } from '@/app/routes';
import { CLICKABLE_TAGS_DEFAULT_MAX_LENGTH } from '@/config/tags';
import { parseTagsFromUrl } from './SearchInput.utils';
import { SearchInputProps } from './SearchInput.types';
import { isValidTagLabel } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { useSearchStore } from '@/stores/search/search.store';
export function SearchInput({ autoFocus = false }: SearchInputProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const t = useTranslations('search');

  const { addTagToSearch, removeTagFromSearch, activeTags, isReadOnly } = useTagSearch();
  const { setActiveTags, recentUsers, recentTags, addUser, clearRecentSearches } = useSearchStore();
  const isMobile = useIsMobile();

  const handleEnter = (value: string) => {
    if (!isValidTagLabel(value.trim().toLowerCase())) {
      Molecules.toast({ description: t('invalidTag') });
      return false;
    }

    addTagToSearch(value, { addToRecent: true });
    if (pathname !== APP_ROUTES.SEARCH) {
      setFocus(false);
    }
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
  } = useSearchInput({ onEnter: handleEnter });

  const tagsParam = searchParams.get('tags');
  useEffect(() => {
    const urlTags = parseTagsFromUrl(tagsParam);
    setActiveTags(urlTags);
  }, [tagsParam, setActiveTags]);

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
    router.push(`/profile/${userId}/posts`);
  };

  const handleTagClick = (tag: string) => {
    addTagToSearch(tag, { addToRecent: true });
    clearInputValue();

    if (isMobile || pathname !== APP_ROUTES.SEARCH) {
      setFocus(false);
    }
  };

  // Show dropdown immediately when focused
  // The dropdown will display hot tags, recent searches, or empty state
  const hasSuggestions = isFocused;
  const suggestionsId = 'search-suggestions';

  return (
    <Atoms.Container ref={containerRef} data-testid="search-input" className="relative min-w-0">
      {/* Input bar with active tags */}
      <Molecules.SearchInputBar
        activeTags={activeTags}
        inputValue={inputValue}
        isFocused={isFocused}
        isReadOnly={isReadOnly}
        isExpanded={hasSuggestions}
        suggestionsId={hasSuggestions ? suggestionsId : undefined}
        inputRef={inputRef}
        onTagRemove={removeTagFromSearch}
        onInputChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        autoFocus={autoFocus}
      />

      {/* Suggestions dropdown */}
      {hasSuggestions && (
        <Molecules.SearchSuggestions
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
          onClearRecentSearches={clearRecentSearches}
        />
      )}
    </Atoms.Container>
  );
}
