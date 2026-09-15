'use client';

import { useEffect, useEffectEvent, useState } from 'react';

/**
 * Re-samples a canvas-space point every animation frame while active, so
 * overlays spawn next to their node and track pan, zoom, and drags. Holds the
 * last point through momentary null samples. The sampler is read as an effect
 * event, so a caller may pass a fresh closure every render without restarting
 * the frame loop; the loop restarts (and the held point clears) only when
 * tracking starts, stops, or `target` changes, so a new target never inherits
 * the previous one's position.
 */
export function useTrackedPoint(
  compute: (() => { x: number; y: number } | null) | null,
  target: string | null = null,
): { x: number; y: number } | null {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const active = compute !== null;
  const sample = useEffectEvent(() => compute?.() ?? null);
  useEffect(() => {
    if (!active) {
      setPoint(null);
      return;
    }
    let raf = 0;
    const tick = () => {
      const next = sample();
      if (next) {
        setPoint((prev) => (prev && Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5 ? prev : next));
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      setPoint(null);
    };
  }, [active, target]);
  return point;
}
