'use client';

import { useCallback, useEffect, useState } from 'react';
import type { UseViewportObserverOptions, UseViewportObserverResult } from './useViewportObserver.types';

/**
 * Default root margin for viewport detection
 * 200px buffer above and below the viewport for pre-detection
 */
const DEFAULT_ROOT_MARGIN = '200px 0px 200px 0px';

/**
 * Default intersection threshold
 * 0 = trigger when any part of the element enters the viewport
 */
const DEFAULT_THRESHOLD = 0;

/**
 * Low-level hook for observing element visibility in the viewport.
 *
 * This is a pure IntersectionObserver wrapper with no business logic.
 * Use this as a building block for higher-level viewport-aware hooks.
 *
 * @param options - Configuration options
 * @returns Object containing the ref callback and visibility state
 *
 * @example
 * ```tsx
 * function LazyImage({ src }) {
 *   const { ref, isVisible } = useViewportObserver();
 *   return (
 *     <div ref={ref}>
 *       {isVisible && <img src={src} />}
 *     </div>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // With custom options
 * function Component() {
 *   const { ref, isVisible } = useViewportObserver({
 *     rootMargin: '100px 0px',
 *     threshold: 0.5,
 *     enabled: someCondition,
 *   });
 *   // ...
 * }
 * ```
 */
export function useViewportObserver({
  rootMargin = DEFAULT_ROOT_MARGIN,
  threshold = DEFAULT_THRESHOLD,
  enabled = true,
}: UseViewportObserverOptions = {}): UseViewportObserverResult {
  // Track observed element via state (ensures useEffect re-runs when element changes)
  const [element, setElement] = useState<HTMLElement | null>(null);

  // Track visibility state
  const [isVisible, setIsVisible] = useState(false);

  // Stable callback ref to attach to the DOM element
  const ref = useCallback((node: HTMLElement | null) => {
    setElement(node);
  }, []);

  // Setup IntersectionObserver
  useEffect(() => {
    // Skip if no element or observation is disabled
    if (!element || !enabled) {
      setIsVisible(false);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      {
        root: null, // Use viewport as root
        rootMargin,
        threshold,
      },
    );

    observer.observe(element);

    // Cleanup on unmount or when dependencies change
    return () => {
      observer.disconnect();
    };
  }, [element, enabled, rootMargin, threshold]);

  return { ref, isVisible };
}
