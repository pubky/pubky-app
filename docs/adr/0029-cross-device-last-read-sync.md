# ADR 0029: Cross-Device Notification `last_read` Sync

## Status

Proposed — 2026-10-30

Updated — 2026-11-05 (one shared homeserver event stream per tab, #3066)

Updated — 2026-11-09 (social v1: the private `last_read` is polled on the mute cadence while a private stream cannot be held, FIX-8)

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
`stop()` removes it. The coordinator subscribes once to the union of the ready channels' paths (the request
repeats `path=` and the homeserver returns the union of the filters), hands every event to every channel,
and each channel acts on events under its own path:

- **Resume.** The stream resumes from the earliest channel cursor, so no channel misses an event; a channel skips
  replayed events at or before its own cursor. An event on another channel's path moves a channel's cursor forward
  when none of its own refreshes is pending, so the cursors stay close and the replay stays short. Cursors are
  decimal event ids; any channel without a cursor, or cursors that cannot be ordered, replays from the start.
- **Readiness.** A channel joins the path set only while its readiness gate passes (this one waits for a ready,
  synced session, the mute list does not). A change in the set reconnects the stream once.
- **One connection at a time.** A new connection waits until the previous loop has exited. A subscribe still in
  flight at sign-out or an account switch is aborted, never stacked under the next session's.
- **Teardown.** Each connection owns an `AbortController`. SDK 0.17.1's `subscribe()` takes no signal and its WASM
  transport has no timeout, so a request waiting for response headers could hold the loop indefinitely.
  `HomeserverService.subscribeUserEventStream` therefore sends the SDK's anonymous `/events-stream` request itself,
  through `client.fetch` with the signal, and decodes the SSE body as the SDK does. Only the PKARR lookups before
  it cannot be aborted; they go to the relays, not the homeserver, under PKARR's per-request timeout. Every
  teardown (sign-out, account switch, auth route, hidden tab, `stop()`) aborts the controller, stops waiting for
  the connection-time `last_read` read (`NotificationController` still drops a stale result), and cancels the open
  reader. An SDK `subscribe({ signal })` would let the service return to the SDK's transport.
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
  authenticated fresh read when it moves. On the social v1 tree the read goes through the session, and the
  homeserver's `/priv/` cache policy keeps it fresh (see _Social v1 note_).

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

## Social v1 note (amended 2026-11-09)

On `feat/social-v1` the `last_read` file moves to the private `/priv/app.pubky/v1/last_read.json`. A private event
stream needs a session, which deadlocks the SDK's bearer refresh for as long as the stream stays open (ADR-0014,
pubky/pubky-homeserver#798), so `HomeserverService.subscribeUserEventStream` refuses `/priv/` paths and
`CoordinatorsManager` does not start `NotificationLastReadSyncCoordinator` there.

The sync is polled instead, on the mute list's cadence. `NotificationLastReadPollCoordinator`
(`src/core/coordinators/notification-last-read-poll/`) extends the polling `Coordinator` base exactly as
`MuteListSyncCoordinator` does and calls the same `NotificationController.fetchLastReadFromHomeserver` the channel
calls: on start, when the tab becomes visible, on `online`, and every `NOTIFICATION_LAST_READ_SYNC_POLL_INTERVAL_MS`
(`src/config/notification-last-read-sync.ts`, which reuses `MUTE_SYNC_POLL_INTERVAL_MS`, 30 s), with triggers that
land together debounced into one read (`NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS`), one read out at a time, a failed
read logged and retried at the next trigger. It keeps the mute coordinator's guards: signed in with a profile, not on
the auth or onboarding routes, paused while the tab is hidden under the runtime visibility flag, stopped on sign-out
and on an account switch, and started by `CoordinatorsManager` only once the social v1 migration gate has passed. The
read itself is unchanged: the boundary only moves forward and the recount runs before the store changes, so a poll
that lands during bootstrap is adopted by `AuthController` instead of being rolled back.

Consequences on this tree: a mark-as-read on another device reaches an open tab within about the poll interval,
not within a second; one `last_read` GET per visible signed-in tab every 30 s, next to the mute LIST, and no
long-lived homeserver connection. The channel class stays in the tree, unregistered, with no cursor to clear; when
the SDK releases the session lock for streams, register it and remove the poller.

No cache bypass is needed for the session read, and `markAllAsRead`'s read-check-write fence relies on it. The SDK
(`@synonymdev/pubky` 0.17.1) sends the session `storage.get` as a default-mode fetch: `pubky-sdk/src/actors/storage/verbs.rs`
(`get`) builds it through `core.rs` (`request` → `cross_request`, `send` attaches the bearer) and nothing in the SDK
sets a fetch `cache` mode; reqwest's wasm request leaves `cache` unset. Freshness comes from the homeserver:
`pubky-homeserver/src/client_server/cache_policy.rs`, layered on the tenant router, stamps every `/priv/` response
`Cache-Control: no-store` with `Vary: Authorization, Cookie` (v0.13.0 through v0.17.1; `private, no-cache` with an
`ETag` on a served or unchanged file from v0.18.0), so the browser never answers the read from its cache without
revalidating. The staging homeserver answers a `/priv/…/last_read.json` GET with `cache-control: no-store`.
