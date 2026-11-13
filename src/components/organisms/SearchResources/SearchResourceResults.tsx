'use client';

import { CalendarDays, List, type LucideIcon, Map as MapIcon, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import {
  type TResourceResultsView,
  useResourceResultsView,
} from '@/hooks/useResourceResultsView/useResourceResultsView';
import { RESOURCE_SEARCH_UNAVAILABLE, useResourceSearch } from '@/hooks/useResourceSearch/useResourceSearch';
import { useResourceSearchFilters } from '@/hooks/useResourceSearchFilters/useResourceSearchFilters';
import { useSearchCriteria } from '@/hooks/useSearchCriteria/useSearchCriteria';
import {
  canNarrowTags,
  type TResourceFeedSearch,
  useSearchResourceQuery,
} from '@/hooks/useSearchResourceQuery/useSearchResourceQuery';
import { useTagSearch } from '@/hooks/useTagSearch/useTagSearch';
import { useUserDetails } from '@/hooks/useUserDetails/useUserDetails';
import { formatPublicKey } from '@/libs/utils/utils';
import { PostTag } from '@/molecules/PostTag/PostTag';
import { ResourceItem } from '@/molecules/ResourceCard/ResourceItem';
import { SearchResultsEmpty } from '@/molecules/SearchResultsEmpty/SearchResultsEmpty';
import { ResourceTimelineFeed } from '@/organisms/Timeline/Feed/ResourceTimelineFeed/ResourceTimelineFeed';
import type { LayoutType } from '@/stores/home/home.types';
import { SearchEventAgenda } from './SearchEventAgenda';
import { SearchResourceMap } from './SearchResourceMap';

/** Related tags offered at once. */
const RELATED_TAGS_SHOWN = 8;

/** The app's secondary pill (`variant="outline"` on the page): a filter that is on, pressed to remove it. */
const ACTIVE_FILTER_CLASS =
  'max-w-full min-w-0 border-foreground/30 bg-background text-foreground hover:border-foreground/50 hover:bg-background/60';

/** The kinds whose results have a place: their search can be seen on a map; events list as an agenda. */
const MAPPED_KINDS: Readonly<Record<string, { kind: 'event' | 'place'; list: string; icon: LucideIcon }>> = {
  event: { kind: 'event', list: 'Agenda', icon: CalendarDays },
  place: { kind: 'place', list: 'List', icon: List },
};

/**
 * SearchResourceResults
 *
 * The External resources tab of `/search`: the resource search of the box with the URL's filters
 * (`useSearchResourceQuery`; kind, type, order, tags and rows are picked in the filter panel,
 * `SearchResourceFilters`). Above the results: the person and the collection the search is narrowed
 * to (each removable), and the related tags, which narrow a tag search (every tag must match) or, on
 * a text search, start a tag search. A searched link's card goes on top.
 *
 * A search of Events lists as an agenda (`SearchEventAgenda`: by day, each calendar occurrence an
 * event of its own), and a search of Events or Places can be seen on a map instead
 * (`SearchResourceMap`), picked above the results and kept in the URL (`useResourceResultsView`).
 * Every other search, a searched link and a feed keep the list.
 *
 * With `feed`, the same list for a feed's External resources (Home): the panel's filters on the
 * feed's search, under the feed's own `children` (the composer), with no related tags.
 */
export function SearchResourceResults({
  layout,
  feed,
  children,
}: {
  layout: LayoutType;
  feed?: TResourceFeedSearch;
  children?: ReactNode;
}) {
  const criteria = useSearchCriteria();
  const { addTagToSearch } = useTagSearch();
  const { setFilters } = useResourceSearchFilters();
  const { query, isPending, kindsFailed, retryKinds, kindsUnavailable, url, filters, searchedTags, narrowTags } =
    useSearchResourceQuery({ withKinds: true, feed });
  const { view, setView } = useResourceResultsView();
  // Events and Places of Search have an agenda and a map, which read the rows' own cards
  const mapped = !feed && !url ? (MAPPED_KINDS[filters.kind ?? ''] ?? null) : null;
  const read = useResourceSearch(query, { facets: true, ...(mapped ? { cards: true } : {}) });
  // Picked sub-kinds wait for the index's types: the list is loading, not empty; when those cannot be
  // read, they have nothing to search: the read's failure, with its retry
  const search = isPending
    ? { ...read, loading: true }
    : kindsFailed
      ? { ...read, error: RESOURCE_SEARCH_UNAVAILABLE, retry: retryKinds, unavailable: kindsUnavailable }
      : read;
  const { userDetails: author } = useUserDetails(filters.author);

  const pickRelatedTag = (tag: string) => {
    if (criteria.mode !== 'tags') {
      addTagToSearch(tag, { addToRecent: true });
      return;
    }
    if (canNarrowTags(searchedTags.length, narrowTags.length)) setFilters({ narrowTags: [...narrowTags, tag] });
  };

  // What is related to a searched link takes no author or collection: those filters are not shown
  const authorName =
    filters.author && !url ? author?.name || formatPublicKey({ key: filters.author, length: 8 }) : null;
  const inCollection = url ? null : filters.inCollection;

  const viewButton = (value: TResourceResultsView, label: string, Icon: LucideIcon) => (
    <Button
      type="button"
      variant={view === value ? 'secondary' : 'ghost'}
      size="sm"
      aria-pressed={view === value}
      onClick={() => setView(value)}
      data-testid={`search-resource-view-${value}`}
    >
      <Icon aria-hidden="true" />
      {label}
    </Button>
  );

  const controls = (
    <Container overrideDefaults className="flex flex-col gap-3" data-testid="search-resource-controls">
      {mapped && (
        <Container
          overrideDefaults
          role="group"
          aria-label="View"
          className="flex items-center gap-1"
          data-testid="search-resource-view"
        >
          {viewButton('list', mapped.list, mapped.icon)}
          {viewButton('map', 'Map', MapIcon)}
        </Container>
      )}
      {(authorName || inCollection) && (
        <Container
          overrideDefaults
          className="flex flex-wrap items-center gap-2"
          data-testid="search-resource-active-filters"
        >
          {authorName && (
            <Button
              variant="outline"
              size="sm"
              aria-label={`Remove Shared by ${authorName}`}
              onClick={() => setFilters({ author: null })}
              className={ACTIVE_FILTER_CLASS}
              data-testid="search-resource-author"
            >
              <span className="truncate" title={`Shared by ${authorName}`}>{`Shared by ${authorName}`}</span>
              <X />
            </Button>
          )}
          {inCollection && (
            <Button
              variant="outline"
              size="sm"
              aria-label="Remove In a collection"
              onClick={() => setFilters({ inCollection: null })}
              className={ACTIVE_FILTER_CLASS}
              data-testid="search-resource-collection"
            >
              {'In a collection'}
              <X />
            </Button>
          )}
        </Container>
      )}
      {!feed && (narrowTags.length > 0 || search.relatedTags.length > 0) && (
        <Container overrideDefaults className="flex flex-wrap gap-2" data-testid="search-resource-related-tags">
          {narrowTags.map((tag) => (
            <PostTag
              key={tag}
              label={tag}
              selected
              showClose
              aria-label={`Remove ${tag}`}
              onClick={() => setFilters({ narrowTags: narrowTags.filter((picked) => picked !== tag) })}
              onClose={() => setFilters({ narrowTags: narrowTags.filter((picked) => picked !== tag) })}
            />
          ))}
          {search.relatedTags
            .filter((tag) => !narrowTags.includes(tag))
            .slice(0, RELATED_TAGS_SHOWN)
            .map((tag) => (
              <PostTag
                key={tag}
                label={tag}
                disabled={criteria.mode === 'tags' && !canNarrowTags(searchedTags.length, narrowTags.length)}
                onClick={() => pickRelatedTag(tag)}
              />
            ))}
        </Container>
      )}
      {search.reachTruncated && (
        <Typography size="sm" className="text-muted-foreground" data-testid="search-resource-reach-truncated">
          {'Your network is large: these come from part of it.'}
        </Typography>
      )}
      {search.source === 'nexus' && (
        <Typography size="sm" className="text-muted-foreground" data-testid="search-resource-fallback-note">
          {'Search is unavailable right now: showing the latest tagged resources.'}
        </Typography>
      )}
    </Container>
  );

  if (mapped && view === 'map') {
    return (
      <SearchResourceMap kind={mapped.kind} search={search}>
        {children}
        {controls}
      </SearchResourceMap>
    );
  }
  if (mapped?.kind === 'event') {
    return (
      <SearchEventAgenda search={search}>
        {children}
        {controls}
      </SearchEventAgenda>
    );
  }

  return (
    <ResourceTimelineFeed
      search={search}
      layout={layout}
      leadingItem={url ? <ResourceItem uri={url} data-testid="search-resource-top" /> : undefined}
      emptyState={feed ? undefined : <SearchResultsEmpty isCollections={false} isResources />}
    >
      {children}
      {!feed && controls}
    </ResourceTimelineFeed>
  );
}
