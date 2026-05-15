'use client';

import { useEffect, useRef, useState } from 'react';
import { UseKeyboardVisibleOptions } from './useKeyboardVisible.types';

/**
 * useKeyboardVisible
 *
 * Hook to detect if the mobile keyboard is visible.
 * Uses the Visual Viewport API to detect when the keyboard opens/closes.
 *
 * When the soft keyboard appears on mobile:
 * - The visual viewport height decreases
 * - The difference between window.innerHeight and visualViewport.height increases
 *
 * @param options - Configuration options
 * @param options.threshold - Height difference threshold in pixels (default: 150)
 * @param options.debounceMs - Debounce delay in milliseconds (default: 50)
 * @returns boolean indicating if the keyboard is currently visible
 *
 * @example
 * ```tsx
 * const isKeyboardVisible = useKeyboardVisible();
 *
 * // Use with custom threshold
 * const isKeyboardVisible = useKeyboardVisible({ threshold: 200 });
 *
 * // Apply conditional styling
 * <div className={cn('footer', isKeyboardVisible && 'keyboard-open')}>
 *   Footer content
 * </div>
 * ```
 */
export function useKeyboardVisible(options: UseKeyboardVisibleOptions = {}): boolean {
  const { threshold = 150, debounceMs = 50 } = options;
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousVisibleRef = useRef(false);

  useEffect(() => {
    // Check if Visual Viewport API is available (not available in all browsers)
    if (typeof window === 'undefined' || !window.visualViewport) {
      return;
    }

    const checkKeyboardVisibility = () => {
      if (!window.visualViewport) return;

      // Calculate the difference between layout viewport and visual viewport
      // When keyboard opens, visual viewport height is smaller
      const viewportHeightDiff = window.innerHeight - window.visualViewport.height;
      const keyboardIsVisible = viewportHeightDiff > threshold;

      setIsKeyboardVisible(keyboardIsVisible);
      previousVisibleRef.current = keyboardIsVisible;
    };

    const handleViewportChange = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      if (!window.visualViewport) return;

      // Calculate current state
      const viewportHeightDiff = window.innerHeight - window.visualViewport.height;
      const keyboardIsVisible = viewportHeightDiff > threshold;

      // If keyboard is closing (was visible, now not visible), update immediately with no debounce
      if (previousVisibleRef.current && !keyboardIsVisible) {
        checkKeyboardVisibility();
      } else {
        // If keyboard is opening or staying open, use debounce
        timeoutRef.current = setTimeout(() => {
          checkKeyboardVisibility();
        }, debounceMs);
      }
    };

    // Check initial state
    checkKeyboardVisibility();

    // Listen to viewport changes
    window.visualViewport.addEventListener('resize', handleViewportChange);
    window.visualViewport.addEventListener('scroll', handleViewportChange);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportChange);
        window.visualViewport.removeEventListener('scroll', handleViewportChange);
      }
    };
  }, [threshold, debounceMs]);

  return isKeyboardVisible;
}
