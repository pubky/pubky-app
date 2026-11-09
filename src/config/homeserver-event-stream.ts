/**
 * Timing and reporting policy of the one homeserver event stream per tab (`HomeserverEventStreamCoordinator`),
 * which carries the mute-list and notification `last_read` sync. Fixed (not configurable via env); see
 * `docs/environment.md`.
 */

/** Wait before reconnecting the SDK event stream after a network/end error or disconnect. */
export const HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MS = 1000;

/**
 * Cap for the reconnect delay while the event stream keeps failing. Delay doubles per consecutive failure from
 * {@link HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MS} up to this value. A failing refresh after an event backs
 * off the same way.
 */
export const HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MAX_MS = 30_000;

/**
 * A stream connection that stayed open at least this long is healthy: a failure after it starts a new failure
 * streak instead of extending the previous one. A healthy idle stream (no mute or `last_read` changes) never
 * completes a `read()`, so completed reads alone cannot mark it healthy.
 */
export const HOMESERVER_EVENT_STREAM_HEALTHY_AFTER_MS = 30_000;

/**
 * Consecutive stream failures (no healthy read or sustained connection in between) after which the coordinator
 * reports the outage to Sentry once. Routine reconnects are dropped by the `homeserver-event-stream-connect`
 * rule; with the doubling backoff this threshold corresponds to roughly one minute of continuous failure.
 */
export const HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD = 6;
