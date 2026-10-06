'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { mergeTaggerIds, useEntityTaggers } from '@/hooks/useEntityTaggers/useEntityTaggers';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { useAuthStore } from '@/stores/auth/auth.store';
import { TaggedItem } from '../TaggedItem/TaggedItem';
import type { TaggedListProps } from './TaggedList.types';

export function TaggedList({
  tags,
  taggedId,
  mergeTaggedId,
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
  // A merged list also shows labels stored on a second entity: expanding one lists both sides' taggers.
  const mergeTarget = mergeTaggedId && mergeTaggedId !== taggedId ? mergeTaggedId : null;
  const {
    taggerStates: mergeTaggerStates,
    loadTaggers: loadMergeTaggers,
    loadMoreTaggers: loadMoreMergeTaggers,
  } = useEntityTaggers(mergeTarget, mergeTarget ? taggedKind : null);
  const taggerStateFor = (label: string) => {
    const key = label.toLowerCase();
    const primary = taggerStates.get(key);
    const secondary = mergeTarget ? mergeTaggerStates.get(key) : undefined;
    if (!primary || !secondary) return primary ?? secondary;
    const fetched = [primary, secondary].filter((state) => state.hasFetched);
    return {
      ids: Array.from(new Set(fetched.flatMap((state) => state.ids))),
      isLoading: primary.isLoading || secondary.isLoading,
      hasError: primary.hasError || secondary.hasError,
      hasMore: primary.hasMore || secondary.hasMore,
      hasFetched: fetched.length > 0,
      // The viewer stays listed while either side still holds their tag.
      isViewerTagger: secondary.isViewerTagger ? true : primary.isViewerTagger,
    };
  };

  const { sentinelRef, isStalled, resumeAutoLoad } = useInfiniteScroll({
    onLoadMore: onLoadMore || (() => {}),
    hasMore,
    isLoading: isLoadingMore,
    threshold: 200,
    debounceMs: 300,
    itemCount: tags.length,
    maxUnproductiveLoads: 1,
  });

  const handleExpandToggle = (tagLabel: string) => {
    // Toggle: if clicking the same tag, collapse it; otherwise expand the new one
    setExpandedTagLabel((prev) => (prev === tagLabel ? null : tagLabel));
  };

  const expandedTagCount = tags.find((tag) => tag.label === expandedTagLabel)?.taggers_count;

  useEffect(() => {
    if (!expandedTagLabel || !taggedId || !taggedKind) return;
    void loadTaggers(expandedTagLabel, expandedTagCount);
    if (mergeTarget) void loadMergeTaggers(expandedTagLabel, expandedTagCount);
  }, [expandedTagLabel, expandedTagCount, taggedId, taggedKind, loadTaggers, mergeTarget, loadMergeTaggers]);

  return (
    <Container className="gap-2">
      {tags.map((tag) => {
        const isExpanded = expandedTagLabel === tag.label;
        const taggerState = taggerStateFor(tag.label);
        const expandedTaggerIds = isExpanded
          ? mergeTaggerIds({
              fetchedIds: taggerState?.hasFetched ? taggerState.ids : undefined,
              previewIds: tag.taggers.map((tagger) => tagger.id),
              viewerId,
              isViewerTagger: taggerState?.isViewerTagger,
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
            onLoadMoreTaggers={() => {
              void loadMoreTaggers(tag.label);
              if (mergeTarget) void loadMoreMergeTaggers(tag.label);
            }}
          />
        );
      })}
      {hasMore && isStalled && (
        <Button variant="secondary" size="sm" onClick={resumeAutoLoad} disabled={isLoadingMore}>
          Load more
        </Button>
      )}
      {hasMore && !isStalled && (
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
