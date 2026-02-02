'use client';

import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import type { TaggedSectionProps } from './TaggedSection.types';

export function TaggedSection({
  tags,
  userName,
  handleTagAdd,
  handleTagToggle,
  hasMore,
  isLoadingMore,
  loadMore,
}: TaggedSectionProps) {
  return (
    <Atoms.Container className="gap-2 rounded-md bg-card p-6">
      <Atoms.Typography as="p" className="text-base font-medium text-secondary-foreground">
        {userName ? `${userName} was tagged as:` : 'Tagged as:'}
      </Atoms.Typography>

      <Molecules.TagInput
        onTagAdd={handleTagAdd}
        existingTags={tags}
        enableApiSuggestions
        excludeFromApiSuggestions={tags.map((t) => t.label)}
        addOnSuggestionClick
      />

      <Molecules.TaggedList
        tags={tags}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMore}
        onTagToggle={handleTagToggle}
      />
    </Atoms.Container>
  );
}
