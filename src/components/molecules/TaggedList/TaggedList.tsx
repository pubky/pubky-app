'use client';

import { useEffect, useState } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { useEntityTaggers } from '@/hooks/useEntityTaggers/useEntityTaggers';
import { mergeTaggerIds } from '@/hooks/useEntityTaggers/useEntityTaggers.utils';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { useAuthStore } from '@/stores/auth/auth.store';
import { TaggedItem } from '../TaggedItem/TaggedItem';
import type { TaggedListProps } from './TaggedList.types';

export function TaggedList({
  tags,
  taggedId,
  taggedKind,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  onTagToggle,
}: TaggedListProps) {
  // Track which tag is currently expanded (only one at a time - accordion behavior)
  const [expandedTagLabel, setExpandedTagLabel] = useState<string | null>(null);
  const viewerId = useAuthStore((state) => state.currentUserPubky);

  const { taggerStates, loadTaggers, loadMoreTaggers } = useEntityTaggers(taggedId, taggedKind);

  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: onLoadMore || (() => {}),
    hasMore,
    isLoading: isLoadingMore,
    threshold: 200,
    debounceMs: 300,
  });

  const handleExpandToggle = (tagLabel: string) => {
    // Toggle: if clicking the same tag, collapse it; otherwise expand the new one
    setExpandedTagLabel((prev) => (prev === tagLabel ? null : tagLabel));
  };

  // The hook retains fetched pages; local viewer toggles are merged below.
  const expandedTagCount = tags.find((tag) => tag.label === expandedTagLabel)?.taggers_count;

  useEffect(() => {
    if (!expandedTagLabel || !taggedId || !taggedKind) return;
    void loadTaggers(expandedTagLabel, expandedTagCount);
  }, [expandedTagLabel, expandedTagCount, taggedId, taggedKind, loadTaggers]);

  return (
    <Container className="gap-2">
      {tags.map((tag) => {
        const isExpanded = expandedTagLabel === tag.label;
        const taggerState = taggerStates.get(tag.label.toLowerCase());
        const expandedTaggerIds = isExpanded
          ? mergeTaggerIds({
              fetchedIds: taggerState?.ids,
              previewIds: tag.taggers.map((tagger) => tagger.id),
              viewerId,
              isViewerTagger: tag.relationship,
            })
          : undefined;
        const isFetching = taggerState?.isLoading ?? false;

        return (
          <TaggedItem
            key={tag.label}
            tag={tag}
            onTagClick={onTagToggle}
            isExpanded={isExpanded}
            onExpandToggle={handleExpandToggle}
            expandedTaggerIds={expandedTaggerIds}
            isLoadingTaggers={isFetching && !taggerState?.hasFetched}
            isLoadingMoreTaggers={isFetching && taggerState?.hasFetched}
            hasMoreTaggers={taggerState?.hasMore}
            hasTaggersError={taggerState?.hasError}
            onLoadMoreTaggers={() => void loadMoreTaggers(tag.label)}
          />
        );
      })}
      {hasMore && (
        <Container overrideDefaults ref={sentinelRef} className="w-full">
          {isLoadingMore && (
            <Container overrideDefaults className="flex items-center gap-2 py-1">
              <Skeleton className="h-8 w-20 shrink-0 rounded-md" />
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <Container overrideDefaults className="flex items-center gap-0">
                <Skeleton className="-mr-2 size-8 shrink-0 rounded-full" />
                <Skeleton className="-mr-2 size-8 shrink-0 rounded-full" />
                <Skeleton className="size-8 shrink-0 rounded-full" />
              </Container>
            </Container>
          )}
        </Container>
      )}
    </Container>
  );
}
