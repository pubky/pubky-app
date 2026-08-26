'use client';
import { Button } from '@/atoms/Button/Button';
import { cn } from '@/libs/utils/utils';
import { PostTag } from '../PostTag/PostTag';
import { SearchRecentUserItem } from '../SearchRecentUserItem/SearchRecentUserItem';
import { RECENT_ITEM_TYPE } from './SearchRecentItem.constants';
import type { SearchRecentItemProps } from './SearchRecentItem.types';

/**
 * SearchRecentItem
 *
 * Displays a single recent search item (user, tag, or full-text query).
 * Delegates to SearchRecentUserItem for users to comply with hooks rules.
 * Tags render as colored PostTag chips; full-text queries render as outlined
 * pills (bg background / border input / text foreground, #1840 design) so the
 * two are distinguishable at a glance.
 */
export function SearchRecentItem({
  type,
  user,
  tag,
  query,
  onUserClick,
  onTagClick,
  onQueryClick,
}: SearchRecentItemProps) {
  if (type === RECENT_ITEM_TYPE.USER && user && onUserClick) {
    return <SearchRecentUserItem user={user} onClick={onUserClick} />;
  }

  if (type === RECENT_ITEM_TYPE.TAG && tag && onTagClick) {
    const handleClick = () => {
      onTagClick(tag.tag);
    };

    return <PostTag label={tag.tag} onClick={handleClick} data-testid={`recent-tag-${tag.tag}`} />;
  }

  if (type === RECENT_ITEM_TYPE.QUERY && query && onQueryClick) {
    const handleClick = () => {
      onQueryClick(query.query);
    };

    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        // Keeps the base focus-visible ring (unlike `overrideDefaults`, which
        // would drop it — same approach as PostTagAddButton).
        className={cn(
          'h-8 max-w-full shrink-0 truncate rounded-md bg-background px-3 text-sm leading-5 font-bold text-foreground',
          'shadow-none transition-opacity hover:bg-background hover:text-foreground hover:opacity-80',
        )}
        // Not a tag: activating it runs a full-text search, so announce it as one.
        aria-label={`Search for ${query.query}`}
        data-testid={`recent-query-${query.query}`}
      >
        {query.query}
      </Button>
    );
  }

  return null;
}
