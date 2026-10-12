'use client';

import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { useSearchCriteria } from '@/hooks/useSearchCriteria/useSearchCriteria';
import { useSearchReach } from '@/hooks/useSearchReach/useSearchReach';
import { FilterReach } from '@/molecules/Filters/FilterReach/FilterReach';
import { REACH } from '@/stores/home/home.types';
import { HomeFeedDrawer, HomeFeedDrawerMobile, HomeFeedSidebar } from '../HomeFeedSidebar/HomeFeedSidebar';

const SEARCH_REACH_OPTIONS = [REACH.ALL, REACH.NETWORK, REACH.FOLLOWING, REACH.FRIENDS] as const;

type SearchFeedFiltersProps = {
  variant: 'sidebar' | 'drawer' | 'mobile';
};

export function SearchFeedFilters({ variant }: SearchFeedFiltersProps) {
  const criteria = useSearchCriteria();
  const { reach, setReach } = useSearchReach();
  const props = {
    reachFilter: <FilterReach selectedTab={reach} options={SEARCH_REACH_OPTIONS} onTabChange={setReach} />,
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
