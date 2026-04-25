'use client';

import { useRef, useEffect } from 'react';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Libs from '@/libs';
import type { MentionPopoverProps } from './MentionPopover.types';

const POPOVER_CLASSNAME =
  'absolute z-50 mt-1 w-[var(--mention-popover-width)] max-h-[var(--mention-popover-max-height)] overflow-y-auto rounded-md border border-border bg-popover p-2';

/**
 * MentionPopover
 *
 * Displays a popover with user suggestions for mention autocomplete.
 * Used in PostInput and QuickReply when typing @username or pk:id patterns.
 */
export function MentionPopover({ users, selectedIndex, onSelect, onHover }: MentionPopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  // Scroll selected item into view when using keyboard navigation (ArrowUp/ArrowDown).
  // Without this, items outside the visible area won't be visible when selected.
  useEffect(() => {
    if (selectedIndex !== null && itemRefs.current[selectedIndex]) {
      const item = itemRefs.current[selectedIndex];
      const container = containerRef.current;

      if (item && container) {
        const itemTop = item.offsetTop;
        const itemBottom = item.offsetTop + item.offsetHeight;
        const containerScrollTop = container.scrollTop;
        const containerHeight = container.offsetHeight;

        if (itemTop < containerScrollTop) {
          container.scrollTop = itemTop;
        } else if (itemBottom > containerScrollTop + containerHeight) {
          container.scrollTop = itemBottom - containerHeight;
        }
      }
    }
  }, [selectedIndex]);

  if (users.length === 0) {
    return null;
  }

  return (
    <Atoms.Container
      ref={containerRef}
      role="listbox"
      aria-label="User suggestions"
      data-cy="mention-popover"
      data-testid="mention-popover"
      overrideDefaults
      className={Libs.cn(POPOVER_CLASSNAME)}
    >
      {users.map((user, index) => (
        <Atoms.Container
          key={user.id}
          ref={(el) => {
            itemRefs.current[index] = el;
          }}
          role="option"
          aria-selected={selectedIndex === index}
          overrideDefaults
          data-testid={`mention-popover-item-${index}`}
          className={Libs.cn('rounded-md transition-colors', selectedIndex === index && 'bg-accent')}
          onMouseEnter={() => onHover(index)}
        >
          <Molecules.SearchUserSuggestion user={user} onClick={() => onSelect(user.id)} />
        </Atoms.Container>
      ))}
    </Atoms.Container>
  );
}
