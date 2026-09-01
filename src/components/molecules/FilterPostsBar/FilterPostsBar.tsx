'use client';

import { Search } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { Input } from '@/atoms/Input/Input';
import { CONTENT_SEARCH_QUERY_MAX_LENGTH, SEARCH_CLOSED_STYLE } from '@/config/search';
import type { FilterPostsBarProps } from './FilterPostsBar.types';

/**
 * FilterPostsBar
 *
 * Pill-shaped inline search input for the profile Posts tab ("Filter posts",
 * issue #2234). Presentation-only: debounce/validation live in
 * `useProfilePostsFilter`. Modeled on `SearchInputBar` minus tags/dropdown.
 */
export function FilterPostsBar({ value, onValueChange }: FilterPostsBarProps) {
  return (
    <Container
      data-testid="filter-posts-bar"
      data-cy="profile-filter-posts"
      className="flex h-12 min-w-0 shrink-0 items-center gap-3 rounded-full border border-border px-6 py-3"
      style={SEARCH_CLOSED_STYLE}
      overrideDefaults
    >
      <Input
        type="text"
        placeholder={'Filter posts'}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        maxLength={CONTENT_SEARCH_QUERY_MAX_LENGTH}
        data-cy="profile-filter-posts-input"
        aria-label={'Filter posts'}
        className="h-auto min-w-20 flex-1 border-none bg-transparent pr-0 pl-0 text-base font-medium text-foreground md:text-base"
      />
      <span className="pointer-events-none -mr-2 flex size-8 shrink-0 items-center justify-center" aria-hidden="true">
        <Search className="size-4 text-muted-foreground" />
      </span>
    </Container>
  );
}
