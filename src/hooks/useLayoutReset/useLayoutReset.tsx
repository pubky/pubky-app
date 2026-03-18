'use client';

import { useLayoutEffect } from 'react';
import * as Core from '@/core';

/**
 * Hook to reset unsupported wide-shell pages back to columns.
 * Visual layout is intentionally preserved and handled via render-time fallback.
 */
export function useLayoutReset() {
  const { layout, setLayout } = Core.useHomeStore();

  useLayoutEffect(() => {
    if (layout !== Core.LAYOUT.WIDE) {
      return;
    }

    setLayout(Core.LAYOUT.COLUMNS);
  }, [layout, setLayout]);
}
