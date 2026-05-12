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

/** Wait before reconnecting the SDK event stream after a network/end error or disconnect. */
export const MUTE_SYNC_RECONNECT_BACKOFF_MS = 1000;
