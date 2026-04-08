'use client';

import { useEffect, useRef, useState } from 'react';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Hooks from '@/hooks';
import * as Core from '@/core';
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

  const shouldFetchTaggers = taggedKind === Core.TagKind.POST && !!taggedId;
  const { taggersByLabel, taggerStates, fetchAllTaggers } = Hooks.usePostTaggers(shouldFetchTaggers ? taggedId : null);

  const { sentinelRef } = Hooks.useInfiniteScroll({
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
    <Atoms.Container className="gap-2">
      {tags.map((tag) => {
        const tagLabelKey = tag.label.toLowerCase();
        const isExpanded = expandedTagLabel === tag.label;
        const expandedTaggerIds = taggersByLabel.get(tagLabelKey);
        const taggerState = taggerStates.get(tagLabelKey);
        const isLoadingTaggers = taggerState?.isLoading ?? false;

        return (
          <Molecules.TaggedItem
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
        <Atoms.Container overrideDefaults ref={sentinelRef} className="w-full">
          {isLoadingMore && (
            <Atoms.Container overrideDefaults className="flex items-center gap-2 py-1">
              <Atoms.Skeleton className="h-8 w-20 shrink-0 rounded-md" />
              <Atoms.Skeleton className="size-8 shrink-0 rounded-full" />
              <Atoms.Container overrideDefaults className="flex items-center gap-0">
                <Atoms.Skeleton className="-mr-2 size-8 shrink-0 rounded-full" />
                <Atoms.Skeleton className="-mr-2 size-8 shrink-0 rounded-full" />
                <Atoms.Skeleton className="size-8 shrink-0 rounded-full" />
              </Atoms.Container>
            </Atoms.Container>
          )}
        </Atoms.Container>
      )}
    </Atoms.Container>
  );
}
