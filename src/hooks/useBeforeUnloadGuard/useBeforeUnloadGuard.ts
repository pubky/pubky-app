'use client';

import { useEffect } from 'react';

/**
 * Asks the browser to confirm before the tab unloads while `active`: closing or reloading it
 * mid-migration would interrupt the run (it resumes on the next sign-in, but the user should
 * not lose minutes by accident). The browser shows its own generic prompt; no copy is involved.
 */
export function useBeforeUnloadGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [active]);
}
