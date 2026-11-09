import { APP_LAST_READ_FILE, APP_PRIVATE_PATH } from '@/config/app-files';
import { MUTE_SYNC_POLL_INTERVAL_MS } from '@/config/mute-sync';

/**
 * Homeserver event-stream filter for the notification `last_read` file.
 * One of the path filters of the shared `HomeserverEventStreamCoordinator` subscription. The social v1 port moves
 * the file, and only this constant follows it. The v1 file is private, and a session-bound stream holds the shared
 * session lock until its response headers reach the SDK, with no timeout (pubky/pubky-homeserver#798), so
 * `CoordinatorsManager` does not start this channel; `NotificationLastReadPollCoordinator` polls the file instead
 * (ADR-0029).
 */
export const NOTIFICATION_LAST_READ_HOMESERVER_EVENTS_PATH_PREFIX = `${APP_PRIVATE_PATH}${APP_LAST_READ_FILE}`;

/**
 * How often `NotificationLastReadPollCoordinator` re-reads the private `last_read` file while the tab is visible:
 * the mute list's cadence, the other private file an open session keeps aligned by polling (ADR-0014).
 * Fixed (not configurable via env); see `docs/environment.md`.
 */
export const NOTIFICATION_LAST_READ_SYNC_POLL_INTERVAL_MS = MUTE_SYNC_POLL_INTERVAL_MS;

/**
 * Delay before calling `NotificationController.fetchLastReadFromHomeserver` after a refresh trigger (a `last_read`
 * SSE event, or a poll trigger: start, a return to the tab, `online`), so triggers that land together make one read.
 * Fixed (not configurable via env); see `docs/environment.md`.
 */
export const NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS = 500;

/** Prefix for `sessionStorage` keys storing the last HS events-stream cursor per user. */
export const NOTIFICATION_LAST_READ_SYNC_CURSOR_STORAGE_PREFIX = 'pubky-app:notification-last-read-sync-cursor:';
