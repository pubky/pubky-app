'use client';

import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { Input } from '@/atoms/Input/Input';
import { SEARCH_CLOSED_STYLE, SEARCH_INPUT_EXPANDED_STYLE } from '@/config/search';
import { cn } from '@/libs/utils/utils';
import { PostTag } from '../PostTag/PostTag';
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
    <Container
      data-testid="search-input-bar"
      data-cy="header-search"
      className={cn(
        'relative flex h-12 min-w-0 items-center gap-3 border border-border px-6 py-3',
        isFocused ? 'rounded-t-2xl rounded-b-none border-b-transparent' : 'rounded-full',
      )}
      style={isFocused ? SEARCH_INPUT_EXPANDED_STYLE : SEARCH_CLOSED_STYLE}
      overrideDefaults
    >
      {hasActiveTags && (
        <Container
          overrideDefaults
          className="flex min-w-0 items-center gap-2.5 overflow-x-auto py-2"
          role="list"
          aria-label={t('activeTags')}
        >
          {activeTags.map((tag) => (
            <PostTag key={tag} label={tag} showClose onClose={() => onTagRemove(tag)} className="max-w-none shrink-0" />
          ))}
        </Container>
      )}

      <Input
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
        className={cn(
          'h-auto flex-1 border-none bg-transparent pr-0 text-base font-medium text-foreground md:text-base',
          hasActiveTags ? 'min-w-8 pl-2.5' : 'min-w-20 pl-0',
        )}
      />

      {/* Search icon */}
      <Search className="pointer-events-none size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Container>
  );
}
