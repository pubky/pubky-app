'use client';

import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { useFeedLayoutResolution } from '@/hooks/useFeedLayoutResolution/useFeedLayoutResolution';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useSearchCriteria } from '@/hooks/useSearchStreamId/useSearchStreamId';
import { SearchEmptyState } from '@/molecules/SearchEmptyState/SearchEmptyState';
import { SearchCollections } from '@/organisms/Collections/SearchCollections/SearchCollections';
import { SearchInput } from '@/organisms/SearchInput/SearchInput';
import { SearchPeople } from '@/organisms/SearchPeople/SearchPeople';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';
import { useHomeStore } from '@/stores/home/home.store';
import { CONTENT } from '@/stores/home/home.types';

/**
 * Search Template
 *
 * Results for the criteria in the URL — a full-text query (?q=bitcoin) takes
 * precedence over tags (?tags=pubky,bitcoin).
 *
 * Tag search shows the People and Collections sections (expandable previews)
 * above the posts feed under a "Posts" heading. Sections render only in the
 * default view (Content filter = All, visual layout inactive) — narrower filters
 * show the bare feed, avoiding duplication with the Collections content filter.
 * Both sections are tag-driven, so full-text search shows the posts feed alone.
 *
 * An invalid shared `?q=` URL explains itself instead of failing silently;
 * without any criteria the empty state renders.
 *
 * Rendered as `{children}` inside the shared `(feeds)/layout.tsx`, which hoists
 * the `ContentLayout` shell (sidebars, drawers, right rail) across the feed
 * cluster so it stays mounted across intra-cluster transitions. The shell
 * config for `/search` lives in `app/(feeds)/_shell/configs.tsx`.
 */
export function Search() {
  const criteria = useSearchCriteria();
  const isMobile = useIsMobile();
  const content = useHomeStore((state) => state.content);
  // Same resolution SearchTimelineFeed uses internally, so the template's
  // section gating can never disagree with the feed's effective layout.
  const { isVisualActive } = useFeedLayoutResolution(TIMELINE_FEED_VARIANT.SEARCH);
  const showSections = criteria.mode === 'tags' && content === CONTENT.ALL && !isVisualActive;
  const hasResults = criteria.mode === 'content' || criteria.mode === 'tags';

  const feed = (
    <Container data-cy="post-search-results" overrideDefaults>
      <TimelineFeed variant={TIMELINE_FEED_VARIANT.SEARCH} />
    </Container>
  );

  return (
    <>
      {/* Mobile search input - hidden on desktop (shown in header there) */}
      <Container className="lg:hidden">
        <SearchInput autoFocus={criteria.mode !== 'content' && (criteria.mode !== 'tags' || isMobile)} />
      </Container>

      {hasResults ? (
        showSections ? (
          <Container overrideDefaults className="flex w-full flex-col gap-6">
            <SearchPeople />
            <SearchCollections />
            <Container overrideDefaults className="flex w-full flex-col gap-4">
              <Heading level={2} size="lg" className="font-light text-muted-foreground">
                {'Posts'}
              </Heading>
              {feed}
            </Container>
          </Container>
        ) : (
          feed
        )
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
