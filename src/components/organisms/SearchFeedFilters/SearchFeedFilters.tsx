'use client';

import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { useContentSearchQuery } from '@/hooks/useSearchStreamId/useSearchStreamId';
import { HomeFeedDrawer, HomeFeedDrawerMobile, HomeFeedSidebar } from '../HomeFeedSidebar/HomeFeedSidebar';

type SearchFeedFiltersProps = {
  variant: 'sidebar' | 'drawer' | 'mobile';
};

export function SearchFeedFilters({ variant }: SearchFeedFiltersProps) {
  const query = useContentSearchQuery();
  const props = {
    hideReachFilter: true,
    hideSortFilter: Boolean(query),
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
