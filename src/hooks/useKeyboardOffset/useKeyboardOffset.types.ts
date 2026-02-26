export interface UseKeyboardOffsetOptions {
  /**
   * Amount to subtract from the calculated offset (in pixels)
   * Useful when you want less movement than the full keyboard height
   * Default: 0
   *
   * @example
   * // For dialogs that are already centered and don't need to move as much
   * useKeyboardOffset({ offsetAdjustment: 200 })
   */
  offsetAdjustment?: number;
}
