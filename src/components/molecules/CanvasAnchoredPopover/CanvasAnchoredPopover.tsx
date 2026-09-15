'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/libs/utils/utils';

export interface CanvasAnchoredPopoverProps {
  /** Anchor point, relative to the positioned ancestor (the graph page container) */
  x: number;
  y: number;
  /** Gap between the anchor point and the popover edge */
  offset?: number;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  className?: string;
  children: React.ReactNode;
  'data-cy'?: string;
}

/**
 * CanvasAnchoredPopover
 *
 * Positioner for overlays anchored to canvas entities (nodes, edge chips).
 * DOM-anchored popovers cannot track a force-graph camera, so this positions
 * absolutely inside the page container, prefers the anchor's right side,
 * flips left when it would overflow, and clamps so the content always spawns
 * fully visible. Callers re-render it with fresh coordinates per frame (see
 * useTrackedPoint in the Graph template), which makes it follow pan, zoom,
 * and node drags.
 */
export function CanvasAnchoredPopover({
  x,
  y,
  offset = 14,
  onPointerEnter,
  onPointerLeave,
  className,
  children,
  'data-cy': dataCy,
}: CanvasAnchoredPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  // Runs on every render on purpose: coordinates change per frame and the
  // content can resize as it loads; the bail-out below keeps it loop-free
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = ref.current;
    const bounds = el?.offsetParent?.getBoundingClientRect();
    if (!el || !bounds) return;
    const { width, height } = el.getBoundingClientRect();
    let left = x + offset;
    if (left + width > bounds.width - 8) left = x - width - offset;
    left = Math.max(8, Math.min(left, bounds.width - width - 8));
    const top = Math.max(8, Math.min(y - height / 2, bounds.height - height - 8));
    setPosition((prev) => (prev && prev.left === left && prev.top === top ? prev : { left, top }));
  });

  return (
    <div
      ref={ref}
      className={cn('absolute z-30', className)}
      // First paint happens offscreen so measurement never flashes
      style={position ?? { left: -9999, top: -9999 }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      data-cy={dataCy}
    >
      {children}
    </div>
  );
}
