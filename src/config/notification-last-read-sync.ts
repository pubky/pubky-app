import { APP_LAST_READ_FILE, APP_PRIVATE_PATH } from '@/config/app-files';

/**
 * Homeserver event-stream filter for the notification `last_read` file.
 * One of the path filters of the shared `HomeserverEventStreamCoordinator` subscription. The social v1 port moves
 * the file, and only this constant follows it. The v1 file is private, and a private stream needs a session that
 * deadlocks the SDK's bearer refresh (ADR-0014), so `CoordinatorsManager` does not start this channel (FIX-8 in
 * `docs/migrations/social-v1.md`).
 */
export const NOTIFICATION_LAST_READ_HOMESERVER_EVENTS_PATH_PREFIX = `${APP_PRIVATE_PATH}${APP_LAST_READ_FILE}`;

/**
 * Delay before calling `NotificationController.fetchLastReadFromHomeserver` after `last_read` SSE events.
 * Fixed (not configurable via env); see `docs/environment.md`.
 */
export const NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS = 500;

/** Prefix for `sessionStorage` keys storing the last HS events-stream cursor per user. */
export const NOTIFICATION_LAST_READ_SYNC_CURSOR_STORAGE_PREFIX = 'pubky-app:notification-last-read-sync-cursor:';
