'use client';

import { useEffect, useRef, useState } from 'react';
import { TagKind } from '@/application/tag/tag.types';
import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { usePostTaggers } from '@/hooks/usePostTaggers/usePostTaggers';
import { useProfileContext } from '@/providers/ProfileProvider/ProfileProvider';
import { TaggedItem } from '../TaggedItem/TaggedItem';
import { TagWithAvatars } from '../TaggedItem/TaggedItem.types';
import type { TaggedListProps } from './TaggedList.types';

export function TaggedList({
  tags,
  hasMore = false,
  taggedId,
  taggedKind,
  isLoadingMore = false,
  onLoadMore,
  onTagToggle,
}: TaggedListProps) {
  // Track which tag is currently expanded (only one at a time - accordion behavior)
  const [expandedTagLabel, setExpandedTagLabel] = useState<string | null>(null);
  const [tagsState, setTagsState] = useState<TagWithAvatars[]>(tags);
  const shouldFetchTaggers = taggedKind === TagKind.POST && !!taggedId;
  const { taggersByLabel, taggerStates, fetchAllTaggers, fetchTaggedList } = usePostTaggers(
    shouldFetchTaggers ? taggedId : null,
  );
  const { pubky } = useProfileContext();
  // Use ref for tags to avoid re-triggering the fetch effect when tags update
  const tagsRef = useRef(tags);
  useEffect(() => {
    tagsRef.current = tags;
    setTagsState(tags);
  }, [tags]);

  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: onLoadMore || (() => {}),
    hasMore,
    isLoading: isLoadingMore,
    threshold: 200,
    debounceMs: 300,
  });

  useEffect(() => {
    if (!expandedTagLabel || !shouldFetchTaggers) return;
    const selectedTagRef = tagsRef.current.find((tag) => tag.label === expandedTagLabel);
    if (!selectedTagRef) return;
    const initialIds = selectedTagRef.taggers.map((tagger) => tagger.id);
    void fetchAllTaggers(expandedTagLabel, initialIds, selectedTagRef.taggers_count);
  }, [expandedTagLabel, shouldFetchTaggers, fetchAllTaggers]);

  const handleExpandToggle = async (tagLabel: string) => {
    // Toggle: if clicking the same tag, collapse it; otherwise expand the new one
    setExpandedTagLabel((prev) => (prev === tagLabel ? null : tagLabel));

    if (tagLabel === expandedTagLabel) return;
    const selectedTag = tags.find((tag) => tag.label === tagLabel);
    const selectedTagsState = tagsState.find((tag) => tag.label === tagLabel);
    if (!selectedTag || !pubky) return;
    // Fetch tagger details only once.
    if (selectedTagsState?.taggers_count === selectedTagsState?.taggers.length) return;

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
