export interface UseKeyboardVisibleOptions {
  /**
   * Threshold in pixels to determine if keyboard is visible
   * Default: 150px (difference between layout viewport and visual viewport)
   */
  threshold?: number;
  /**
   * Debounce delay in milliseconds
   * Default: 50ms
   */
  debounceMs?: number;
}
