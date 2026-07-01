/**
 * Homeserver event-stream filter for the `last_read` file under `pubky.app`.
 * Passed to `@synonymdev/pubky` `eventStreamForUser(...).path(...)`.
 */
export const NOTIFICATION_LAST_READ_HOMESERVER_EVENTS_PATH_PREFIX = '/pub/pubky.app/last_read';

/**
 * Delay before calling `NotificationController.refreshLastReadFromHomeserver` after
 * last_read SSE events. Fixed (not configurable via env); see `docs/environment.md`.
 */
export const NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS = 500;

/** Prefix for `sessionStorage` keys storing the last HS events-stream cursor per user. */
export const NOTIFICATION_LAST_READ_SYNC_CURSOR_STORAGE_PREFIX = 'pubky-app:notification-last-read-sync-cursor:';

/**
 * Base delay before retrying after a network/end error or disconnect. Used as the first step of an
 * exponential backoff: `min(BASE * 2^(attempt-1), BACKOFF_MAX_MS)` → 1s, 2s, 4s, 8s, 16s, 30s…
 */
export const NOTIFICATION_LAST_READ_SYNC_RECONNECT_BACKOFF_MS = 1000;

/** Upper bound for the exponential reconnect/refresh backoff. */
export const NOTIFICATION_LAST_READ_SYNC_RECONNECT_BACKOFF_MAX_MS = 30_000;

/** Max consecutive failures (stream reconnect + refresh) before giving up until the next state change. */
export const NOTIFICATION_LAST_READ_SYNC_MAX_RETRY_ATTEMPTS = 10;
