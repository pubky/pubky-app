'use client';

import { useState } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { usePostTaggers } from '@/hooks/usePostTaggers/usePostTaggers';
import { useProfileContext } from '@/providers/ProfileProvider/ProfileProvider';
import { TaggedItem } from '../TaggedItem/TaggedItem';
import { TagWithAvatars } from '../TaggedItem/TaggedItem.types';
import type { TaggedListProps } from './TaggedList.types';

export function TaggedList({ tags, hasMore = false, isLoadingMore = false, onLoadMore, onTagToggle }: TaggedListProps) {
  // Track which tag is currently expanded (only one at a time - accordion behavior)
  const [expandedTagLabel, setExpandedTagLabel] = useState<string | null>(null);
  const [tagsState, setTagsState] = useState<TagWithAvatars[]>(tags);
  const { fetchTaggedList } = usePostTaggers(null);
  const { pubky } = useProfileContext();

  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: onLoadMore || (() => {}),
    hasMore,
    isLoading: isLoadingMore,
    threshold: 200,
    debounceMs: 300,
  });

  const handleExpandToggle = async (tagLabel: string) => {
    // Toggle: if clicking the same tag, collapse it; otherwise expand the new one
    setExpandedTagLabel((prev) => (prev === tagLabel ? null : tagLabel));

    if (tagLabel === expandedTagLabel) return;
    const selectedTag = tags.find((tag) => tag.label === tagLabel);
    const selectedTagsRef = tagsState.find((tag) => tag.label === tagLabel);
    if (!selectedTag || !pubky) return;

    // Fetch tagger details only once.
    if (selectedTagsRef?.taggers_count === selectedTagsRef?.taggers.length) return;

    const response = await fetchTaggedList(tagLabel, pubky, selectedTag.taggers);
    if (!response?.allTaggers) {
      return;
    }
    const upadtedTagsState = tagsState.map((tag) =>
      tag.label === tagLabel ? { ...tag, taggers: [...tag.taggers, ...response.allTaggers] } : tag,
    );
    setTagsState(upadtedTagsState);
  };

  return (
    <Container className="gap-2">
      {tagsState.map((tag) => {
        const isExpanded = expandedTagLabel === tag.label;
        return (
          <TaggedItem
            key={tag.label}
            tag={tag}
            onTagClick={onTagToggle}
            isExpanded={isExpanded}
            onExpandToggle={handleExpandToggle}
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
