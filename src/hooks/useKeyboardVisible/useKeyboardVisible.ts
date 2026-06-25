'use client';

import { useKeyboardViewport } from '@/hooks/useKeyboardViewport/useKeyboardViewport';
import type { UseKeyboardVisibleOptions } from './useKeyboardVisible.types';

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
  return useKeyboardViewport(options).isKeyboardVisible;
}
