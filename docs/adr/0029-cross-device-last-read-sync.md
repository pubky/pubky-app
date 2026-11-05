# ADR 0029: Cross-Device Notification `last_read` Sync

## Status

Proposed — 2026-10-30

Updated — 2026-11-05 (one shared homeserver event stream per tab, #3066)

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
filtered to the `last_read` path (`NOTIFICATION_LAST_READ_HOMESERVER_EVENTS_PATH_PREFIX`). It does not open a stream
of its own: it is a channel of the tab's one shared stream (see _One stream per tab_ below). After a debounced event it
calls `NotificationController.fetchLastReadFromHomeserver`, which:

1. Reads the published file past the browser HTTP cache (`HomeserverService.getFreshJson`). The homeserver sends
   `Last-Modified` without `max-age`, so a plain GET can return a stale copy and miss the change the event announced.
2. Applies the remote value **only when it is newer** than the local `lastRead`. The read boundary only moves
   forward; an older or equal value is ignored, as is a missing file or one without a finite timestamp.
3. Counts unread against the new boundary **before** touching the store, then checks again that the remote value
   is still newer and that the viewer did not change. A local mark-as-read that lands during the count is never
   rolled back, and a sign-out or account switch during the read drops the result.

The same read runs on every stream connection, after the stream is open and before its first event
(`reconcileOnConnect`, a channel hook that is a no-op for the mute list). The persisted `lastRead` is shared by
every tab, so another tab can write back an older snapshot after this one acknowledged a newer event; a stream
resumed from the stored cursor would never replay that event. Reading the file on connect repairs it, and opening
the stream first means a change after the read still arrives as an event.

The notification stream waits until session restoration is ready and `needsAccountSync` is false. A public page
can remain mounted while an incoming account is still bootstrapping, even when its persisted `hasProfile` is true.
Starting the stream earlier would let bootstrap replace a freshly reconciled boundary with an older cached one.
The readiness transition starts the stream and its fresh read after bootstrap has applied the account's snapshot;
returning to account synchronization pauses it. The mute stream keeps its existing authentication gate.

The boundary belongs to one account. `markAllAsRead` drops its result when the account or its session changed
during the write, so a sign-out or account switch cannot leave the previous account's timestamp in the store for
the next account's bootstrap to keep.

Stream gating (signed in with a profile, not on auth/onboarding routes, paused while the tab is hidden when the
runtime visibility flag is set), reconnect backoff and the one-shot outage report
(`homeserverEventStreamExhausted`) come from the shared stream. The per-user `sessionStorage` cursor is
cleared on logout and on an account switch, next to the mute-sync cursor.

The path is one constant so the social v1 port, which moves the file, changes one line.

### One stream per tab (#3066)

The first version gave this coordinator its own stream next to the mute list's, so every visible signed-in tab held
two long-lived `/events-stream` requests. The homeserver speaks HTTP/1.1, where Chrome allows six connections per
host for the whole browser profile, and these streams sit in the uncredentialed pool that CORS preflights use. Three
visible tabs filled it, and every homeserver write then waited on its preflight until a tab closed.

`HomeserverEventStreamCoordinator` (`src/core/coordinators/homeserver-event-stream/`) now holds the tab's only
homeserver event stream. `EventStreamSyncCoordinator` is a channel of it: `start()` registers the channel's path,
`stop()` removes it. The coordinator subscribes once to the union of the ready channels' paths (the SDK's
`path()` is repeatable and the homeserver returns the union of `path=` filters), hands every event to every channel,
and each channel acts on events under its own path:

- **Resume.** The stream resumes from the earliest channel cursor, so no channel misses an event; a channel skips
  replayed events at or before its own cursor. An event on another channel's path moves a channel's cursor forward
  when none of its own refreshes is pending, so the cursors stay close and the replay stays short. Cursors are
  decimal event ids; any channel without a cursor, or cursors that cannot be ordered, replays from the start.
- **Readiness.** A channel joins the path set only while its readiness gate passes (this one waits for a ready,
  synced session, the mute list does not). A change in the set reconnects the stream once.
- **One connection at a time.** A new connection waits until the previous loop has exited. A subscribe still in
  flight at sign-out or an account switch is cancelled when it resolves, never stacked under the next session's.
- **Teardown.** Each connection owns an `AbortController`. The SDK's `subscribe()` takes no signal, so
  `HomeserverService.subscribeUserEventStream` cancels the SDK stream when the signal aborts, also for a stream
  that resolves after the abort; cancelling it drops the response and aborts the fetch. Every teardown (sign-out,
  account switch, auth route, hidden tab, `stop()`) aborts the controller and cancels the open reader.
- **Reporting.** One failure streak and one outage report per stream: `homeserverEventStreamExhausted`, with the
  stream's paths in its context. The routine connect failures it follows stay dropped by
  `homeserver-event-stream-connect`.

A new homeserver-synced path adds a channel, not a connection.

## Consequences

- ✅ A read on one device clears the badge on every open session within about a second, with no extra polling.
- ✅ The read boundary is monotonic: concurrent marks, out-of-order events and replays cannot move it backward.
- ✅ One long-lived SSE connection per visible signed-in tab, shared with the mute list, as before this ADR.
- ⚠️ One `last_read` read per connection (sign-in, reload, each return to a hidden tab, each reconnect), and one
  reconnect of the shared stream when the session becomes ready after the mute list already connected.
- ⚠️ Every visible signed-in tab still holds one connection to the homeserver. With six or more of them on one
  HTTP/1.1 homeserver, preflights can starve again, the same limit as before this ADR. Electing one tab to hold the
  stream (Web Locks, `BroadcastChannel`) or serving the homeserver over HTTP/2 would lift it.
- ⚠️ A `last_read` read that fails on connect fails the shared connection, so the mute stream reconnects with it.
- ⚠️ `getFreshJson` reads without the session. That holds for the public file today; a private `last_read` needs an
  authenticated fresh read when it moves.

## Alternatives Considered

- **Read `last_read` on every notification poll.** About 100 lines, but up to one poll interval of lag and one extra
  homeserver read per poll per tab, even when nothing changed.
- **A copy of the mute-list loop** (the first attempt at #1595). Rejected for the ~450 duplicated lines that
  `EventStreamSyncCoordinator` now holds once.
- **One stream per coordinator** (the first version of this ADR). Replaced for #3066: two streams per tab let
  three tabs exhaust the browser's HTTP/1.1 connections to the homeserver.
- **One tab holds the stream for all tabs** (Web Locks leader, events relayed over `BroadcastChannel`). Lifts the
  per-tab cost entirely, but adds a cross-tab protocol: hand-over when the leader closes or hides, and a reconcile
  read in every follower that rejoins. Left for later; the shared stream restores the pre-ADR connection count.
- **HTTP/2 on the homeserver.** Removes the six-connection limit for every client; a deployment change outside
  this app.

## Related Decisions

- [ADR-0008: Coordinators Layer](./0008-coordinators-layer.md) — `EventStreamSyncCoordinator`,
  `HomeserverEventStreamCoordinator`
- [ADR-0010: Notification Application Orchestration](./0010-notification-application-orchestration.md)
- [ADR-0014: Muting System](./0014-muting-system.md) — the first homeserver-stream coordinator
