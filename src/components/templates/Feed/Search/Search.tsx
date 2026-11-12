'use client';

import type { ReactNode } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { useFeedLayoutResolution } from '@/hooks/useFeedLayoutResolution/useFeedLayoutResolution';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useResourceFiltersTab } from '@/hooks/useResourceFiltersTab/useResourceFiltersTab';
import { useResourceSearchFilters } from '@/hooks/useResourceSearchFilters/useResourceSearchFilters';
import { useSearchCriteria } from '@/hooks/useSearchCriteria/useSearchCriteria';
import { SearchEmptyState } from '@/molecules/SearchEmptyState/SearchEmptyState';
import { SearchCollections } from '@/organisms/Collections/SearchCollections/SearchCollections';
import { SearchContentTags } from '@/organisms/SearchContentTags/SearchContentTags';
import { SearchInput } from '@/organisms/SearchInput/SearchInput';
import { SearchPeople } from '@/organisms/SearchPeople/SearchPeople';
import { SearchResourceResults } from '@/organisms/SearchResources/SearchResourceResults';
import { SearchResources } from '@/organisms/SearchResources/SearchResources';
import { TimelineFeed } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';
import { resolveVisualFeedContent } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeedVisual.helpers';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useHomeStore } from '@/stores/home/home.store';
import { CONTENT, LAYOUT } from '@/stores/home/home.types';

/**
 * Search Template
 *
 * Renders results for the URL criteria — a full-text query (?q=bitcoin) wins
 * over tags (?tags=pubky,bitcoin).
 *
 * Tag search: People, Collections and External resources preview sections
 * above the posts feed, but only in the default view (Content filter = All, no
 * visual layout) — narrower filters show the bare feed so a section isn't
 * duplicated; External resources shows the resources feed under its heading.
 * Full-text search shows a Tags row instead (prefix matches of the query
 * terms) as a pivot back to tag search, and the External resources section
 * too. A link or an identifier no post search takes shows external resources
 * only: the link's card first, then what is related to it.
 *
 * The External resources tab's filters live in the URL: a search shared with them opens that tab,
 * and leaving the tab for another Content drops them, so a reload stays where the viewer went.
 * Filters alone, with no text or tags (`/search?by=<pubky>`: the links one user shared; `?in=`: a
 * collection's), are an External resources search of their own.
 *
 * An invalid shared `?q=` URL renders an explanation instead of silently
 * showing nothing; with no criteria at all, the empty state renders.
 *
 * Mounted as `{children}` of `(feeds)/layout.tsx`, which keeps the page shell
 * (sidebars, drawers, right rail) mounted across feed-page navigations. The
 * shell config for `/search` lives in `app/(feeds)/_shell/configs.tsx`.
 */
export function Search() {
  const criteria = useSearchCriteria();
  const isMobile = useIsMobile();
  const content = useHomeStore((state) => state.content);
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const { isFiltersSearch } = useResourceSearchFilters();
  // Same layout resolution the search TimelineFeed uses internally, so the
  // section gating here can never disagree with what the feed actually renders.
  const { isVisualActive } = useFeedLayoutResolution(TIMELINE_FEED_VARIANT.SEARCH);
  const showTagSections = content === CONTENT.ALL && !isVisualActive;
  const isResourceContent =
    resolveVisualFeedContent({ content, variant: TIMELINE_FEED_VARIANT.SEARCH, isVisualActive }) === CONTENT.RESOURCES;

  // A search shared with External resources filters opens that tab; leaving it drops them
  useResourceFiltersTab();

  const feed = (
    <Container data-cy="post-search-results" overrideDefaults>
      <TimelineFeed variant={TIMELINE_FEED_VARIANT.SEARCH} />
    </Container>
  );
  // The External resources tab: the resource search under its heading
  const resourceSection = (results: ReactNode) => (
    <Container overrideDefaults className="flex w-full flex-col gap-4">
      <Heading level={2} size="lg" className="font-light text-muted-foreground">
        {'External resources'}
      </Heading>
      {results}
    </Container>
  );
  // (the feed renders it)
  const resourceResults = resourceSection(feed);

  const renderResults = (): ReactNode => {
    switch (criteria.mode) {
      case 'tags':
        if (isResourceContent) return resourceResults;
        return showTagSections ? (
          <Container overrideDefaults className="flex w-full flex-col gap-8">
            <SearchPeople />
            <SearchCollections />
            <SearchResources />
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
          <Container overrideDefaults className="flex w-full flex-col gap-8">
            <SearchContentTags />
            {isResourceContent ? (
              resourceResults
            ) : (
              <>
                {showTagSections && <SearchResources />}
                <Container overrideDefaults className="flex w-full flex-col gap-4">
                  <Heading level={2} size="lg" className="font-light text-muted-foreground">
                    {'Posts'}
                  </Heading>
                  {feed}
                </Container>
              </>
            )}
          </Container>
        );
      case 'resource':
        // A link or an identifier: external resources only (no post search takes it)
        return isResourceContent ? resourceResults : <SearchResources />;
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
        // Filters alone (the links a user shared, a collection's): external resources only, in columns
        // when the Visual layout (which has no resource tiles) is picked
        if (isFiltersSearch && isVisualActive) {
          // Keyed by viewer like the feed's own resource tab, so a sign-in starts it over
          return resourceSection(<SearchResourceResults key={currentUserPubky ?? 'public'} layout={LAYOUT.COLUMNS} />);
        }
        if (isFiltersSearch) return isResourceContent ? resourceResults : null;
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
            mode, the alert explaining why there are none. Filters alone are
            results too. */}
        <SearchInput
          autoFocus={(criteria.mode === 'none' && !isFiltersSearch) || (isMobile && criteria.mode === 'tags')}
        />
      </Container>

      {renderResults()}
    </>
  );
}
