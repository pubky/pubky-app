'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('common');
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
        <Atoms.Container overrideDefaults ref={sentinelRef} className="h-4 w-full">
          {isLoadingMore && (
            <Atoms.Typography as="p" className="text-center text-sm text-muted-foreground">
              {t('loadingMoreTags')}
            </Atoms.Typography>
          )}
        </Atoms.Container>
      )}
    </Atoms.Container>
  );
}
