import type React from 'react';

export interface UsePostListKeyboardResult {
  /**
   * Ref setter for each card wrapper. Pass to the wrapping element of each post:
   *   `<Container ref={setCardRef(i)} tabIndex={0} ... />`
   */
  setCardRef: (index: number) => (el: HTMLElement | null) => void;
  /**
   * Keydown handler for the list container. Handles ArrowUp/ArrowDown/j/k/Home/End.
   * Only fires when focus is on a registered card or a `cardSelector`-matched extra
   * item (not on a descendant input, button, or nested card).
   */
  onListKeyDown: (event: React.KeyboardEvent) => void;
}
