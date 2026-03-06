import type { TimelineFeedVariant } from '../TimelineFeed/TimelineFeed.types';

export interface HomeFeedSidebarProps {
  hideReachFilter?: boolean;
  hideLayoutFilter?: boolean;
  allowVisualLayout?: boolean;
  feedVariant?: TimelineFeedVariant;
  variant?: 'sidebar' | 'drawer';
}
