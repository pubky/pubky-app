'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * useIsScrolledFromTop
 *
 * Hook to detect if the user has scrolled away from the top of the page.
 * Useful for showing floating elements like "New Posts" buttons.
 *
 * @param threshold - Number of pixels from top to consider as "scrolled" (default: 100)
 * @returns boolean indicating if the user has scrolled past the threshold
 *
 * @example
 * ```tsx
 * const isScrolled = useIsScrolledFromTop(100);
 *
 * if (isScrolled) {
 *   // Show floating button
 * }
 * ```
 */
export function useIsScrolledFromTop(threshold = 100): boolean {
  const [isScrolled, setIsScrolled] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      // Use RAF throttling to reduce unnecessary state updates during scroll
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        setIsScrolled(window.scrollY > threshold);
        rafRef.current = null;
      });
    };

    // Check initial scroll position
    setIsScrolled(window.scrollY > threshold);

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      // Clean up any pending RAF on unmount
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [threshold]);

  return isScrolled;
}
