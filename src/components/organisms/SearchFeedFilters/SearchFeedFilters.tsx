'use client';

import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { isPinakesReachSetServed } from '@/config/pinakes';
import { useFeedLayoutResolution } from '@/hooks/useFeedLayoutResolution/useFeedLayoutResolution';
import { useResourceSearchFilters } from '@/hooks/useResourceSearchFilters/useResourceSearchFilters';
import { useSearchCriteria } from '@/hooks/useSearchCriteria/useSearchCriteria';
import { useSearchReach } from '@/hooks/useSearchReach/useSearchReach';
import { FilterReach } from '@/molecules/Filters/FilterReach/FilterReach';
import { useHomeStore } from '@/stores/home/home.store';
import { CONTENT, REACH } from '@/stores/home/home.types';
import { TEXT_SEARCH_DISABLED_CONTENT } from '@/stores/home/home.utils';
import type { SearchReach } from '@/stores/search/search.types';
import { HomeFeedDrawer, HomeFeedDrawerMobile, HomeFeedSidebar } from '../HomeFeedSidebar/HomeFeedSidebar';
import { SearchResourceFilters } from '../SearchResources/SearchResourceFilters';
import { resolveVisualFeedContent } from '../Timeline/Feed/TimelineFeed/TimelineFeedVisual.helpers';

const SEARCH_REACH_OPTIONS = [REACH.ALL, REACH.NETWORK, REACH.FOLLOWING, REACH.FRIENDS] as const;
/**
 * The Search reaches the external resource search has no counterpart for: not listed for external
 * resources. My network is one unless the configured Pinakes serves reach sets (`wot_2`).
 */
const RESOURCE_HIDDEN_REACHES: readonly SearchReach[] = [REACH.NETWORK];

type SearchFeedFiltersProps = {
  variant: 'sidebar' | 'drawer' | 'mobile';
};

export function SearchFeedFilters({ variant }: SearchFeedFiltersProps) {
  const criteria = useSearchCriteria();
  const { isFiltersSearch } = useResourceSearchFilters();
  const { reach, setReach } = useSearchReach();
  // External resources are searched in the Search reach too (signed out, it is All, like posts). The
  // tab has its own sort.
  const content = useHomeStore((state) => state.content);
  const { isVisualActive } = useFeedLayoutResolution(TIMELINE_FEED_VARIANT.SEARCH);
  // A link or identifier search, and filters alone (shared by, in a collection), list external
  // resources only, whatever the Content filter or layout
  const isResourceContent =
    criteria.mode === 'resource' ||
    (criteria.mode === 'none' && isFiltersSearch) ||
    resolveVisualFeedContent({ content, variant: TIMELINE_FEED_VARIANT.SEARCH, isVisualActive }) === CONTENT.RESOURCES;
  const props = {
    reachFilter: (
      <FilterReach
        selectedTab={reach}
        options={SEARCH_REACH_OPTIONS}
        onTabChange={setReach}
        hiddenTabs={isResourceContent && !isPinakesReachSetServed() ? RESOURCE_HIDDEN_REACHES : undefined}
      />
    ),
    // The External resources tab's own filters (kind, order, tags, rows), with a search to filter
    // (filters alone, with no text or tags, are a search too)
    extraFilters:
      isResourceContent && criteria.mode !== 'invalid' && (criteria.mode !== 'none' || isFiltersSearch) ? (
        <SearchResourceFilters />
      ) : undefined,
    // Full-text results are relevance-ranked by Nexus; the sort filter would be a no-op.
    hideSortFilter: criteria.mode === 'content' || criteria.mode === 'resource' || isResourceContent,
    disabledContent: criteria.mode === 'content' ? TEXT_SEARCH_DISABLED_CONTENT : undefined,
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
