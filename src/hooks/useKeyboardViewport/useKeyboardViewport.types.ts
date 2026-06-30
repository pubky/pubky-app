export interface KeyboardViewportState {
  isKeyboardVisible: boolean;
  keyboardHeight: number;
  keyboardTop: number;
  viewportHeight: number;
  viewportOffsetTop: number;
}

export interface UseKeyboardViewportOptions {
  /**
   * Whether the hook should measure and subscribe to viewport changes.
   * Default: true.
   */
  enabled?: boolean;
  /**
   * Threshold in pixels to determine if keyboard is visible.
   * Default: 150px.
   */
  threshold?: number;
  /**
   * Debounce delay when keyboard opens or stays open.
   * Default: 50ms.
   */
  debounceMs?: number;
}
