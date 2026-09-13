# ADR 0019: Local-First Tag Cache and Viewport Lifetimes

## Status

Proposed — 2026-09-07

Supersedes [ADR 0012](0012-ttl-coordinator.md) on subscription ownership across navigation, author tracking, and authentication. Extends [ADR 0005](0005-ttl-refresh-policy.md) with independent tag freshness.

## Context

Bootstrap and batch responses include tag previews. Fetching the first tag page on each card mount repeats that data even when the cache is fresh. The cache must also support public profiles, expanded lists, and optimistic edits: an empty result differs from an unloaded collection, a preview is not a complete list, and a delayed response may predate a local change.

The original TTL design predates public post/profile viewing and required authentication. Signed-out visitors could load these pages, but received no periodic TTL refresh. Maintaining cached tags across navigation therefore also requires background refresh for public views.

## Decision

- **Local reads, explicit loading.** Hooks observe IndexedDB. The tag cache application initializes missing data and revalidates viewer-specific relationships. An initialized empty collection is a cache hit. Persist initialization, server cursor, exhaustion, freshness, revision, and viewer with the tags.
- **Preserve the loaded list.** Local edits do not advance the server cursor. A shorter batch preview cannot replace an expanded list. Refresh replaces the loaded server portion atomically so deleted labels disappear, while temporary local mutation intent protects optimistic edits. Revisions and operation identities prevent stale responses or rollbacks from overwriting newer data.
- **Refresh by age or notification.** The existing TTL coordinator tracks tag freshness separately from post/profile freshness. Failed tag requests retain visible data and retry after a cooldown without repeating successful entity batches. Tag notifications trigger targeted refresh unless the cached list is already known to be newer than the event. A complete accepted batch preview needs no additional tag request.
- **Visibility owns subscriptions.** Components hold reference-counted post/user subscriptions while visible, including across route changes. Each tracked post also holds a reference to its author. The manager owns the coordinator's start/stop lifetime. Account changes clear queued session work; session guards reject old responses. Public data can refresh without authentication, and ticking pauses while the browser page is hidden.

The loading and persistence rules are described in [Local-First Patterns](../local-first.md#tag-previews-pagination-and-freshness).

## Consequences

- Revisiting initialized tags for the same viewer does not itself trigger a tag request. Visible data is refreshed through TTL or notifications, rather than guaranteed fresh on every navigation.
- Expanded lists require more data to refresh than previews. Visible public pages can now produce background refresh traffic while logged out.
- Subscription cleanup must match ownership: a missing cleanup can keep an offscreen entity subscribed. Refresh and pagination also require concurrency guards and bounded retries.
- Optional metadata allows existing IndexedDB records to remain readable without a database reset.

## Alternatives

- Fetch on every mount: simpler freshness policy, but repeats cached data.
- Keep only tag arrays: cannot distinguish unloaded data from an empty response or preserve server pagination across local edits.
- Clear all TTL subscriptions on navigation/logout: simple global cleanup, but loses subscriptions owned by components that remain mounted and leaves public views without background refresh.
