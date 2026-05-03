'use client';

import { useEffect, useState } from 'react';

/**
 * Hook to detect touch devices in a SSR-safe manner.
 * Returns false on the server and during initial render to prevent hydration mismatches.
 * Updates to the actual touch capability after component mounts on the client.
 */
export function useIsTouchDevice() {
  // Initialize with false to ensure stable initial value on server
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    const checkTouch = () => {
      if (typeof window === 'undefined') return;

      const hasOntouchstart = 'ontouchstart' in window && window.ontouchstart !== undefined;
      const hasMaxTouchPoints = navigator && navigator.maxTouchPoints > 0;
      const hasCoarsePointer = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : false;

      setIsTouch(hasOntouchstart || hasMaxTouchPoints || hasCoarsePointer);
    };

    // Check touch capability after mount
    checkTouch();

    // Re-check on resize in case device capabilities change
    window.addEventListener('resize', checkTouch);
    return () => window.removeEventListener('resize', checkTouch);
  }, []);

  return isTouch;
}
