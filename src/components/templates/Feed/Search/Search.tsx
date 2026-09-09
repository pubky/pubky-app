'use client';

import type { ReactNode } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { useFeedLayoutResolution } from '@/hooks/useFeedLayoutResolution/useFeedLayoutResolution';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useSearchCriteria } from '@/hooks/useSearchCriteria/useSearchCriteria';
import { SearchEmptyState } from '@/molecules/SearchEmptyState/SearchEmptyState';
import { SearchCollections } from '@/organisms/Collections/SearchCollections/SearchCollections';
import { SearchContentTags } from '@/organisms/SearchContentTags/SearchContentTags';
import { SearchInput } from '@/organisms/SearchInput/SearchInput';
import { SearchPeople } from '@/organisms/SearchPeople/SearchPeople';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';
import { useHomeStore } from '@/stores/home/home.store';
import { CONTENT } from '@/stores/home/home.types';

/**
 * Search Template
 *
 * Renders results for the URL criteria — a full-text query (?q=bitcoin) wins
 * over tags (?tags=pubky,bitcoin).
 *
 * Tag search: People and Collections preview sections above the posts feed,
 * but only in the default view (Content filter = All, no visual layout) —
 * narrower filters show the bare feed so the Collections content filter isn't
 * duplicated. Full-text search shows a Tags row instead (prefix matches of the
 * query terms) as a pivot back to tag search.
 *
 * An invalid shared `?q=` URL renders an explanation instead of silently
 * showing nothing; with no criteria at all, the empty state renders.
 *
 * Mounted as `{children}` of `(feeds)/layout.tsx`, which keeps the page shell
 * (sidebars, drawers, right rail) mounted across feed-page navigations. The
 * shell config for `/search` lives in `app/(main)/(feeds)/_shell/configs.tsx`.
 */
export function Search() {
  const criteria = useSearchCriteria();
  const isMobile = useIsMobile();
  const content = useHomeStore((state) => state.content);
  // Same layout resolution the search TimelineFeed uses internally, so the
  // section gating here can never disagree with what the feed actually renders.
  const { isVisualActive } = useFeedLayoutResolution(TIMELINE_FEED_VARIANT.SEARCH);
  const showTagSections = content === CONTENT.ALL && !isVisualActive;

  const feed = (
    <Container data-cy="post-search-results" overrideDefaults>
      <TimelineFeed variant={TIMELINE_FEED_VARIANT.SEARCH} />
    </Container>
  );

  const renderResults = (): ReactNode => {
    switch (criteria.mode) {
      case 'tags':
        return showTagSections ? (
          <Container overrideDefaults className="flex w-full flex-col gap-4">
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
        );
      case 'content':
        return (
          <Container overrideDefaults className="flex w-full flex-col gap-4">
            <SearchContentTags />
            {feed}
          </Container>
        );
      case 'invalid':
        return (
          <>
            <Typography role="alert" data-testid="search-invalid-query" className="text-muted-foreground">
              {criteria.message}
            </Typography>
            <SearchEmptyState />
          </>
        );
      case 'none':
        return <SearchEmptyState />;
      default: {
        const exhaustive: never = criteria;
        return exhaustive;
      }
    }
  };

  return (
    <>
      {/* Mobile-only input — desktop shows it in the header */}
      <Container className="lg:hidden">
        {/* Autofocus only when empty (or tag mode on mobile): focus opens the
            suggestions dropdown, which would cover results — or, in invalid
            mode, the alert explaining why there are none. */}
        <SearchInput autoFocus={criteria.mode === 'none' || (isMobile && criteria.mode === 'tags')} />
      </Container>

      {renderResults()}
    </>
  );
}
