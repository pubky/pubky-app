'use client';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { TaggedList } from '../TaggedList/TaggedList';
import { TagInput } from '../TagInput/TagInput';

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
    <Container className="gap-2 rounded-md bg-card p-6">
      <Typography as="p" className="text-base font-medium text-secondary-foreground">
        {userName ? `${userName} was tagged as:` : 'Tagged as:'}
      </Typography>

      <TagInput
        onTagAdd={handleTagAdd}
        existingTags={tags}
        enableApiSuggestions
        excludeFromApiSuggestions={tags.map((t) => t.label)}
        addOnSuggestionClick
      />

      <TaggedList
        tags={tags}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMore}
        onTagToggle={handleTagToggle}
      />
    </Container>
  );
}
