# ADR 0029: Cross-Device Notification `last_read` Sync

## Status

Proposed — 2026-10-30

## Context

Marking notifications as read writes the `last_read` timestamp to the user's homeserver, but an open session on
another device or tab only reads that file at bootstrap. Until it reloads, it keeps showing notifications the user
already read elsewhere (#1595). The poll that refreshes notifications from Nexus does not carry the read boundary:
`last_read` lives on the homeserver only.

The app already keeps one piece of homeserver state aligned across open sessions: the mute list, through
`MuteListSyncCoordinator` and the homeserver `/events-stream`. That loop now lives in the abstract
`EventStreamSyncCoordinator` (ADR-0008).

## Decision

`NotificationLastReadSyncCoordinator` extends `EventStreamSyncCoordinator` and follows the owner's event stream
filtered to the `last_read` path (`NOTIFICATION_LAST_READ_HOMESERVER_EVENTS_PATH_PREFIX`). After a debounced event it
calls `NotificationController.fetchLastReadFromHomeserver`, which:

1. Reads the published file past the browser HTTP cache (`HomeserverService.getFreshJson`). The homeserver sends
   `Last-Modified` without `max-age`, so a plain GET can return a stale copy and miss the change the event announced.
2. Applies the remote value **only when it is newer** than the local `lastRead`. The read boundary only moves
   forward; an older or equal value is ignored, as is a missing file or one without a finite timestamp.
3. Counts unread against the new boundary **before** touching the store, then checks again that the remote value
   is still newer and that the viewer did not change. A local mark-as-read that lands during the count is never
   rolled back, and a sign-out or account switch during the read drops the result.

Stream gating (signed in with a profile, not on auth/onboarding routes, paused while the tab is hidden when the
runtime visibility flag is set), reconnect backoff and the one-shot outage report
(`notificationLastReadEventStreamExhausted`) come from the base class. The per-user `sessionStorage` cursor is
cleared on logout and on an account switch, next to the mute-sync cursor.

The path is one constant so the social v1 port, which moves the file, changes one line.

## Consequences

- ✅ A read on one device clears the badge on every open session within about a second, with no extra polling.
- ✅ The read boundary is monotonic: concurrent marks, out-of-order events and replays cannot move it backward.
- ⚠️ One more long-lived SSE connection per visible signed-in tab.
- ⚠️ `getFreshJson` reads without the session. That holds for the public file today; a private `last_read` needs an
  authenticated fresh read when it moves.

## Alternatives Considered

- **Read `last_read` on every notification poll.** About 100 lines, but up to one poll interval of lag and one extra
  homeserver read per poll per tab, even when nothing changed.
- **A copy of the mute-list loop** (the first attempt at #1595). Rejected for the ~450 duplicated lines that
  `EventStreamSyncCoordinator` now holds once.

## Related Decisions

- [ADR-0008: Coordinators Layer](./0008-coordinators-layer.md) — `EventStreamSyncCoordinator`
- [ADR-0010: Notification Application Orchestration](./0010-notification-application-orchestration.md)
- [ADR-0014: Muting System](./0014-muting-system.md) — the first homeserver-stream coordinator
