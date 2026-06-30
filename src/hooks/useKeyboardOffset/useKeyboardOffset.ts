'use client';

import { useKeyboardViewport } from '@/hooks/useKeyboardViewport/useKeyboardViewport';
import type { UseKeyboardOffsetOptions } from './useKeyboardOffset.types';

/**
 * useKeyboardOffset
 *
 * Hook that combines keyboard visibility detection with offset calculation.
 * Returns the keyboard visibility state and the calculated offset in pixels
 * needed to keep UI elements above the keyboard.
 *
 * @param options - Configuration options
 * @param options.offsetAdjustment - Amount to subtract from the calculated offset (default: 0)
 * @returns Object containing:
 *   - isKeyboardVisible: boolean indicating if keyboard is currently visible
 *   - keyboardOffset: number of pixels to offset the element upward
 *
 * @example
 * ```tsx
 * // Full offset (e.g., for footer navigation)
 * function MobileFooter() {
 *   const { isKeyboardVisible, keyboardOffset } = useKeyboardOffset();
 *   // keyboardOffset will be the full keyboard height
 * }
 *
 * // Reduced offset (e.g., for centered dialogs)
 * function DialogNewPost() {
 *   const { isKeyboardVisible, keyboardOffset } = useKeyboardOffset({ offsetAdjustment: 200 });
 *   // keyboardOffset will be (keyboard height - 200)
 * }
 * ```
 */
export function useKeyboardOffset(options: UseKeyboardOffsetOptions = {}) {
  const { offsetAdjustment = 0 } = options;
  const { isKeyboardVisible, keyboardHeight } = useKeyboardViewport();
  const keyboardOffset = isKeyboardVisible ? Math.max(0, keyboardHeight - offsetAdjustment) : 0;

  return { isKeyboardVisible, keyboardOffset };
}
