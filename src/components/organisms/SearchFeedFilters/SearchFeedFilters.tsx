'use client';

import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { useSearchCriteria } from '@/hooks/useSearchCriteria/useSearchCriteria';
import { HomeFeedDrawer, HomeFeedDrawerMobile, HomeFeedSidebar } from '../HomeFeedSidebar/HomeFeedSidebar';

type SearchFeedFiltersProps = {
  variant: 'sidebar' | 'drawer' | 'mobile';
};

export function SearchFeedFilters({ variant }: SearchFeedFiltersProps) {
  const criteria = useSearchCriteria();
  const props = {
    hideReachFilter: true,
    // Full-text results are relevance-ranked by Nexus; the sort filter would be a no-op.
    hideSortFilter: criteria.mode === 'content',
    allowVisualLayout: true,
    feedVariant: TIMELINE_FEED_VARIANT.SEARCH,
  } as const;

  if (variant === 'sidebar') {
    return <HomeFeedSidebar {...props} />;
  }
  if (variant === 'mobile') {
    return <HomeFeedDrawerMobile {...props} />;
  }
  return <HomeFeedDrawer {...props} />;
}
