import type { BeforeInstallPromptEvent, InstallPromptOutcome } from './pwa.types';

/**
 * Captures Chromium's `beforeinstallprompt` so the app can offer installation from
 * its own banner instead of the browser's mini-infobar.
 *
 * The event fires once, early, and is never replayed, so the listener is registered
 * at module evaluation. This module must stay dependency-free and be statically
 * imported from the root-layout client bundle (via `PwaManager`) so it evaluates
 * before the browser decides the page is installable.
 */

interface InstallPromptSnapshot {
  /** A `beforeinstallprompt` event is captured and can be shown. */
  canPrompt: boolean;
  /** `appinstalled` fired during this page's lifetime. */
  installed: boolean;
}

const SERVER_SNAPSHOT: InstallPromptSnapshot = { canPrompt: false, installed: false };

let deferredPrompt: BeforeInstallPromptEvent | null = null;
// Kept as one stable object so useSyncExternalStore sees a new reference only on change.
let snapshot: InstallPromptSnapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();

function publish(next: Partial<InstallPromptSnapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Suppress the browser's own install UI; the banner calls `promptInstall` instead.
    event.preventDefault();
    deferredPrompt = event;
    publish({ canPrompt: true });
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    publish({ canPrompt: false, installed: true });
  });
}

export function getInstallPromptSnapshot(): InstallPromptSnapshot {
  return snapshot;
}

export function getServerInstallPromptSnapshot(): InstallPromptSnapshot {
  return SERVER_SNAPSHOT;
}

export function subscribeToInstallPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Shows the native install prompt. Must be called synchronously from a user gesture.
 * A captured event can be prompted once; Chrome may fire a fresh one later.
 */
export async function promptInstall(): Promise<InstallPromptOutcome> {
  const event = deferredPrompt;
  if (!event) return 'unavailable';
  deferredPrompt = null;
  publish({ canPrompt: false });
  try {
    await event.prompt();
    return (await event.userChoice).outcome;
  } catch {
    return 'unavailable';
  }
}
