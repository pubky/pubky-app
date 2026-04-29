'use client';

import { useLayoutEffect } from 'react';
import { useHomeStore } from '@/stores/home/home.store';
import { LAYOUT } from '@/stores/home/home.types';
/**
 * Hook to reset unsupported wide-shell pages back to columns.
 * Visual layout is intentionally preserved and handled via render-time fallback.
 */
export function useLayoutReset() {
  const { layout, setLayout } = useHomeStore();

  useLayoutEffect(() => {
    if (layout !== LAYOUT.WIDE) {
      return;
    }

    setLayout(LAYOUT.COLUMNS);
  }, [layout, setLayout]);
}
