import type { Pubky } from '@/models/models.types';
import {
  RecentQuerySearchItem,
  RecentTagSearchItem,
  RecentUserSearchItem,
} from '../SearchRecentUserItem/SearchRecentUserItem.types';
import { RECENT_ITEM_TYPE } from './SearchRecentItem.constants';

/**
 * Type derived from RECENT_ITEM_TYPE constant values
 */
export type RecentItemType = (typeof RECENT_ITEM_TYPE)[keyof typeof RECENT_ITEM_TYPE];

/**
 * Props for SearchRecentItem component
 */
export interface SearchRecentItemProps {
  /** Type of recent search item */
  type: RecentItemType;
  /** User data (required if type is 'user') */
  user?: RecentUserSearchItem;
  /** Tag data (required if type is 'tag') */
  tag?: RecentTagSearchItem;
  /** Query data (required if type is 'query') */
  query?: RecentQuerySearchItem;
  /** Callback when user item is clicked (only for type='user') */
  onUserClick?: (userId: Pubky) => void;
  /** Callback when tag item is clicked (only for type='tag') */
  onTagClick?: (tag: string) => void;
  /** Callback when query item is clicked (only for type='query') */
  onQueryClick?: (query: string) => void;
}
