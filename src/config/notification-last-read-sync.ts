/**
 * Homeserver event-stream filter for the notification `last_read` file.
 * Passed to `@synonymdev/pubky` `eventStreamForUser(...).path(...)`. The social v1 port moves the file, and only
 * this constant follows it.
 */
export const NOTIFICATION_LAST_READ_HOMESERVER_EVENTS_PATH_PREFIX = '/pub/pubky.app/last_read';

/**
 * Delay before calling `NotificationController.fetchLastReadFromHomeserver` after `last_read` SSE events.
 * Fixed (not configurable via env); see `docs/environment.md`.
 */
export const NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS = 500;

/** Prefix for `sessionStorage` keys storing the last HS events-stream cursor per user. */
export const NOTIFICATION_LAST_READ_SYNC_CURSOR_STORAGE_PREFIX = 'pubky-app:notification-last-read-sync-cursor:';

/** Wait before reconnecting the SDK event stream after a network/end error or disconnect. */
export const NOTIFICATION_LAST_READ_SYNC_RECONNECT_BACKOFF_MS = 1000;

/**
 * Cap for the reconnect delay while the event stream keeps failing. Delay doubles per consecutive failure from
 * {@link NOTIFICATION_LAST_READ_SYNC_RECONNECT_BACKOFF_MS} up to this value.
 */
export const NOTIFICATION_LAST_READ_SYNC_RECONNECT_BACKOFF_MAX_MS = 30_000;

/**
 * A stream connection that stayed open at least this long is healthy: a healthy idle stream (nobody marks
 * notifications read) never completes a `read()`, so completed reads alone cannot mark it healthy.
 */
export const NOTIFICATION_LAST_READ_SYNC_STREAM_HEALTHY_AFTER_MS = 30_000;

/**
 * Consecutive stream failures after which the coordinator reports the outage to Sentry once. Routine reconnects
 * are dropped by the `homeserver-event-stream-connect` rule; with the doubling backoff this is about one minute
 * of continuous failure.
 */
export const NOTIFICATION_LAST_READ_SYNC_STREAM_FAILURE_ALERT_THRESHOLD = 6;
