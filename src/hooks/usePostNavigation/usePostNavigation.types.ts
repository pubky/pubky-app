import type React from 'react';

export interface UsePostNavigationResult {
  /**
   * Build the post detail URL for a composite post ID.
   */
  getPostHref: (postId: string) => string;
  /**
   * Navigate to a post detail page using composite ID.
   */
  navigateToPost: (postId: string) => void;
  /**
   * Build the collection detail URL for a composite post ID.
   */
  getCollectionHref: (postId: string) => string;
  /**
   * Navigate to a collection detail page using composite ID.
   */
  navigateToCollection: (postId: string) => void;
  /**
   * Click handler for clickable post wrappers (e.g., feed cards).
   * Plain left click → SPA navigation. Cmd/Ctrl/Shift+Click → opens in a new tab.
   */
  handlePostClick: (postId: string, event: React.MouseEvent) => void;
  /**
   * Auxiliary-click handler. Middle-click (button === 1) opens the post in a new tab.
   */
  handlePostAuxClick: (postId: string, event: React.MouseEvent) => void;
  /**
   * Keyboard handler for focusable post wrappers.
   * Enter / Space → SPA navigation. Cmd/Ctrl/Shift + Enter → opens in a new tab.
   * Only activates when the keydown originated on the wrapper itself (event.target === event.currentTarget).
   */
  handlePostKeyDown: (postId: string, event: React.KeyboardEvent) => void;
}
