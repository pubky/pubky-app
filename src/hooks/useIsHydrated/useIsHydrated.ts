'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;
const getSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * `false` on the server and while React hydrates its HTML, `true` from then on and on every later client mount.
 * Server-rendered components gate browser-only state on it (the auth store rehydrates from `localStorage`), so the
 * render that hydrates matches the server's markup.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
