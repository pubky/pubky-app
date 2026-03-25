import type { TimelineFeedVariant } from '@/config';

export interface HomeFeedSidebarProps {
  hideReachFilter?: boolean;
  hideLayoutFilter?: boolean;
  allowVisualLayout?: boolean;
  feedVariant?: TimelineFeedVariant;
  variant?: 'sidebar' | 'drawer';
}
