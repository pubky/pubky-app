'use client';

/**
 * SearchRecentSection
 *
 * Displays recent searches in one section: a row of users, then one mixed row of
 * tag chips and full-text query pills sorted by recency (#1840 design).
 * Shows "Recent searches" header with X to clear all.
 * The parent caps each incoming list at MAX_RECENT_SEARCHES; the merged
 * tag+query row is capped here again so it never doubles that limit.
 */
import { X } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import type { Pubky } from '@/models/models.types';
import { MAX_RECENT_SEARCHES } from '@/stores/search/search.constants';
import { SearchRecentItem } from '../SearchRecentItem/SearchRecentItem';
import { RECENT_ITEM_TYPE } from '../SearchRecentItem/SearchRecentItem.constants';
import type {
  RecentQuerySearchItem,
  RecentTagSearchItem,
  RecentUserSearchItem,
} from '../SearchRecentUserItem/SearchRecentUserItem.types';

interface SearchRecentSectionProps {
  /** Recent user searches */
  users: RecentUserSearchItem[];
  /** Recent tag searches */
  tags: RecentTagSearchItem[];
  /** Recent full-text query searches */
  queries: RecentQuerySearchItem[];
  /** Callback when a user item is clicked */
  onUserClick: (userId: Pubky) => void;
  /** Callback when a tag item is clicked */
  onTagClick: (tag: string) => void;
  /** Callback when a query item is clicked (re-runs the full-text search) */
  onQueryClick: (query: string) => void;
  /** Callback to clear all recent searches */
  onClearAll?: () => void;
}

/** Tag and full-text searches share one row, interleaved by recency. */
type RecentSearchChip =
  | { kind: 'tag'; key: string; searchedAt: number; item: RecentTagSearchItem }
  | { kind: 'query'; key: string; searchedAt: number; item: RecentQuerySearchItem };

export function SearchRecentSection({
  users,
  tags,
  queries,
  onUserClick,
  onTagClick,
  onQueryClick,
  onClearAll,
}: SearchRecentSectionProps) {
  const searchChips: RecentSearchChip[] = [
    ...tags.map(
      (tag): RecentSearchChip => ({ kind: 'tag', key: `tag-${tag.tag}`, searchedAt: tag.searchedAt, item: tag }),
    ),
    ...queries.map(
      (query): RecentSearchChip => ({
        kind: 'query',
        key: `query-${query.query}`,
        searchedAt: query.searchedAt,
        item: query,
      }),
    ),
  ]
    .sort((a, b) => b.searchedAt - a.searchedAt)
    // Cap the MERGED row: each source list is already capped, but together they
    // could double the limit and push "Hot tags" out of short viewports.
    .slice(0, MAX_RECENT_SEARCHES);

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
            type="button"
            overrideDefaults
            // `overrideDefaults` drops the base focus ring — restore it so the
            // only header control stays visible to keyboard users.
            className="flex cursor-pointer items-center rounded text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
        <Container overrideDefaults className="flex flex-wrap gap-x-6 gap-y-3">
          {users.map((user) => (
            <SearchRecentItem key={user.id} type={RECENT_ITEM_TYPE.USER} user={user} onUserClick={onUserClick} />
          ))}
        </Container>
      )}

      {/* Recent tag and full-text searches - one row, most recent first */}
      {searchChips.length > 0 && (
        <Container overrideDefaults className="flex flex-wrap gap-2">
          {searchChips.map((chip) =>
            chip.kind === 'tag' ? (
              <SearchRecentItem key={chip.key} type={RECENT_ITEM_TYPE.TAG} tag={chip.item} onTagClick={onTagClick} />
            ) : (
              <SearchRecentItem
                key={chip.key}
                type={RECENT_ITEM_TYPE.QUERY}
                query={chip.item}
                onQueryClick={onQueryClick}
              />
            ),
          )}
        </Container>
      )}
    </Container>
  );
}
