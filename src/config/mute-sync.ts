/**
 * Homeserver event-stream filter for mute JSON entries under `pubky.app`.
 * Passed to `@synonymdev/pubky` `eventStreamForUser(...).path(...)`.
 */
export const MUTE_HOMESERVER_EVENTS_PATH_PREFIX = '/pub/pubky.app/mutes/';

/**
 * Delay before calling `MuteController.fetchMutedUsers` after mute-directory SSE events.
 * Fixed (not configurable via env); see `docs/environment.md`.
 */
export const MUTE_SYNC_DEBOUNCE_MS = 500;

/** Prefix for `sessionStorage` keys storing the last HS events-stream cursor per user. */
export const MUTE_SYNC_CURSOR_STORAGE_PREFIX = 'pubky-app:mute-sync-cursor:';

/**
 * Drops homeserver event-stream cursors for mute sync. Session storage survives logout until the tab closes;
 * clearing on sign-out avoids leaving per-user cursor state in an open tab.
 */
export function clearMuteSyncCursorSessionStorage(): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    // Collect keys first: removing while iterating indices is unsafe.
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(MUTE_SYNC_CURSOR_STORAGE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      sessionStorage.removeItem(key);
    }
  } catch {
    // Private mode / access errors — ignore.
  }
}

/** Wait before reconnecting the SDK event stream after a network/end error or disconnect. */
export const MUTE_SYNC_RECONNECT_BACKOFF_MS = 1000;
