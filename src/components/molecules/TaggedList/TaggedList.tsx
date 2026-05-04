'use client';

import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { usePostTaggers } from '@/hooks/usePostTaggers/usePostTaggers';
import { useEffect, useRef, useState } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { TaggedItem } from '../TaggedItem/TaggedItem';

import type { TaggedListProps } from './TaggedList.types';
import { TagKind } from '@/application/tag/tag.types';
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

  const shouldFetchTaggers = taggedKind === TagKind.POST && !!taggedId;
  const { taggersByLabel, taggerStates, fetchAllTaggers } = usePostTaggers(shouldFetchTaggers ? taggedId : null);

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

  // Use ref for tags to avoid re-triggering the fetch effect when tags update
  const tagsRef = useRef(tags);
  useEffect(() => {
    tagsRef.current = tags;
  }, [tags]);

  useEffect(() => {
    if (!expandedTagLabel || !shouldFetchTaggers) return;
    const selectedTag = tagsRef.current.find((tag) => tag.label === expandedTagLabel);
    if (!selectedTag) return;
    const initialIds = selectedTag.taggers.map((tagger) => tagger.id);
    void fetchAllTaggers(expandedTagLabel, initialIds, selectedTag.taggers_count);
  }, [expandedTagLabel, shouldFetchTaggers, fetchAllTaggers]);

  return (
    <Container className="gap-2">
      {tags.map((tag) => {
        const tagLabelKey = tag.label.toLowerCase();
        const isExpanded = expandedTagLabel === tag.label;
        const expandedTaggerIds = taggersByLabel.get(tagLabelKey);
        const taggerState = taggerStates.get(tagLabelKey);
        const isLoadingTaggers = taggerState?.isLoading ?? false;

        return (
          <TaggedItem
            key={tag.label}
            tag={tag}
            onTagClick={onTagToggle}
            isExpanded={isExpanded}
            onExpandToggle={handleExpandToggle}
            expandedTaggerIds={expandedTaggerIds}
            isLoadingTaggers={isLoadingTaggers}
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
