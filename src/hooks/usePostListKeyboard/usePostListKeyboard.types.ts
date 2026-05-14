import type React from 'react';

export interface UsePostListKeyboardResult {
  /**
   * Ref setter for each card wrapper. Pass to the wrapping element of each post:
   *   `<Container ref={setCardRef(i)} tabIndex={0} ... />`
   *
   * Every card is independently tabbable — there is intentionally no roving
   * tabindex. j/k/Arrow keys are an accelerator, not the only way in: a
   * keyboard user without those shortcuts can still reach every post via Tab.
   */
  setCardRef: (index: number) => (el: HTMLElement | null) => void;
  /**
   * Keydown handler for the list container. Handles ArrowUp/ArrowDown/j/k/Home/End.
   * Only fires when focus is on a registered card or a `cardSelector`-matched extra
   * item (not on a descendant input, button, or nested card).
   */
  onListKeyDown: (event: React.KeyboardEvent) => void;
}
