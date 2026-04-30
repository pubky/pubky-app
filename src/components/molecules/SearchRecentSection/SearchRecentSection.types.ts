import type { RecentUserSearchItem, RecentTagSearchItem } from '../SearchRecentUserItem/SearchRecentUserItem.types';
import type { Pubky } from '@/models/models.types';
/**
 * Props for SearchRecentSection component
 */
export interface SearchRecentSectionProps {
  /** Recent user searches */
  users: RecentUserSearchItem[];
  /** Recent tag searches */
  tags: RecentTagSearchItem[];
  /** Callback when a user item is clicked */
  onUserClick: (userId: Pubky) => void;
  /** Callback when a tag item is clicked */
  onTagClick: (tag: string) => void;
  /** Callback to clear all recent searches */
  onClearAll?: () => void;
}
