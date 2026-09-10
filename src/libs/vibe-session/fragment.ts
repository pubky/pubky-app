const SESSION_PARAM = 's';

let consumed = false;
let cachedExport: string | null = null;

function hashSearchParams(hash: string): URLSearchParams {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  return new URLSearchParams(raw);
}

function resolveWindow(win?: Window): Window | undefined {
  if (win) {
    return win;
  }
  const g = globalThis as { window?: Window };
  return g.window;
}

export function readFragmentSessionExport(win?: Window): string | null {
  const w = resolveWindow(win);
  if (!w?.location) {
    return null;
  }
  const params = hashSearchParams(w.location.hash ?? '');
  const value = params.get(SESSION_PARAM);
  return value && value.length > 0 ? value : null;
}

export function clearFragmentSessionExport(win?: Window): void {
  const w = resolveWindow(win);
  if (!w?.location || !w.history?.replaceState) {
    return;
  }
  const params = hashSearchParams(w.location.hash ?? '');
  if (!params.has(SESSION_PARAM)) {
    return;
  }
  params.delete(SESSION_PARAM);
  const remaining = params.toString();
  const path = `${w.location.pathname}${w.location.search}`;
  const next = remaining.length > 0 ? `${path}#${remaining}` : path;
  w.history.replaceState(w.history.state, '', next);
}

/**
 * Read `#s=` once, strip it from the URL (even when empty / already consumed),
 * and cache the value for the restore path. Safe to call on every client boot.
 */
export function consumeFragmentSessionExport(win?: Window): string | null {
  if (!consumed) {
    cachedExport = readFragmentSessionExport(win);
    consumed = true;
  }
  clearFragmentSessionExport(win);
  return cachedExport;
}

/**
 * True when a consumed-but-not-yet-taken `#s=` export is cached.
 * Calls consume so it also works if instrumentation-client has not run yet.
 */
export function hasPendingFragmentSessionExport(win?: Window): boolean {
  consumeFragmentSessionExport(win);
  return cachedExport !== null;
}

/**
 * Return the consumed fragment export for restore and clear the cache so a
 * later restore cannot reuse a board hand-off from this page load.
 */
export function takeFragmentSessionExport(win?: Window): string | null {
  const value = consumeFragmentSessionExport(win);
  cachedExport = null;
  return value;
}

/** Test-only: reset the one-shot consume/take cache. */
export function resetFragmentSessionExportCache(): void {
  consumed = false;
  cachedExport = null;
}
