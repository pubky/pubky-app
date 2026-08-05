'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Container } from '@/atoms/Container/Container';
import { cn } from '@/libs/utils/utils';
import { SearchUserSuggestion } from '../SearchUserSuggestion/SearchUserSuggestion';
import type { MentionPopoverProps } from './MentionPopover.types';

const POPOVER_CLASSNAME =
  'fixed z-50 mt-1 w-[var(--mention-popover-width)] max-h-[var(--mention-popover-max-height)] overflow-y-auto rounded-md border border-border bg-popover p-2';

/**
 * Tracks the anchor's viewport rect so the popover can be rendered in a portal.
 * The composers live inside clipping ancestors (the height-animating card and
 * the `lg:overflow-hidden` feed column), so an in-flow absolute popover gets cut
 * off; a fixed one in `document.body` escapes them all.
 */
function useAnchorRect(anchorRef: MentionPopoverProps['anchorRef']) {
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;

    if (!anchor) {
      return;
    }

    const update = () => {
      const anchorRect = anchor.getBoundingClientRect();
      setRect({ top: anchorRect.bottom, left: anchorRect.left });
    };

    update();

    // The anchor moves with any scroll (capture: nested scrollers too), viewport
    // resize, or autosize change while the user types.
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(anchor);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [anchorRef]);

  return rect;
}

/**
 * MentionPopover
 *
 * Displays a popover with user suggestions for mention autocomplete.
 * Used in PostInput and QuickReply when typing @username or pk:id patterns.
 */
export function MentionPopover({ users, selectedIndex, onSelect, onHover, anchorRef }: MentionPopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const anchorRect = useAnchorRect(anchorRef);

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

  // `anchorRect` stays null until the layout effect runs, which also keeps the
  // portal out of the server render.
  if (users.length === 0 || !anchorRect) {
    return null;
  }

  return createPortal(
    <Container
      ref={containerRef}
      role="listbox"
      aria-label="User suggestions"
      data-cy="mention-popover"
      data-testid="mention-popover"
      overrideDefaults
      className={cn(POPOVER_CLASSNAME)}
      style={{ top: anchorRect.top, left: anchorRect.left }}
    >
      {users.map((user, index) => (
        <Container
          key={user.id}
          ref={(el) => {
            itemRefs.current[index] = el;
          }}
          role="option"
          aria-selected={selectedIndex === index}
          overrideDefaults
          data-testid={`mention-popover-item-${index}`}
          className={cn('rounded-md transition-colors', selectedIndex === index && 'bg-accent')}
          onMouseEnter={() => onHover(index)}
        >
          <SearchUserSuggestion user={user} onClick={() => onSelect(user.id)} />
        </Container>
      ))}
    </Container>,
    document.body,
  );
}
