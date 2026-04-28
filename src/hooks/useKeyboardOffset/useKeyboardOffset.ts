'use client';

import { useState, useEffect } from 'react';
import { useKeyboardVisible } from '../useKeyboardVisible/useKeyboardVisible';
import { UseKeyboardOffsetOptions } from './useKeyboardOffset.types';

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
  const isKeyboardVisible = useKeyboardVisible();
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  useEffect(() => {
    // Reset offset when keyboard is not visible
    if (!isKeyboardVisible || typeof window === 'undefined' || !window.visualViewport) {
      setKeyboardOffset(0);
      return;
    }

    const updateOffset = () => {
      if (window.visualViewport) {
        // Calculate how much to offset to keep content above the keyboard
        const rawOffset = window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop;
        // Apply adjustment and ensure offset is never negative
        const adjustedOffset = Math.max(0, rawOffset - offsetAdjustment);
        setKeyboardOffset(adjustedOffset);
      }
    };

    // Initial calculation
    updateOffset();

    // Listen for viewport changes
    window.visualViewport.addEventListener('resize', updateOffset);
    window.visualViewport.addEventListener('scroll', updateOffset);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateOffset);
        window.visualViewport.removeEventListener('scroll', updateOffset);
      }
    };
  }, [isKeyboardVisible, offsetAdjustment]);

  return { isKeyboardVisible, keyboardOffset };
}
