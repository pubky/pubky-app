'use client';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import type { TagSuggestionsDropdownProps } from './TagSuggestionsDropdown.types';

export function TagSuggestionsDropdown({
  suggestions,
  selectedIndex,
  onSelect,
  onSelectIndexChange,
  onMouseDown,
}: TagSuggestionsDropdownProps) {
  return (
    <Container
      data-testid="tag-suggestions-dropdown"
      overrideDefaults={true}
      className="rounded-md border border-border bg-popover"
      onMouseDown={onMouseDown}
    >
      {suggestions.map((tag, index) => (
        <Container
          key={tag.label}
          overrideDefaults={true}
          className={cn(
            'cursor-pointer px-3 py-2 hover:rounded-md hover:bg-accent',
            index === selectedIndex && 'rounded-md bg-accent',
          )}
          onClick={() => onSelect(tag.label)}
          onMouseEnter={() => onSelectIndexChange(index)}
        >
          <Typography as="span" className="text-sm font-medium text-popover-foreground">
            {tag.label}
          </Typography>
        </Container>
      ))}
    </Container>
  );
}
