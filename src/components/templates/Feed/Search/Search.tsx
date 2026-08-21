'use client';

import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useSearchCriteria } from '@/hooks/useSearchStreamId/useSearchStreamId';
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
 * - Explains why an invalid shared `?q=` URL shows no results instead of failing silently
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
  const criteria = useSearchCriteria();
  const isMobile = useIsMobile();
  const hasResults = criteria.mode === 'content' || criteria.mode === 'tags';

  return (
    <>
      {/* Mobile search input - hidden on desktop (shown in header there) */}
      <Container className="lg:hidden">
        <SearchInput autoFocus={criteria.mode !== 'content' && (criteria.mode !== 'tags' || isMobile)} />
      </Container>

      {hasResults ? (
        <>
          <SearchHeader
            tags={criteria.mode === 'tags' ? criteria.tags : []}
            query={criteria.mode === 'content' ? criteria.query : null}
          />
          <Container data-cy="post-search-results" overrideDefaults>
            <TimelineFeed variant={TIMELINE_FEED_VARIANT.SEARCH} />
          </Container>
        </>
      ) : (
        <>
          {criteria.mode === 'invalid' && (
            <Typography role="alert" data-testid="search-invalid-query" className="text-muted-foreground">
              {criteria.message}
            </Typography>
          )}
          <SearchEmptyState />
        </>
      )}
    </>
  );
}
