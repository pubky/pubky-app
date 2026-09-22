'use client';

import { useSyncExternalStore } from 'react';
import { PWA_STANDALONE_MEDIA_QUERY } from '@/config/pwa';
import { isStandaloneDisplayMode } from '@/libs/pwa/platform';

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const mediaQuery = window.matchMedia(PWA_STANDALONE_MEDIA_QUERY);
  mediaQuery.addEventListener('change', onChange);
  return () => mediaQuery.removeEventListener('change', onChange);
}

const getServerSnapshot = () => false;

/** `true` when the page runs as an installed app rather than in a browser tab. */
export function useIsStandalone(): boolean {
  return useSyncExternalStore(subscribe, isStandaloneDisplayMode, getServerSnapshot);
}
