# ADR 0001: Local-First Writes

## Status

Accepted — 2025-10-26
Updated v2 - 2025-12-15

## Context

User interactions must feel instantaneous even when network latency is high or connectivity is unreliable. Persisting writes directly to the homeserver blocks the UI on round-trip times and introduces brittle error handling paths for intermittent failures.

## Decision

Write operations commit to the local Dexie store first, updating UI-observable state immediately. A background synchronizer propagates mutations to the homeserver and reconciles server acknowledgements or conflicts.

### Controller Method Naming Pattern

Controller method names encode IO behavior and delivery guarantees:

- **Read operations**
  - **`fetch*`** — Nexus API reads (network only, no cache)
  - **`get*`** — IndexedDB reads (local cache only, no network)
  - **`getMany*`** — Bulk IndexedDB reads (returns `Map<Pubky, T>`)
  - **`getOrFetch*`** — IndexedDB first, fallback to Nexus API
  - **`getMany*OrFetch`** — Bulk IndexedDB first, fetch missing from Nexus (e.g., `getManyTagsOrFetch`)

- **Write operations**
  - **`commit[Create|Update|Delete]*`** — Local-first writes with homeserver sync

The `commit*` prefix indicates:

- Write to IndexedDB immediately (durable locally)
- Update UI immediately
- Sync to homeserver in background (async)

The suffix indicates the mutation shape:

- `Create` — Create new entity
- `Update` — Modify existing entity
- `Delete` — Remove entity

This naming pattern aligns controller APIs with the local-first write model defined in this ADR.

## Consequences

- ✅ Perceived responsiveness stays high; UI reflects the local intent instantly.
- ✅ Offline edits and intermittent connectivity are supported without special UI flows.
- ⚠️ Requires reconciliation logic for conflicts, retries, and TTL/expiry management.
- ⚠️ Local data can momentarily diverge from server truth until synchronization completes.

## Alternatives Considered

- **Server-first writes** — Simpler consistency but unacceptable latency and offline behaviour.
- **Optimistic server writes** — Still depends on network success before local state stabilizes.
