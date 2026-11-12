'use client';

import type { ReactNode } from 'react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { TIMELINE_MAX_UNPRODUCTIVE_AUTO_LOADS } from '@/config/feed';
import { CONTENT_AREA_STACK_CLASS } from '@/config/layoutClasses';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { type UseResourceSearchResult } from '@/hooks/useResourceSearch/useResourceSearch';
import { cn } from '@/libs/utils/utils';
import { ResourceItem } from '@/molecules/ResourceCard/ResourceItem';
import { ResourceSurfaceProvider } from '@/molecules/ResourceCard/ResourceSurfaceContext';
import { ResourceCardSkeleton } from '@/molecules/ResourceCardSkeleton/ResourceCardSkeleton';
import { TimelineEndMessage } from '@/molecules/Timeline/TimelineEndMessage';
import { TimelineError } from '@/molecules/Timeline/TimelineError';
import { TimelineErrorState } from '@/molecules/Timeline/TimelineErrorState';
import { TimelineLoadingMore } from '@/molecules/Timeline/TimelineLoadingMore';
import { TimelineLoadMore } from '@/molecules/Timeline/TimelineLoadMore';
import { TimelineStateWrapper } from '@/molecules/Timeline/TimelineStateWrapper/TimelineStateWrapper';
import { LAYOUT, type LayoutType } from '@/stores/home/home.types';

const RESOURCE_SKELETON_COUNT = 3;

interface ResourceTimelineFeedProps {
  /** The search being shown (`useResourceSearch`), read by the caller so its controls can use it too. */
  search: UseResourceSearchResult;
  /** Cards shows two columns from `lg`, as a collection's resources; every other layout one. */
  layout: LayoutType;
  /** The composer or the search controls above the list. */
  children?: ReactNode;
  /** Above the rows, in the list: the exact card of a searched link. */
  leadingItem?: ReactNode;
  emptyState?: ReactNode;
}

/**
 * A feed of external resources: the rows of a resource search (Pinakes, or Nexus' resource stream
 * standing in), each as an item of its own (`ResourceItem`: its card, tags and actions, opening its
 * resource page), with the post feeds' loading, error, end and infinite-scroll states. A failed
 * read offers to try again. Resources are no posts: nothing here reads or writes a post stream.
 */
export function ResourceTimelineFeed({ search, layout, children, leadingItem, emptyState }: ResourceTimelineFeedProps) {
  const { uris, loading, loadingMore, error, hasMore, loadMore, retry, unavailable } = search;
  // No retry helps a search no source can answer
  const retryButton = unavailable ? null : (
    <Button variant={ButtonVariant.SECONDARY} type="button" onClick={retry}>
      {'Try again'}
    </Button>
  );
  const { sentinelRef, isStalled, resumeAutoLoad } = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    isLoading: loadingMore,
    threshold: 3000,
    debounceMs: 20,
    itemCount: uris.length,
    maxUnproductiveLoads: TIMELINE_MAX_UNPRODUCTIVE_AUTO_LOADS,
  });
  const hasItems = uris.length > 0 || leadingItem != null;

  return (
    <Container className={CONTENT_AREA_STACK_CLASS}>
      {children}
      <TimelineStateWrapper
        loading={loading && leadingItem == null}
        error={error}
        hasItems={hasItems}
        hasMore={hasMore}
        stalled={isStalled}
        loadingComponent={
          <ResourceSurfaceProvider surface="card">
            <Container overrideDefaults className="flex flex-col gap-4" data-testid="resource-feed-loading">
              {Array.from({ length: RESOURCE_SKELETON_COUNT }).map((_, i) => (
                <ResourceCardSkeleton key={`resource-skeleton-${i}`} withActions />
              ))}
            </Container>
          </ResourceSurfaceProvider>
        }
        errorComponent={
          <Container overrideDefaults className="flex flex-col items-center gap-2" data-testid="resource-feed-error">
            <TimelineErrorState message={error ?? ''} />
            {retryButton}
          </Container>
        }
        emptyComponent={
          emptyState ?? (
            <Container data-cy="timeline-container" className="flex items-center justify-center py-8">
              <Typography size="md" className="text-muted-foreground">
                {'No external resources found'}
              </Typography>
            </Container>
          )
        }
      >
        <Container overrideDefaults className="flex flex-col gap-4">
          <Container
            overrideDefaults
            role="feed"
            aria-label="External resources"
            aria-busy={loading}
            data-testid="resource-feed"
            className={cn('grid gap-4', layout === LAYOUT.CARDS ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1')}
          >
            {leadingItem}
            {uris.map((uri) => (
              <ResourceItem key={uri} uri={uri} data-testid="resource-feed-item" />
            ))}
          </Container>

          {uris.length > 0 && loadingMore && <TimelineLoadingMore />}

          {error && hasItems && (
            <Container overrideDefaults className="flex flex-col items-center gap-2">
              <TimelineError message={error} />
              {retryButton}
            </Container>
          )}

          {!loading && !hasMore && !loadingMore && uris.length > 0 && <TimelineEndMessage />}

          {hasMore && isStalled && !loadingMore && <TimelineLoadMore onLoadMore={resumeAutoLoad} />}

          {hasMore && !isStalled && !loading && (
            <Container overrideDefaults className="h-5" ref={sentinelRef} data-cy="timeline-sentinel" />
          )}
        </Container>
      </TimelineStateWrapper>
    </Container>
  );
}
