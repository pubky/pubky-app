'use client';

import { useEffect, useRef, useState } from 'react';

export function useElementHeight() {
  const [height, setHeight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let animationFrameId: number | null = null;

    const updateHeight = (nextHeight: number) => {
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);

      animationFrameId = requestAnimationFrame(() => {
        animationFrameId = null;
        setHeight((currentHeight) => (currentHeight === nextHeight ? currentHeight : nextHeight));
      });
    };

    // offsetHeight and ResizeObserver box sizes are layout measurements, so ancestor
    // transforms (for example a dialog's zoom-in animation) cannot shrink the result.
    updateHeight(element.offsetHeight);

    // Use ResizeObserver to watch for content changes
    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) return;

      updateHeight(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
    });
    resizeObserver.observe(element, { box: 'border-box' });

    return () => {
      resizeObserver.disconnect();
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return { ref, height };
}
