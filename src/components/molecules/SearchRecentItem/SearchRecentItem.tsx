'use client';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { cn } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { PostTag } from '../PostTag/PostTag';
import { SearchRecentUserItem } from '../SearchRecentUserItem/SearchRecentUserItem';
import type {
  RecentQuerySearchItem,
  RecentTagSearchItem,
  RecentUserSearchItem,
} from '../SearchRecentUserItem/SearchRecentUserItem.types';
import { RECENT_ITEM_TYPE } from './SearchRecentItem.constants';

/** Each variant requires its own data + click handler, so invalid combos (e.g. a user item without user data) are compile errors. */
type SearchRecentItemProps =
  | { type: typeof RECENT_ITEM_TYPE.USER; user: RecentUserSearchItem; onUserClick: (userId: Pubky) => void }
  | { type: typeof RECENT_ITEM_TYPE.TAG; tag: RecentTagSearchItem; onTagClick: (tag: string) => void }
  | { type: typeof RECENT_ITEM_TYPE.QUERY; query: RecentQuerySearchItem; onQueryClick: (query: string) => void };

/**
 * SearchRecentItem
 *
 * Displays a single recent search item (user, tag, or full-text query).
 * Delegates to SearchRecentUserItem for users to comply with hooks rules.
 * Tags render as colored PostTag chips; full-text queries render as outlined
 * pills (bg background / border input / text foreground, #1840 design) so the
 * two are distinguishable at a glance.
 */
export function SearchRecentItem(props: SearchRecentItemProps) {
  switch (props.type) {
    case RECENT_ITEM_TYPE.USER:
      return <SearchRecentUserItem user={props.user} onClick={props.onUserClick} />;

    case RECENT_ITEM_TYPE.TAG: {
      const { tag, onTagClick } = props;
      return <PostTag label={tag.tag} onClick={() => onTagClick(tag.tag)} data-testid={`recent-tag-${tag.tag}`} />;
    }

    case RECENT_ITEM_TYPE.QUERY: {
      const { query, onQueryClick } = props;
      return (
        <Button
          type="button"
          variant={ButtonVariant.OUTLINE}
          size="sm"
          onClick={() => onQueryClick(query.query)}
          // Keeps the base focus-visible ring (unlike `overrideDefaults`, which
          // would drop it — same approach as PostTagAddButton).
          className={cn(
            // bg-background repeats the outline variant's class on purpose: the
            // variant also carries bg-input/30 which wins the merge, so it must be
            // re-asserted here to keep the pill solid.
            'max-w-full truncate rounded-md bg-background font-bold text-foreground',
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

    default: {
      const exhaustive: never = props;
      return exhaustive;
    }
  }
}
