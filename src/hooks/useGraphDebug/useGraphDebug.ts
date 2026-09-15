'use client';

import { type RefObject, useEffect } from 'react';
import { IS_DEBUG } from '@/config/logs';
import type { SocialGraphHandle } from '@/organisms/SocialGraph/SocialGraph.types';

/** QA surface exposed on window in debug builds; inert everywhere else. */
export type GraphDebugSurface = {
  nodeIds: () => Record<'user' | 'post' | 'tag' | 'profile_tag', string[]>;
  screenPositionOf: (nodeId: string) => { x: number; y: number } | null;
  screenMidpointOf: (aId: string, bId: string) => { x: number; y: number } | null;
  pinnedIds: () => string[];
  settled: () => boolean;
  zoom: () => number | null;
  hoveredId: () => string | null;
  focusId: () => string | null;
  pathIds: () => string[] | null;
  /** Freeze/unfreeze the simulation so audits interact with a static layout */
  setPaused: (paused: boolean) => void;
};

declare global {
  interface Window {
    __graphDebug?: GraphDebugSurface;
  }
}

/**
 * useGraphDebug
 *
 * Publishes the canvas handle plus a few state getters as window.__graphDebug
 * so the cypress interaction audit can enumerate nodes, resolve their screen
 * positions, and assert focus/settledness. Gated on NEXT_PUBLIC_DEBUG_MODE:
 * production deployments never expose it.
 */
export function useGraphDebug(
  canvasRef: RefObject<SocialGraphHandle | null>,
  getters: { focusId: () => string | null; pathIds: () => string[] | null },
): void {
  const { focusId, pathIds } = getters;
  useEffect(() => {
    if (!IS_DEBUG || typeof window === 'undefined') return;
    window.__graphDebug = {
      nodeIds: () => canvasRef.current?.nodeIds() ?? { user: [], post: [], tag: [], profile_tag: [] },
      screenPositionOf: (nodeId) => canvasRef.current?.screenPositionOf(nodeId) ?? null,
      screenMidpointOf: (aId, bId) => canvasRef.current?.screenMidpointOf(aId, bId) ?? null,
      pinnedIds: () => canvasRef.current?.pinnedIds() ?? [],
      settled: () => canvasRef.current?.isSettled() ?? false,
      zoom: () => canvasRef.current?.zoomLevel() ?? null,
      hoveredId: () => canvasRef.current?.hoveredId() ?? null,
      focusId,
      pathIds,
      setPaused: (paused) => canvasRef.current?.setPaused(paused),
    };
    return () => {
      delete window.__graphDebug;
    };
  }, [canvasRef, focusId, pathIds]);
}
