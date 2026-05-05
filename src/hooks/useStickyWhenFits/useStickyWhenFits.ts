'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LAYOUT_DIMENSIONS } from '@/config/layoutDimensions';

interface UseStickyWhenFitsOptions {
  /**
   * Offset from top of viewport (e.g., header height)
   * Should match the CSS variable for header height:
   * - Profile pages: LAYOUT_DIMENSIONS.HEADER_HEIGHT_PROFILE (146px, --header-height)
   * - Main content areas: LAYOUT_DIMENSIONS.HEADER_OFFSET_MAIN (144px, --header-offset-main)
   * Default: LAYOUT_DIMENSIONS.HEADER_OFFSET_MAIN (144px)
   */
  topOffset?: number;
  /**
   * Extra padding/margin to account for at bottom
   * Default: LAYOUT_DIMENSIONS.SIDEBAR_BOTTOM_OFFSET (48px, pb-12 = 3rem)
   */
  bottomOffset?: number;
  /**
   * Debounce delay in milliseconds
   * Default: 100ms
   */
  debounceMs?: number;
}

interface UseStickyWhenFitsResult {
  /** Ref to attach to the element */
  ref: React.RefObject<HTMLDivElement | null>;
  /**
   * Whether the element should be sticky.
   * - `undefined`: Not yet calculated (SSR or before first client render)
   * - `true`: Element fits in viewport, should be sticky
   * - `false`: Element is too tall, should not be sticky
   *
   * For backwards compatibility, use `shouldBeSticky !== false` to treat
   * undefined as sticky (optimistic assumption during SSR).
   */
  shouldBeSticky: boolean | undefined;
  /** Whether the sticky calculation has been performed (client-side only) */
  isReady: boolean;
  /**
   * Dynamically calculated negative offset for when sidebar doesn't fit.
   * Calculated as: viewportHeight - sidebarHeight - bottomOffset
   * This ensures the sidebar only scrolls as much as needed to reveal bottom elements.
   * Only valid when shouldBeSticky is false.
   */
  nonStickyOffset: number | undefined;
  /**
   * Pre-calculated sticky top value in pixels.
   * - When `shouldBeSticky` is `true` or `undefined` (SSR): returns `topOffset`
   * - When `shouldBeSticky` is `false`: returns `nonStickyOffset` if available, otherwise `topOffset`
   *
   * This eliminates the need for consumers to calculate this value themselves.
   */
  stickyTop: number;
}

/**
 * Hook to determine if an element should be sticky based on whether
 * it fits within the available viewport height.
 *
 * The element will only be sticky if its height is less than or equal
 * to the available viewport height (viewport - topOffset - bottomOffset).
 *
 * ## Dynamic Offset Calculation
 * When the sidebar doesn't fit vertically, the hook calculates a dynamic
 * negative offset (`nonStickyOffset`) that positions the sidebar so it only
 * scrolls as much as needed to reveal bottom elements. The formula is:
 * `viewportHeight - sidebarHeight - bottomOffset`
 *
 * This ensures optimal scrolling behavior - the sidebar will scroll down
 * when needed, but will return into view with minimal scrolling when
 * scrolling back up.
 *
 * ## SSR Behavior
 * - `shouldBeSticky` starts as `undefined` during SSR and initial hydration
 * - After the first client-side render, it's calculated and set to a boolean
 * - Use `isReady` to check if the calculation has been performed
 * - Use `shouldBeSticky !== false` for optimistic sticky behavior during SSR
 *
 * @param options - Configuration options
 * @returns Object with ref, shouldBeSticky state, isReady flag, and nonStickyOffset
 *
 * @example
 * ```tsx
 * function Sidebar({ children }) {
 *   const { ref, stickyTop } = useStickyWhenFits({ topOffset: 100 });
 *
 *   return (
 *     <div
 *       ref={ref}
 *       className="sticky"
 *       style={{ top: `${stickyTop}px` }}
 *     >
 *       {children}
 *     </div>
 *   );
 * }
 * ```
 */
export function useStickyWhenFits(options: UseStickyWhenFitsOptions = {}): UseStickyWhenFitsResult {
  const {
    topOffset = LAYOUT_DIMENSIONS.HEADER_OFFSET_MAIN,
    bottomOffset = LAYOUT_DIMENSIONS.SIDEBAR_BOTTOM_OFFSET,
    debounceMs = 100,
  } = options;

  const ref = useRef<HTMLDivElement>(null);
  // Start with undefined to avoid SSR hydration mismatch
  // The value is only calculated client-side after the component mounts
  const [shouldBeSticky, setShouldBeSticky] = useState<boolean | undefined>(undefined);
  const [nonStickyOffset, setNonStickyOffset] = useState<number | undefined>(undefined);

  const checkIfFits = useCallback(() => {
    if (!ref.current) return;

    const elementHeight = ref.current.getBoundingClientRect().height;
    const viewportHeight = window.innerHeight;
    const availableHeight = viewportHeight - topOffset - bottomOffset;

    const fits = elementHeight <= availableHeight;
    setShouldBeSticky(fits);

    // Calculate dynamic offset when sidebar doesn't fit
    // Formula: viewportHeight - sidebarHeight - bottomOffset
    // This positions the sidebar so bottom elements are visible with minimal scrolling
    if (!fits) {
      const calculatedOffset = viewportHeight - elementHeight - bottomOffset;
      setNonStickyOffset(calculatedOffset);
    } else {
      setNonStickyOffset(undefined);
    }
  }, [topOffset, bottomOffset]);

  useEffect(() => {
    if (typeof window === 'undefined' || !ref.current) return;

    let timeoutId: NodeJS.Timeout;

    const debouncedCheck = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(checkIfFits, debounceMs);
    };

    // Initial check
    checkIfFits();

    // Listen to window resize
    window.addEventListener('resize', debouncedCheck);

    // Use ResizeObserver to watch for content size changes
    const resizeObserver = new ResizeObserver(() => {
      debouncedCheck();
    });
    resizeObserver.observe(ref.current);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', debouncedCheck);
      resizeObserver.disconnect();
    };
  }, [checkIfFits, debounceMs]);

  // Calculate stickyTop: use topOffset when sticky or SSR, otherwise use nonStickyOffset
  const stickyTop = shouldBeSticky !== false ? topOffset : (nonStickyOffset ?? topOffset);

  return {
    ref,
    shouldBeSticky,
    isReady: shouldBeSticky !== undefined,
    nonStickyOffset,
    stickyTop,
  };
}
