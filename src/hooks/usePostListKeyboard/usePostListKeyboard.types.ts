import type React from 'react';

export interface UsePostListKeyboardResult {
  /**
   * Index of the post that currently holds the roving tabindex.
   * The card at this index is the only one with `tabIndex={0}`.
   */
  focusedIndex: number;
  /**
   * Ref setter for each card wrapper. Pass to the wrapping element of each post:
   *   `<Container ref={setCardRef(i)} tabIndex={focusedIndex === i ? 0 : -1} ... />`
   */
  setCardRef: (index: number) => (el: HTMLElement | null) => void;
  /**
   * Keydown handler for the list container. Handles ArrowUp/ArrowDown/j/k/Home/End.
   * Only fires when focus is on a registered card (not on a descendant input or button).
   */
  onListKeyDown: (event: React.KeyboardEvent) => void;
  /**
   * Sync focused index when a card receives focus (e.g., via mouse click or programmatic focus).
   * Pass to each card wrapper's `onFocus`.
   */
  onCardFocus: (index: number) => void;
}
