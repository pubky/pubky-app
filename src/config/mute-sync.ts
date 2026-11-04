/**
 * How often `MuteListSyncCoordinator` re-lists the private mute directory while the tab is visible.
 * It polls because a session-bound event stream deadlocks the SDK's bearer refresh (ADR-0014).
 * Fixed (not configurable via env); see `docs/environment.md`.
 */
export const MUTE_SYNC_POLL_INTERVAL_MS = 30_000;

/**
 * Delay before calling `MuteController.fetchMutedUsers` after a refresh trigger, so triggers that land together
 * (a return to the tab and `online`, a route and an auth change) make one LIST.
 * Fixed (not configurable via env); see `docs/environment.md`.
 */
export const MUTE_SYNC_DEBOUNCE_MS = 500;
