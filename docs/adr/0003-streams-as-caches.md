# ADR 0003: Streams as Caches

## Status

Accepted — 2025-10-26

## Context

User timelines, tag feeds, and post streams require fast reads, pagination, and resumable consumption. Fetching directly from nexus on every visit is too slow, and aligning remote pagination cursors with local UI state is fragile.

## Decision

Represent streams (posts, users, tags) as cached sequences in Dexie. Each stream entry tracks ordering metadata and server cursors so the application can resume, refresh, or reconcile incrementally without refetching the entire feed.

## Consequences

- ✅ Fast rendering and pagination by reading from local storage first.
- ✅ Supports reconnection/resume scenarios by persisting cursors and ordering metadata.
- ⚠️ Stream invalidation and TTL handling must be encoded consistently.
- ⚠️ Requires background refresh policies to keep caches from drifting too far from server state.

## Alternatives Considered

- **In-memory caches only** — Lost on refresh; no offline continuity.
