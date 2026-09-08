'use client';

import { Search, X } from 'lucide-react';
import type { ChangeEvent, KeyboardEvent, RefObject } from 'react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Input } from '@/atoms/Input/Input';
import { SEARCH_CLOSED_STYLE, SEARCH_INPUT_EXPANDED_STYLE } from '@/config/search';
import { cn } from '@/libs/utils/utils';
import { PostTag } from '../PostTag/PostTag';

interface SearchInputBarProps {
  /** Currently active search tags */
  activeTags: string[];
  /** Current input value */
  inputValue: string;
  /** Whether the input is focused/expanded */
  isFocused: boolean;
  /** Whether suggestions popover is expanded */
  isExpanded?: boolean;
  /** ID of the suggestions listbox (for ARIA relationship) */
  suggestionsId?: string;
  /** Ref for the input element */
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Callback when a tag's close button is clicked */
  onTagRemove: (tag: string) => void;
  /** Callback when input value changes */
  onInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  /** Callback when a key is pressed in the input */
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** Callback when input receives focus */
  onFocus: () => void;
  /** Clears the typed value and collapses the active search UI. */
  onCloseSearch: () => void;
  /** Whether to auto-focus the input on mount */
  autoFocus?: boolean;
}

export function SearchInputBar({
  activeTags,
  inputValue,
  isFocused,
  isExpanded,
  suggestionsId,
  inputRef,
  onTagRemove,
  onInputChange,
  onKeyDown,
  onFocus,
  onCloseSearch,
  autoFocus,
}: SearchInputBarProps) {
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
          className="flex min-w-0 items-center gap-2 overflow-x-auto py-2"
          role="list"
          aria-label={'Active search tags'}
        >
          {activeTags.map((tag) => (
            <PostTag key={tag} label={tag} showClose onClose={() => onTagRemove(tag)} className="max-w-none shrink-0" />
          ))}
        </Container>
      )}

      <Input
        ref={inputRef}
        type="text"
        placeholder={hasActiveTags ? '' : 'Search'}
        value={inputValue}
        onChange={onInputChange}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        autoFocus={autoFocus}
        data-cy="header-search-input"
        aria-label={'Search input'}
        aria-autocomplete="list"
        aria-controls={suggestionsId || undefined}
        aria-expanded={isExpanded}
        aria-haspopup={suggestionsId ? 'dialog' : undefined}
        className={cn(
          'h-auto flex-1 border-none bg-transparent pr-0 text-base font-medium text-foreground md:text-base',
          hasActiveTags ? 'min-w-8 pl-2.5' : 'min-w-20 pl-0',
        )}
      />

      {/* Both states share an identical 32px slot so the X sits exactly where the search icon sits */}
      {isFocused ? (
        <Button
          type="button"
          variant={ButtonVariant.GHOST}
          size="icon"
          aria-label="Clear and close search"
          className="-mr-2 size-8 shrink-0 border-none p-0 text-muted-foreground shadow-none"
          onClick={onCloseSearch}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      ) : (
        <span className="pointer-events-none -mr-2 flex size-8 shrink-0 items-center justify-center" aria-hidden="true">
          <Search className="size-4 text-muted-foreground" />
        </span>
      )}
    </Container>
  );
}
