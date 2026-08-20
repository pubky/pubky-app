'use client';

import { Container } from '@/atoms/Container/Container';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useContentSearchQuery, useSearchTags } from '@/hooks/useSearchStreamId/useSearchStreamId';
import { SearchEmptyState } from '@/molecules/SearchEmptyState/SearchEmptyState';
import { SearchHeader } from '@/molecules/SearchHeader/SearchHeader';
import { SearchInput } from '@/organisms/SearchInput/SearchInput';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';

/**
 * Search Template
 *
 * Template for the Search page that displays full-text or tag-filtered posts.
 * Criteria are parsed from `?q=bitcoin` or `?tags=pubky,bitcoin`.
 *
 * Features:
 * - Displays full-text results when a valid query is provided (takes precedence)
 * - Displays tag results when tags are provided
 * - Shows empty state when neither criterion is present
 * - Uses TimelineFeed with SEARCH variant for infinite scroll
 * - Shows SearchInput on mobile (hidden on desktop where it's in the header)
 *
 * Rendered as `{children}` inside the shared `(feeds)/layout.tsx`, which hoists
 * the `ContentLayout` shell (sidebars, drawers, right rail) across the feed
 * cluster so it stays mounted across intra-cluster transitions. The shell
 * config for `/search` lives in `app/(feeds)/_shell/configs.tsx`.
 */
export function Search() {
  const tags = useSearchTags();
  const query = useContentSearchQuery();
  const isMobile = useIsMobile();
  const hasTags = tags.length > 0;
  const hasSearchCriteria = Boolean(query) || hasTags;

  return (
    <>
      {/* Mobile search input - hidden on desktop (shown in header there) */}
      <Container className="lg:hidden">
        <SearchInput autoFocus={!query && (!hasTags || isMobile)} />
      </Container>

      {hasSearchCriteria ? (
        <>
          <SearchHeader tags={tags} query={query} />
          <Container data-cy="post-search-results" overrideDefaults>
            <TimelineFeed variant={TIMELINE_FEED_VARIANT.SEARCH} />
          </Container>
        </>
      ) : (
        <SearchEmptyState />
      )}
    </>
  );
}
