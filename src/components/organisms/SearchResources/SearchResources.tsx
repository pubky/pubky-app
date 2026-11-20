'use client';

import { useEffect } from 'react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { SEARCH_RESOURCES_PREVIEW_COUNT } from '@/config/search';
import { useFeedLayoutResolution } from '@/hooks/useFeedLayoutResolution/useFeedLayoutResolution';
import { useResourceSearch } from '@/hooks/useResourceSearch/useResourceSearch';
import { useSearchResourceQuery } from '@/hooks/useSearchResourceQuery/useSearchResourceQuery';
import { ResourceItem } from '@/molecules/ResourceCard/ResourceItem';
import { ResourceSurfaceProvider } from '@/molecules/ResourceCard/ResourceSurfaceContext';
import { ResourceCardSkeleton } from '@/molecules/ResourceCardSkeleton/ResourceCardSkeleton';
import { toast } from '@/molecules/Toaster/toast';
import { useHomeStore } from '@/stores/home/home.store';
import { CONTENT } from '@/stores/home/home.types';

/**
 * SearchResources
 *
 * "External resources" section on `/search` in the All tab, beside People, Collections and Posts:
 * the first rows of the same resource search the External resources tab runs (tags, text, or a
 * link's card with what is related to it), one row per thing. "Show all" opens that tab. Renders
 * nothing without a search or matches.
 */
export function SearchResources() {
  // The box's query as it is: the tab's filters are picked in the tab (and dropped on leaving it)
  const { query, isPending, url } = useSearchResourceQuery({ withFilters: false });
  // Under Visual the External resources tab resolves back to All: there is nowhere to show all
  const { isVisualActive } = useFeedLayoutResolution(TIMELINE_FEED_VARIANT.SEARCH);
  const read = useResourceSearch(query, { limit: SEARCH_RESOURCES_PREVIEW_COUNT });
  const { uris, error, hasMore, unavailable } = read;
  // A picked kind (from the URL) waits for the index's types: the section is loading, not empty
  const loading = read.loading || isPending;
  const setContent = useHomeStore((state) => state.setContent);

  // A failed read ends the section as an empty one does: say so once. Without a source for the
  // search (no Pinakes configured) the section is simply not there.
  useEffect(() => {
    if (error && !unavailable) {
      toast({ variant: 'error', description: 'Failed to load external resources. Please try again.' });
    }
  }, [error, unavailable]);

  const rows = uris.filter((uri) => uri !== url);
  if (!url && ((!query && !isPending) || (!loading && rows.length === 0))) {
    return null;
  }

  return (
    <Container overrideDefaults data-cy="search-resources-section" className="flex w-full flex-col gap-4">
      <Container overrideDefaults className="flex items-center justify-between gap-3">
        <Heading level={2} size="lg" className="font-light text-muted-foreground">
          {'External resources'}
        </Heading>
        {!isVisualActive && (rows.length > 0 || hasMore) && (
          <Button
            variant="secondary"
            size="sm"
            data-cy="search-resources-show-all"
            onClick={() => setContent(CONTENT.RESOURCES)}
          >
            {'Show all'}
          </Button>
        )}
      </Container>

      <Container overrideDefaults className="grid w-full grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-6">
        {url && <ResourceItem uri={url} data-testid="search-resource-top" />}
        {loading && (query || isPending)
          ? Array.from({ length: SEARCH_RESOURCES_PREVIEW_COUNT }).map((_, index) => (
              <ResourceSurfaceProvider key={`search-resources-skeleton-${index}`} surface="card">
                <ResourceCardSkeleton withActions />
              </ResourceSurfaceProvider>
            ))
          : rows.map((uri) => <ResourceItem key={uri} uri={uri} data-testid="search-resource-item" />)}
      </Container>
    </Container>
  );
}
