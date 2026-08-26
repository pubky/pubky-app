'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { COLLECTIONS_SECTION_PAGE_SIZE, SEARCH_COLLECTIONS_PREVIEW_COUNT } from '@/config/collections';
import { useSearchStreamId } from '@/hooks/useSearchStreamId/useSearchStreamId';
import { useStreamPagination } from '@/hooks/useStreamPagination/useStreamPagination';
import { parseCompositeId } from '@/models/models.utils';
import type { PostStreamId } from '@/models/stream/post/postStream.types';
import { useToast } from '@/molecules/Toaster/use-toast';
import { CollectionCard } from '@/organisms/Collections/CollectionCard/CollectionCard';
import { CollectionCardSkeleton } from '@/organisms/Collections/CollectionCard/CollectionCard.skeleton';
import { CONTENT } from '@/stores/home/home.types';

/**
 * SearchCollections
 *
 * "Collections" section on `/search` — collections matching the searched tags
 * via the tagged collection stream (`<sort>:all:collection:<tags>`). Collapsed
 * to a preview of `SEARCH_COLLECTIONS_PREVIEW_COUNT` cards; "See all" expands
 * in place to the paginated grid. Renders nothing without tags or matches.
 */
export function SearchCollections() {
  const streamId = useSearchStreamId(CONTENT.COLLECTIONS);

  if (!streamId) {
    return null;
  }

  // Remount on any tag/sort change so the expansion state resets with the query.
  return <SearchCollectionsStream key={streamId} streamId={streamId} />;
}

/**
 * Inner data-driven body — only mounted with a resolved stream id, so
 * `useStreamPagination` always receives a real `PostStreamId`.
 */
function SearchCollectionsStream({ streamId }: { streamId: PostStreamId }) {
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);

  const { postIds, hasMore, loadMore, loading, loadingMore } = useStreamPagination({
    streamId,
    limit: COLLECTIONS_SECTION_PAGE_SIZE,
    onError: () => {
      toast({
        variant: 'error',
        description: 'Failed to load collections. Please try again.',
      });
    },
  });

  const showSkeletons = loading && postIds.length === 0;

  // Settled empty with the stream exhausted (including error) — the section
  // vanishes entirely.
  if (!loading && postIds.length === 0 && !hasMore) {
    return null;
  }

  const visibleIds = isExpanded ? postIds : postIds.slice(0, SEARCH_COLLECTIONS_PREVIEW_COUNT);
  const showSeeAll =
    !isExpanded && postIds.length > 0 && (postIds.length > SEARCH_COLLECTIONS_PREVIEW_COUNT || hasMore);
  // A fully-filtered page keeps hasMore (see useStreamPagination) — with nothing
  // to preview, surface "Show more" directly so the cursor can still advance.
  const showShowMore = !loading && hasMore && (isExpanded || postIds.length === 0);

  return (
    <Container overrideDefaults data-cy="search-collections-section" className="flex w-full flex-col gap-4">
      <Container overrideDefaults className="flex items-center justify-between gap-3">
        <Heading level={2} size="lg" className="font-light text-muted-foreground">
          {'Collections'}
        </Heading>
        {showSeeAll && (
          <Button
            variant="secondary"
            size="sm"
            data-cy="search-collections-see-all"
            onClick={() => setIsExpanded(true)}
          >
            {'See all'}
          </Button>
        )}
      </Container>

      <Container overrideDefaults className="grid w-full grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-6">
        {showSkeletons
          ? Array.from({ length: SEARCH_COLLECTIONS_PREVIEW_COUNT }).map((_, index) => (
              <CollectionCardSkeleton key={`search-collections-skeleton-${index}`} />
            ))
          : visibleIds.map((compositeId) => {
              const { pubky, id } = parseCompositeId(compositeId);
              return <CollectionCard key={compositeId} authorPubky={pubky} postId={id} />;
            })}
      </Container>

      {showShowMore && (
        <Container overrideDefaults className="flex w-full justify-center">
          <Button
            variant="default"
            size="sm"
            data-cy="search-collections-show-more"
            onClick={() => void loadMore()}
            disabled={loadingMore}
          >
            {loadingMore && <Loader2 className="size-4 animate-spin" />}
            {'Show more'}
          </Button>
        </Container>
      )}
    </Container>
  );
}
