import type { Pubky } from '@/models/models.types';
import type { RecentQuerySearch, RecentTagSearch, RecentUserSearch } from '@/stores/search/search.types';

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
 * Recent full-text query search item data
 * Matches RecentQuerySearch from search store
 */
export type RecentQuerySearchItem = RecentQuerySearch;

/**
 * Props for SearchRecentUserItem component
 */
export interface SearchRecentUserItemProps {
  /** User data */
  user: RecentUserSearchItem;
  /** Callback when user item is clicked */
  onClick: (userId: Pubky) => void;
}
