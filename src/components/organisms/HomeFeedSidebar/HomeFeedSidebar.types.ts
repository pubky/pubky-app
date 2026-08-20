import type { TimelineFeedVariant } from '@/config/feed';

export interface HomeFeedSidebarProps {
  hideReachFilter?: boolean;
  hideSortFilter?: boolean;
  hideLayoutFilter?: boolean;
  allowVisualLayout?: boolean;
  feedVariant?: TimelineFeedVariant;
  variant?: 'sidebar' | 'drawer';
}
