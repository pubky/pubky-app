'use client';

import { Container } from '@/atoms/Container/Container';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useSearchTags } from '@/hooks/useSearchStreamId/useSearchStreamId';
import { SearchEmptyState } from '@/molecules/SearchEmptyState/SearchEmptyState';
import { SearchHeader } from '@/molecules/SearchHeader/SearchHeader';
import { SearchInput } from '@/organisms/SearchInput/SearchInput';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';

/**
 * Search Template
 *
 * Template for the Search page that displays posts filtered by tags.
 * Tags are parsed from URL query parameters (?tags=pubky,bitcoin).
 *
 * Features:
 * - Displays search results when tags are provided
 * - Shows empty state when no tags in URL
 * - Uses TimelineFeed with SEARCH variant for infinite scroll
 * - Shows SearchInput on mobile (hidden on desktop where it's in the header)
 *
 * Rendered as `{children}` inside the shared `(feeds)/layout.tsx`, which hoists
 * the `ContentLayout` shell (sidebars, drawers, right rail) across the feed
 * cluster so it stays mounted across intra-cluster transitions. The shell
 * config for `/search` lives in `app/(feeds)/_shell/configs.tsx`.
 */
export function Search() {
  // Get tags from URL query params
  const tags = useSearchTags();
  const isMobile = useIsMobile();
  const hasTags = tags.length > 0;

  return (
    <>
      {/* Mobile search input - hidden on desktop (shown in header there) */}
      <Container className="lg:hidden">
        <SearchInput autoFocus={!hasTags || isMobile} />
      </Container>

      {hasTags ? (
        <>
          <SearchHeader tags={tags} />
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
