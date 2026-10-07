'use client';

import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { useContentSearchTags } from '@/hooks/useContentSearchTags/useContentSearchTags';
import { useSearchCriteria } from '@/hooks/useSearchCriteria/useSearchCriteria';
import { useTagSearch } from '@/hooks/useTagSearch/useTagSearch';
import { PostTag } from '@/molecules/PostTag/PostTag';

/**
 * SearchContentTags
 *
 * "Tags" row on `/search` full-text results — tags whose name starts with one
 * of the query terms, so the user can pivot from content results to a tag
 * search in one click (#1840). Renders nothing without a content query or
 * without matches (Nexus indexes tags by prefix, so a query can settle empty).
 */
export function SearchContentTags() {
  const criteria = useSearchCriteria();
  const { tags } = useContentSearchTags(criteria.mode === 'content' ? criteria.query : null);
  const { addTagToSearch } = useTagSearch();

  if (tags.length === 0) {
    return null;
  }

  return (
    <Container overrideDefaults data-cy="search-content-tags-section" className="flex w-full flex-col gap-4">
      <Heading level={2} size="lg" className="font-light text-muted-foreground">
        {'Tags'}
      </Heading>
      <Container overrideDefaults className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <PostTag key={tag} label={tag} onClick={() => addTagToSearch(tag, { addToRecent: true })} />
        ))}
      </Container>
    </Container>
  );
}
