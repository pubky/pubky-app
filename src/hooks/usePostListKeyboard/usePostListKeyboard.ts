'use client';

import { useCallback, useRef } from 'react';
import type React from 'react';
import type { UsePostListKeyboardResult } from './usePostListKeyboard.types';

interface UsePostListKeyboardOptions {
  /**
   * Optional CSS selector for extra navigable items not registered via `setCardRef`
   * (e.g. a "Show more" button rendered after the mapped list).
   *
   * Elements matching the selector that are NOT contained within any registered
   * ref card are appended to the keyboard navigation list in DOM order. This lets
   * a single hook handle both a flat ref-registered list (e.g. reply cards) and
   * one-off sibling elements (e.g. `ShowMoreReplies`) without duplicating logic.
   *
   * Elements matched by the selector that ARE inside a registered ref are ignored,
   * which prevents nested child cards (e.g. `ReplyWithNested` depth > 0) from
   * polluting the navigation list.
   */
  cardSelector?: string;
}

const INTERACTIVE_DESCENDANT_SELECTOR = 'a,button,input,textarea,select,[role="button"],[role="link"]';

/**
 * usePostListKeyboard
 *
 * Keyboard navigation accelerator for a list of post cards.
 *
 * Every card stays independently tab-focusable (`tabIndex={0}` on the consumer
 * side) so a keyboard user who doesn't know about j/k can still Tab through
 * every post. The hook adds movement shortcuts on top of that baseline:
 *
 * - ArrowDown/ArrowUp and j/k move focus between cards.
 * - Home/End jump to the first/last item.
 * - Movement keys are ignored unless focus is on a registered card or a
 *   selector-matched extra item, so they never stomp on descendant inputs.
 *
 * Pass `options.cardSelector` to include additional navigable elements that are
 * siblings of the main list (e.g. a "Show more" button) without registering refs
 * for them.
 *
 * Pair with `usePostNavigation.handlePostKeyDown` on each card to handle
 * Enter/Space activation and Cmd/Ctrl/Shift+Enter new-tab opens.
 */
export function usePostListKeyboard(options?: UsePostListKeyboardOptions): UsePostListKeyboardResult {
  const cardSelector = options?.cardSelector;
  const cardRefs = useRef<(HTMLElement | null)[]>([]);

  /**
   * Build the full navigable card list for a given container.
   *
   * Always starts with the ref-registered cards (in registration order).
   * If `cardSelector` is set, appends any matching elements from the container
   * that are NOT inside a registered ref card.
   */
  const buildCardList = useCallback(
    (container: HTMLElement): HTMLElement[] => {
      const registered = cardRefs.current.filter((el): el is HTMLElement => el !== null);
      if (!cardSelector) return registered;

      const allMatching = Array.from(container.querySelectorAll<HTMLElement>(cardSelector));
      const extras = allMatching.filter((el) => !registered.some((c) => c === el || c.contains(el)));
      return [...registered, ...extras];
    },
    [cardSelector],
  );

  const focusAt = useCallback((cards: HTMLElement[], target: number) => {
    if (cards.length === 0) return;
    const clamped = Math.max(0, Math.min(target, cards.length - 1));
    const card = cards[clamped];
    card.focus();
    card.scrollIntoView?.({ block: 'nearest' });
  }, []);

  const setCardRef = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      cardRefs.current[index] = el;
    },
    [],
  );

  const onListKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const cards = buildCardList(event.currentTarget as HTMLElement);
      let cardIndex = cards.indexOf(target);

      // Fallback: if focus is on a non-interactive focusable descendant of a
      // registered card (e.g. the parent-post article wrapper inside a
      // reply-with-parent card), navigate from the containing card.
      // Interactive controls (buttons, inputs, links) are excluded so that j/k
      // is still ignored when a real action element inside a card is focused.
      if (cardIndex === -1 && !target.closest(INTERACTIVE_DESCENDANT_SELECTOR)) {
        cardIndex = cards.findIndex((card) => card.contains(target));
      }

      if (cardIndex === -1) return;

      switch (event.key) {
        case 'ArrowDown':
        case 'j':
          event.preventDefault();
          focusAt(cards, cardIndex + 1);
          break;
        case 'ArrowUp':
        case 'k':
          event.preventDefault();
          focusAt(cards, cardIndex - 1);
          break;
        case 'Home':
          event.preventDefault();
          focusAt(cards, 0);
          break;
        case 'End':
          event.preventDefault();
          focusAt(cards, cards.length - 1);
          break;
      }
    },
    [buildCardList, focusAt],
  );

  return { setCardRef, onListKeyDown };
}
