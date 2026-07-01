# ADR 0017: Cross-Device last_read Sync for Notifications

## Status

Accepted — 2026-06-06

## Context

Notification read state is stored on the homeserver at `pubky://<pubky>/pub/pubky.app/last_read`
as a single `{ timestamp }` scalar. The unread badge is derived locally by counting notifications
newer than this `lastRead` value.

A device **writes** `last_read` whenever the user opens the notifications page
(`NotificationsContainer` calls `markAllAsRead`, which PUTs the current timestamp). But a device only
**read** `last_read` from the homeserver **once, at bootstrap** — there was no re-sync mechanism
afterward.

The problem (issue [#1595](https://github.com/pubky/pubky-app/issues/1595)): when the user opens the
notifications page on device A (PUT advances the remote `last_read`), device B's local `lastRead` stays
stale — it never re-reads — and keeps showing the same notifications as unread.

PR [#1787](https://github.com/pubky/pubky-app/pull/1787) had already solved the equivalent problem for
the mute list using a homeserver Server-Sent Events (SSE) subscription
(`MuteListSyncCoordinator`). `last_read` is the same class of problem — active sessions diverging from
homeserver truth — with two differences:

- `last_read` is a **single mutable file**, not a directory listing. Only its content changes, so the
  relevant SSE event is a `PUT` on that one path (a `DEL` is not an expected lifecycle).
- Reading that single file hit an **HTTP cache** that the directory-listing path did not (see
  Implementation Notes), so the naive re-fetch returned stale data.

## Decision

Add a `NotificationLastReadSyncCoordinator` that mirrors `MuteListSyncCoordinator`: it opens a
long-lived homeserver event-stream subscription scoped to the `/pub/pubky.app/last_read` path. On a
`PUT` event it debounces, then calls `NotificationController.refreshLastReadFromHomeserver`, which:

1. Fetches the live remote `last_read` value (bypassing the HTTP cache — see Implementation Notes).
2. Applies a **race guard**: if `remote <= local`, no-op (never moves `lastRead` backward).
3. Otherwise updates the store's `lastRead` and recomputes the preference-filtered unread count.

The coordinator reuses the established streaming-lifecycle policy: authenticated + has-profile gate,
disabled routes (`/onboarding`, sign-in, logout), page-visibility pausing, generation-guarded
reconnects, and per-user SSE cursor persistence in `sessionStorage` (cleared on sign-out).

Layer placement (per ADR-0004 / ADR-0008):

- **Coordinator** (entry point) → `NotificationController` only.
- **Controller**: `subscribeLastReadEventStream` (`subscribe*` = long-lived SDK stream) and
  `refreshLastReadFromHomeserver` (store access lives here).
- **Application**: `fetchLastReadFromHomeserver` (`fetch*` = network only) and
  `subscribeLastReadEventStream` (wraps the service).
- **Service**: reuses `HomeserverService.subscribeUserEventStreamForPath`, plus a new cache-bypassing
  read path (`request({ noCache: true })`).

## Consequences

### Positive ✅

- Read state syncs across active sessions in near real-time; the stale unread badge is resolved.
- Reuses the proven mute-sync lifecycle, so behavior is consistent and predictable.

### Negative ❌

- One additional always-open SSE channel per session (traffic is negligible — a single scalar).

### Neutral ⚠️

- Bootstrap's inline `last_read` GET is extracted into
  `NotificationApplication.fetchLastReadFromHomeserver`, exposing a small reusable surface.
- `lastRead`/`unread` can now change mid-session from a background SSE event (the intended feature),
  whereas previously only bootstrap and `markAllAsRead` mutated them. The race guard prevents regressions.
- A new cache-bypass read path (`noCache`) is added to `HomeserverService.request`.

## Alternatives Considered

### Alternative 1: Polling

**Description**: Add a periodic `last_read` GET to `NotificationCoordinator`.

**Why not chosen**: Worse latency, more GET traffic, and it breaks the ADR-0008 coordinator pattern
consistency that mute-sync established.

### Alternative 2: Abstract base coordinator now

**Description**: Extract a shared `SseSyncCoordinator<TEvent>` and migrate both mute and last_read onto
it before shipping.

**Why not chosen**: Only two instances exist today, they have already diverged (last_read adds a retry
cap that mute lacks), and migrating the shipped mute feature expands scope and risk. Deferred to a
dedicated refactor PR — the right abstraction is clearer with two concrete examples in hand. (See
ADR-0014's note; consistent with #1787 not abstracting either.)

## Implementation Notes

- Coordinator: `src/core/coordinators/notification-last-read-sync/notification-last-read-sync.ts`.
- Config: `src/config/notification-last-read-sync.ts` (debounce, exponential backoff base/ceiling,
  max retry attempts, cursor storage prefix).
- **HTTP cache fix**: the owned-session GET (`session.storage.get`) is served from the browser HTTP
  cache, so a value written by another device stayed invisible locally until the cache entry was
  invalidated (the homeserver returns `Cache-Control: private, must-revalidate` + ETag on single-file
  reads; the directory-listing endpoint used by mute returns no cache headers, which is why mute never
  hit this). The cross-device refresh therefore reads via `HomeserverService.request({ noCache: true })`,
  which routes to a `cache: 'no-store'` SDK fetch (`requestFreshJson`) instead of the cached owned-session
  read. Bootstrap's first read keeps the default cached path.
- **Retry bounds**: both the stream reconnect loop and the refresh retries are capped at
  `NOTIFICATION_LAST_READ_SYNC_MAX_RETRY_ATTEMPTS` with exponential backoff, preventing an unbounded
  loop (and the matching per-attempt Sentry capture at the service boundary) when the homeserver is
  persistently unreachable. A later state change (route/visibility/auth) restarts a fresh loop.
- **Error reporting**: failures are reported to Sentry once, at the service IO boundary
  (`HomeserverService → handleError → Err.* → captureAppError`). The coordinator only traces with
  `Logger.debug` to avoid duplicate Sentry issues.

## Related Decisions

- [ADR-0004: Layering and Dependency Rules](./0004-layering-and-dependency-rules.md)
- [ADR-0008: Coordinators Layer](./0008-coordinators-layer.md)
- [ADR-0010: Notification Application Orchestration](./0010-notification-application-orchestration.md) (no impact — no cross-application calls added)
- [ADR-0014: Muting System](./0014-muting-system.md) (sibling cross-device SSE sync pattern)
- [ADR-0015: Error Handling](./0015-error-handling.md)

## References

- [Issue #1595](https://github.com/pubky/pubky-app/issues/1595)
- [PR #1787 — mute list cross-device sync](https://github.com/pubky/pubky-app/pull/1787)

---

See [ADR Guidelines](../adr-guidelines.md) for when and how to write ADRs.
