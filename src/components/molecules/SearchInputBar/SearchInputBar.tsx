'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Libs from '@/libs';
import { SEARCH_CLOSED_STYLE, SEARCH_INPUT_EXPANDED_STYLE } from '@/config/search';
import type { SearchInputBarProps } from './SearchInputBar.types';

export function SearchInputBar({
  activeTags,
  inputValue,
  isFocused,
  isReadOnly,
  isExpanded,
  suggestionsId,
  inputRef,
  onTagRemove,
  onInputChange,
  onKeyDown,
  onFocus,
  autoFocus,
}: SearchInputBarProps) {
  const t = useTranslations('search');
  const hasActiveTags = activeTags.length > 0;

  return (
    <Atoms.Container
      data-testid="search-input-bar"
      data-cy="header-search"
      className={Libs.cn(
        'relative flex h-12 min-w-0 items-center gap-3 border border-border px-6 py-3',
        isFocused ? 'rounded-t-2xl rounded-b-none border-b-transparent' : 'rounded-full',
      )}
      style={isFocused ? SEARCH_INPUT_EXPANDED_STYLE : SEARCH_CLOSED_STYLE}
      overrideDefaults
    >
      {hasActiveTags && (
        <Atoms.Container
          overrideDefaults
          className="flex min-w-0 items-center gap-2.5 overflow-x-auto py-2"
          role="list"
          aria-label={t('activeTags')}
        >
          {activeTags.map((tag) => (
            <Molecules.PostTag
              key={tag}
              label={tag}
              showClose
              onClose={() => onTagRemove(tag)}
              className="max-w-none shrink-0"
            />
          ))}
        </Atoms.Container>
      )}

      <Atoms.Input
        ref={inputRef}
        type="text"
        placeholder={hasActiveTags ? '' : t('placeholder')}
        value={inputValue}
        onChange={onInputChange}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        autoFocus={autoFocus}
        readOnly={isReadOnly}
        data-cy="header-search-input"
        aria-label={t('inputLabel')}
        aria-autocomplete="list"
        aria-controls={suggestionsId || undefined}
        aria-expanded={isExpanded}
        aria-haspopup={suggestionsId ? 'dialog' : undefined}
        className={Libs.cn(
          'h-auto flex-1 border-none bg-transparent pr-0 text-base font-medium text-foreground md:text-base',
          hasActiveTags ? 'min-w-8 pl-2.5' : 'min-w-20 pl-0',
        )}
      />

      {/* Search icon */}
      <Libs.Search className="pointer-events-none size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Atoms.Container>
  );
}
