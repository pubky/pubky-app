'use client';

/**
 * SearchRecentSection
 *
 * Displays recent searches in one section: a row of users, then one mixed row of
 * tag chips and full-text query pills sorted by recency (#1840 design).
 * Shows "Recent searches" header with X to clear all.
 * Note: Data is already limited by parent component.
 */
import { X } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { SearchRecentItem } from '../SearchRecentItem/SearchRecentItem';
import { RECENT_ITEM_TYPE } from '../SearchRecentItem/SearchRecentItem.constants';
import type { SearchRecentSectionProps } from './SearchRecentSection.types';

export function SearchRecentSection({
  users,
  tags,
  queries,
  onUserClick,
  onTagClick,
  onQueryClick,
  onClearAll,
}: SearchRecentSectionProps) {
  // Tag and full-text searches share one row, interleaved by recency.
  type RecentSearchChip = {
    key: string;
    searchedAt: number;
    tag?: SearchRecentSectionProps['tags'][number];
    query?: SearchRecentSectionProps['queries'][number];
  };
  const searchChips: RecentSearchChip[] = [
    ...tags.map((tag) => ({ key: `tag-${tag.tag}`, searchedAt: tag.searchedAt, tag })),
    ...queries.map((query) => ({ key: `query-${query.query}`, searchedAt: query.searchedAt, query })),
  ].sort((a, b) => b.searchedAt - a.searchedAt);

  const hasItems = users.length > 0 || searchChips.length > 0;
  if (!hasItems) {
    return null;
  }
  return (
    <Container overrideDefaults className="flex flex-col gap-3">
      <Container overrideDefaults className="flex items-center gap-2">
        <Typography size="xs" className="tracking-widest text-muted-foreground uppercase">
          {'Recent searches'}
        </Typography>
        {onClearAll && (
          <Button
            overrideDefaults
            className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            onClick={onClearAll}
            data-testid="clear-all-button"
            aria-label={'Clear all recent searches'}
          >
            <X className="size-4" strokeWidth={2} aria-hidden="true" />
          </Button>
        )}
      </Container>

      {/* Recent users - horizontal */}
      {users.length > 0 && (
        <Container overrideDefaults className="flex flex-wrap gap-2">
          {users.map((user) => (
            <SearchRecentItem key={user.id} type={RECENT_ITEM_TYPE.USER} user={user} onUserClick={onUserClick} />
          ))}
        </Container>
      )}

      {/* Recent tag and full-text searches - one row, most recent first */}
      {searchChips.length > 0 && (
        <Container overrideDefaults className="flex flex-wrap gap-2">
          {searchChips.map((chip) =>
            chip.tag ? (
              <SearchRecentItem key={chip.key} type={RECENT_ITEM_TYPE.TAG} tag={chip.tag} onTagClick={onTagClick} />
            ) : (
              <SearchRecentItem
                key={chip.key}
                type={RECENT_ITEM_TYPE.QUERY}
                query={chip.query}
                onQueryClick={onQueryClick}
              />
            ),
          )}
        </Container>
      )}
    </Container>
  );
}
