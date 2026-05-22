import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { PostTag } from '../PostTag/PostTag';
import type { SearchTagSectionProps } from './SearchTagSection.types';

/**
 * SearchTagSection
 *
 * Displays a section of tags with a title.
 * Used in search suggestions to show autocomplete tag results or hot tags.
 */
export function SearchTagSection({ title, tags, onTagClick }: SearchTagSectionProps) {
  if (tags.length === 0) return null;

  return (
    <Container overrideDefaults className="flex flex-col gap-2">
      <Typography size="xs" className="tracking-widest text-muted-foreground uppercase">
        {title}
      </Typography>
      <Container overrideDefaults className="flex flex-wrap gap-3">
        {tags.map((tag) => (
          <PostTag key={tag.name} label={tag.name} onClick={() => onTagClick(tag.name)} />
        ))}
      </Container>
    </Container>
  );
}
