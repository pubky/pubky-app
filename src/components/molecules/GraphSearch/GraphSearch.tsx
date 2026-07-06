'use client';

import { Loader2, Search, Tag as TagIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Input } from '@/atoms/Input/Input';
import { GLASS_PANEL_CLASS } from '@/config/theme';
import { useSearchAutocomplete } from '@/hooks/useSearchAutocomplete/useSearchAutocomplete';
import { useSearchInput } from '@/hooks/useSearchInput/useSearchInput';
import { cn, generateRandomColor, hexToRgba } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { SearchUserSuggestion } from '@/molecules/SearchUserSuggestion/SearchUserSuggestion';

export interface GraphSearchProps {
  onPickUser: (pubky: Pubky) => void;
  onPickTag: (label: string) => void;
  className?: string;
}

/**
 * GraphSearch
 *
 * Go-anywhere box for the canvas: reuses the app's search autocomplete and
 * hands the chosen user/tag to the graph, which jumps there or merges the
 * new neighborhood in.
 */
export function GraphSearch({ onPickUser, onPickTag, className }: GraphSearchProps) {
  const t = useTranslations('graph');
  // House search-box state: value, focus, Escape, and outside-click close.
  // Enter is a no-op here (picking happens by clicking a result); returning
  // false keeps the typed query.
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
  } = useSearchInput({ onEnter: () => false });
  const { tags, users, isLoading } = useSearchAutocomplete({
    query: inputValue,
    enabled: isFocused && inputValue.length > 0,
  });

  const pickUser = (pubky: Pubky) => {
    onPickUser(pubky);
    clearInputValue();
    setFocus(false);
  };
  const pickTag = (label: string) => {
    onPickTag(label);
    clearInputValue();
    setFocus(false);
  };

  const hasResults = users.length > 0 || tags.length > 0;
  const open = isFocused && inputValue.length > 0 && hasResults;

  return (
    <div ref={containerRef} className={cn('relative w-56', className)} data-cy="graph-search">
      <div
        className={cn(
          GLASS_PANEL_CLASS,
          'flex items-center gap-2 rounded-full px-3 py-1.5 focus-within:border-white/25',
        )}
      >
        {isLoading ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Search className="size-4 shrink-0 text-muted-foreground" />
        )}
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={t('search.placeholder')}
          role="combobox"
          aria-expanded={open}
          aria-controls="graph-search-results"
          aria-autocomplete="list"
          className="h-auto border-none p-0 text-sm shadow-none placeholder:text-muted-foreground"
          data-cy="graph-search-input"
        />
      </div>

      {open && (
        <div
          id="graph-search-results"
          role="listbox"
          className={cn(
            GLASS_PANEL_CLASS,
            'absolute top-full right-0 left-0 z-20 mt-2 max-h-80 overflow-y-auto bg-black/70 p-1.5',
          )}
        >
          {users.map((user) => (
            <div key={user.id} data-cy="graph-search-user">
              <SearchUserSuggestion user={user} onClick={pickUser} />
            </div>
          ))}
          {tags.map((tag) => (
            <button
              key={tag.name}
              type="button"
              onClick={() => pickTag(tag.name)}
              className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/10"
              data-cy="graph-search-tag"
            >
              <span
                className="flex size-6 items-center justify-center rounded-full"
                style={{ backgroundColor: hexToRgba(generateRandomColor(tag.name), 0.25) }}
              >
                <TagIcon className="size-3.5" style={{ color: generateRandomColor(tag.name) }} />
              </span>
              <span className="truncate text-sm">{tag.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
