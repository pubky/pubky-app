'use client';

import type React from 'react';
import { useCallback, useRef, useState } from 'react';
import type { UsePostListKeyboardResult } from './usePostListKeyboard.types';

/**
 * usePostListKeyboard
 *
 * Roving-tabindex keyboard navigation for a flat list of post cards.
 *
 * - Only one card is in the tab order at a time (the one at `focusedIndex`);
 *   the rest get `tabIndex={-1}` so they can still be focused programmatically.
 * - ArrowDown/ArrowUp and j/k move focus between cards.
 * - Home/End jump to the first/last loaded card.
 * - Movement keys are ignored unless focus is on a registered card, so they
 *   never stomp on text inputs, action buttons, or other descendants.
 *
 * Pair with `usePostNavigation.handlePostKeyDown` on each card to handle
 * Enter/Space activation and Cmd/Ctrl/Shift+Enter new-tab opens.
 */
export function usePostListKeyboard(itemCount: number): UsePostListKeyboardResult {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);

  const focusAt = useCallback(
    (target: number) => {
      if (itemCount === 0) return;
      const clamped = Math.max(0, Math.min(target, itemCount - 1));
      setFocusedIndex(clamped);
      const el = cardRefs.current[clamped];
      el?.focus();
      el?.scrollIntoView({ block: 'nearest' });
    },
    [itemCount],
  );

  const setCardRef = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      cardRefs.current[index] = el;
    },
    [],
  );

  const onCardFocus = useCallback((index: number) => {
    setFocusedIndex(index);
  }, []);

  const onListKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Only intercept when focus is on a registered card, not a descendant
      // (action button, link, textarea, etc.). This keeps inputs and shortcuts safe.
      const target = event.target as HTMLElement;
      const cardIndex = cardRefs.current.indexOf(target);
      if (cardIndex === -1) return;

      switch (event.key) {
        case 'ArrowDown':
        case 'j':
          event.preventDefault();
          focusAt(cardIndex + 1);
          break;
        case 'ArrowUp':
        case 'k':
          event.preventDefault();
          focusAt(cardIndex - 1);
          break;
        case 'Home':
          event.preventDefault();
          focusAt(0);
          break;
        case 'End':
          event.preventDefault();
          focusAt(itemCount - 1);
          break;
      }
    },
    [focusAt, itemCount],
  );

  return { focusedIndex, setCardRef, onListKeyDown, onCardFocus };
}
