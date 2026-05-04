'use client';

import { useState, useEffect, useCallback } from 'react';
import { getBreakpoint, type Breakpoint } from '@/config/theme';

interface UseIsMobileOptions {
  /**
   * Breakpoint threshold (default: 'lg' = 1024px)
   * Viewport width below this value is considered mobile
   */
  breakpoint?: Breakpoint;
  /**
   * Debounce delay in milliseconds (default: 150ms)
   * Prevents excessive re-renders during window resize
   */
  debounceMs?: number;
}

/**
 * Hook to detect if the viewport is below a specified breakpoint
 * Uses Tailwind CSS breakpoints by default (lg = 1024px)
 *
 * @param options - Configuration options
 * @param options.breakpoint - Tailwind breakpoint to use as threshold (default: 'lg')
 * @param options.debounceMs - Debounce delay in milliseconds (default: 150)
 * @returns boolean indicating if the current viewport is below the breakpoint
 *
 * @example
 * ```tsx
 * // Default: mobile is < 1024px (lg breakpoint)
 * const isMobile = useIsMobile();
 *
 * // Custom breakpoint: mobile is < 768px (md breakpoint)
 * const isTabletOrBelow = useIsMobile({ breakpoint: 'md' });
 *
 * // Custom debounce delay
 * const isMobile = useIsMobile({ debounceMs: 200 });
 * ```
 */
export function useIsMobile(options: UseIsMobileOptions = {}): boolean {
  const { breakpoint = 'lg', debounceMs = 150 } = options;
  const threshold = getBreakpoint(breakpoint);

  const [isMobile, setIsMobile] = useState(() => {
    // SSR-safe: return false on server, actual value on client
    if (typeof window === 'undefined') return false;
    return window.innerWidth < threshold;
  });

  const checkIsMobile = useCallback(() => {
    const mobile = window.innerWidth < threshold;
    setIsMobile(mobile);
  }, [threshold]);

  useEffect(() => {
    // Check immediately on mount to handle SSR hydration
    checkIsMobile();

    let timeoutId: NodeJS.Timeout;

    const handleResize = () => {
      if (typeof window !== 'undefined') {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(checkIsMobile, debounceMs);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
    };
  }, [checkIsMobile, debounceMs]);

  return isMobile;
}
