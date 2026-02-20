'use client';

import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import type { TagSuggestionsDropdownProps } from './TagSuggestionsDropdown.types';

export function TagSuggestionsDropdown({
  suggestions,
  selectedIndex,
  onSelect,
  onSelectIndexChange,
  onMouseDown,
}: TagSuggestionsDropdownProps) {
  return (
    <Atoms.Container
      data-testid="tag-suggestions-dropdown"
      overrideDefaults={true}
      className="rounded-md border border-border bg-popover"
      onMouseDown={onMouseDown}
    >
      {suggestions.map((tag, index) => (
        <Atoms.Container
          key={tag.label}
          overrideDefaults={true}
          className={Libs.cn(
            'cursor-pointer px-3 py-2 hover:rounded-md hover:bg-accent',
            index === selectedIndex && 'rounded-md bg-accent',
          )}
          onClick={() => onSelect(tag.label)}
          onMouseEnter={() => onSelectIndexChange(index)}
        >
          <Atoms.Typography as="span" className="text-sm font-medium text-popover-foreground">
            {tag.label}
          </Atoms.Typography>
        </Atoms.Container>
      ))}
    </Atoms.Container>
  );
}
