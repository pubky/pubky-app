'use client';

import { useIsTouchDevice } from '@/hooks/useIsTouchDevice/useIsTouchDevice';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { UsePullToRefreshOptions, UsePullToRefreshResult, PullToRefreshState } from './usePullToRefresh.types';

/**
 * Default configuration values
 */
const DEFAULT_THRESHOLD = 72; // px needed to trigger refresh
const DEFAULT_MAX_PULL = 120; // cap pull distance
const DEFAULT_RESISTANCE = 140; // rubber band resistance factor
const REFRESH_SNAP_POSITION = 64; // position to hold indicator during refresh

/**
 * usePullToRefresh
 *
 * A hook that implements pull-to-refresh functionality for touch devices.
 * Features rubber band physics, threshold detection, and haptic feedback.
 * Touch events are scoped to the provided containerRef so that pull-to-refresh
 * only activates when the user interacts directly with the target element
 * (not when dialogs, sidebars, or other overlays are open).
 *
 * @example
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 * const { state, pullDistance } = usePullToRefresh({
 *   containerRef,
 *   onRefresh: async () => {
 *     await fetchNewData();
 *   },
 * });
 *
 * return (
 *   <div ref={containerRef}>
 *     <PullToRefreshIndicator state={state} pullDistance={pullDistance} />
 *     {children}
 *   </div>
 * );
 * ```
 */
export function usePullToRefresh({
  containerRef,
  onRefresh,
  threshold = DEFAULT_THRESHOLD,
  maxPull = DEFAULT_MAX_PULL,
  resistance = DEFAULT_RESISTANCE,
  disabled = false,
}: UsePullToRefreshOptions): UsePullToRefreshResult {
  const [state, setState] = useState<PullToRefreshState>('idle');
  const [pullDistance, setPullDistance] = useState(0);

  const isTouchDevice = useIsTouchDevice();

  // Refs for tracking touch state
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const refreshingRef = useRef(false);
  // Use ref to avoid stale closure in event handlers and prevent re-attaching listeners on every pull
  const pullDistanceRef = useRef(0);
  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);

  /**
   * Trigger haptic feedback (best effort)
   */
  const haptic = useCallback((intensity: 'light' | 'medium' = 'light') => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      const duration = intensity === 'light' ? 10 : 20;
      navigator.vibrate(duration);
    }
  }, []);

  /**
   * Apply rubber band resistance to pull distance
   * Creates a natural "elastic" feel
   */
  const applyResistance = useCallback(
    (rawPull: number): number => {
      return maxPull * (1 - Math.exp(-rawPull / resistance));
    },
    [maxPull, resistance],
  );

  /**
   * Check if we're at the top of the page
   */
  const isAtTop = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;
    return window.scrollY <= 0;
  }, []);

  /**
   * Handle the refresh action
   */
  const handleRefresh = useCallback(async () => {
    refreshingRef.current = true;
    setState('refreshing');
    // Snap to fixed position during refresh so indicator stays visible
    setPullDistance(REFRESH_SNAP_POSITION);
    pullDistanceRef.current = REFRESH_SNAP_POSITION;
    haptic('medium');

    try {
      await onRefresh();
    } finally {
      // Only update state if still mounted
      if (isMountedRef.current) {
        setPullDistance(0);
        pullDistanceRef.current = 0;
        setState('idle');
      }
      refreshingRef.current = false;
    }
  }, [onRefresh, haptic]);

  /**
   * Reset pull state with animation
   */
  const resetPull = useCallback(() => {
    pullingRef.current = false;
    setPullDistance(0);
    pullDistanceRef.current = 0;
    setState('idle');
  }, []);

  // Touch event handlers
  useEffect(() => {
    if (disabled || !isTouchDevice) return;
    if (typeof window === 'undefined') return;

    const container = containerRef.current;
    if (!container) return;

    let thresholdArmed = false;

    const handleTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (!isAtTop()) return;

      startYRef.current = e.touches[0].clientY;
      pullingRef.current = true;
      thresholdArmed = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current || refreshingRef.current) return;

      // If we've scrolled away from top, cancel pulling
      if (!isAtTop()) {
        resetPull();
        return;
      }

      const currentY = e.touches[0].clientY;
      const rawDelta = currentY - startYRef.current;

      // Only handle downward pulls
      if (rawDelta <= 0) {
        setPullDistance(0);
        pullDistanceRef.current = 0;
        setState('idle');
        return;
      }

      // Prevent native scroll/bounce while pulling
      e.preventDefault();

      const resistedPull = applyResistance(rawDelta);
      setPullDistance(resistedPull);
      pullDistanceRef.current = resistedPull;

      const isReady = resistedPull >= threshold;

      // Haptic feedback when crossing threshold
      if (isReady && !thresholdArmed) {
        thresholdArmed = true;
        haptic('light');
        setState('ready');
      } else if (!isReady && thresholdArmed) {
        thresholdArmed = false;
        setState('pulling');
      } else if (!isReady && resistedPull > 0) {
        setState('pulling');
      }
    };

    const handleTouchEnd = () => {
      if (!pullingRef.current || refreshingRef.current) return;
      pullingRef.current = false;

      // Use ref to get current pull distance (avoids stale closure)
      if (pullDistanceRef.current >= threshold) {
        handleRefresh();
      } else {
        resetPull();
      }
    };

    // Attach event listeners to the container element so that only touches
    // originating inside this element trigger pull-to-refresh. This prevents
    // activation when dialogs, sidebars, or other overlays are open.
    // touchstart and touchend can be passive
    // touchmove must be non-passive to allow preventDefault
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [disabled, isTouchDevice, containerRef, threshold, isAtTop, applyResistance, haptic, handleRefresh, resetPull]);

  // Track mounted state for cleanup
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    state,
    pullDistance,
  };
}
