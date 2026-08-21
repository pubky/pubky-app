import type { Pubky } from '@/models/models.types';
import type {
  RecentQuerySearchItem,
  RecentTagSearchItem,
  RecentUserSearchItem,
} from '../SearchRecentUserItem/SearchRecentUserItem.types';

/**
 * Props for SearchRecentSection component
 */
export interface SearchRecentSectionProps {
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
