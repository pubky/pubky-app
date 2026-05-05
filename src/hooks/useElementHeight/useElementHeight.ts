'use client';

import { useEffect, useRef, useState } from 'react';

export function useElementHeight() {
  const [height, setHeight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    const updateHeight = () => {
      if (ref.current) {
        const height = ref.current.getBoundingClientRect().height;
        setHeight(height);
      }
    };

    // Initial height measurement - use requestAnimationFrame to ensure DOM is ready
    const measureInitialHeight = () => {
      requestAnimationFrame(() => {
        updateHeight();
      });
    };

    measureInitialHeight();

    // Use ResizeObserver to watch for content changes
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(updateHeight);
    });
    resizeObserver.observe(ref.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return { ref, height };
}
