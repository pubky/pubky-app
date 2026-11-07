/**
 * Homeserver event-stream filter for the notification `last_read` file.
 * One of the path filters of the shared `HomeserverEventStreamCoordinator` subscription. The social v1 port moves
 * the file, and only this constant follows it.
 */
export const NOTIFICATION_LAST_READ_HOMESERVER_EVENTS_PATH_PREFIX = '/pub/pubky.app/last_read';

/**
 * Delay before calling `NotificationController.fetchLastReadFromHomeserver` after `last_read` SSE events.
 * Fixed (not configurable via env); see `docs/environment.md`.
 */
export const NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS = 500;

/** Prefix for `sessionStorage` keys storing the last HS events-stream cursor per user. */
export const NOTIFICATION_LAST_READ_SYNC_CURSOR_STORAGE_PREFIX = 'pubky-app:notification-last-read-sync-cursor:';
