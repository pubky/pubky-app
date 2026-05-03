'use client';
import { PostTag } from '../PostTag/PostTag';
import { SearchRecentUserItem } from '../SearchRecentUserItem/SearchRecentUserItem';

import type { SearchRecentItemProps } from './SearchRecentItem.types';
import { RECENT_ITEM_TYPE } from './SearchRecentItem.constants';

/**
 * SearchRecentItem
 *
 * Displays a single recent search item (user or tag).
 * Delegates to SearchRecentUserItem for users to comply with hooks rules.
 * Shows tag label for tags.
 */
export function SearchRecentItem({ type, user, tag, onUserClick, onTagClick }: SearchRecentItemProps) {
  if (type === RECENT_ITEM_TYPE.USER && user && onUserClick) {
    return <SearchRecentUserItem user={user} onClick={onUserClick} />;
  }

  if (type === RECENT_ITEM_TYPE.TAG && tag && onTagClick) {
    const handleClick = () => {
      onTagClick(tag.tag);
    };

    return <PostTag label={tag.tag} onClick={handleClick} data-testid={`recent-tag-${tag.tag}`} />;
  }

  return null;
}
