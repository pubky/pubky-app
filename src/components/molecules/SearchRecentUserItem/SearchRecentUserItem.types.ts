import type { Pubky } from '@/models/models.types';
import type { RecentTagSearch, RecentUserSearch } from '@/stores/search/search.types';
/**
 * Recent user search item data
 * Matches RecentUserSearch from search store
 */
export type RecentUserSearchItem = RecentUserSearch;

/**
 * Recent tag search item data
 * Matches RecentTagSearch from search store
 */
export type RecentTagSearchItem = RecentTagSearch;

/**
 * Props for SearchRecentUserItem component
 */
export interface SearchRecentUserItemProps {
  /** User data */
  user: RecentUserSearchItem;
  /** Callback when user item is clicked */
  onClick: (userId: Pubky) => void;
}
