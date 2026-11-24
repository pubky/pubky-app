# ADR 0002: Composite Post IDs

## Status

Accepted — 2025-10-26  
Updated — 2026-11-10 (social v1: the data model is `pubky-social-specs`; `pubky-app-specs` and `PubkyAppPost` below are the 0.x names. A v1 post id is still the Crockford Base32 timestamp, now the directory of its versions, `posts/{id}/{editId}.json`, and the composite id is built from either spelling of a post reference and from a version path alike, so a 0.x and a v1 reference to one post share a key; ADR-0027)

## Context

Posts are replicated across streams, user feeds, and relational tables. According to `pubky-app-specs`, each `post_id` is produced client-side by Crockford Base32-encoding the post creation timestamp from the `PubkyAppPost` payload. On its own, that timestamp token is not globally unique: two authors can emit identical timestamp encodings (for example, when creating posts within the same millisecond), which makes reconciliation between Dexie tables fragile.

## Decision

Identify posts using the composite key `author:post_id`, where `author` is the author's Pubky and `post_id` is the timestamp token from `PubkyAppPost`. All tables reference posts through this composite identifier and share utilities for parsing/formatting the string while preserving the encoded timestamp for ordering.

## Consequences

- ✅ Unique across authors and stable for joins between Dexie tables.
- ✅ Simplifies cross-table lookups and prevents ID collisions after migrations or restores.
- ✅ Retains chronological ordering semantics encoded in the Crockford Base32 timestamp.
- ⚠️ Requires helper utilities to parse/format keys consistently.
- ⚠️ Slightly larger keys increase index size; mitigated by Dexie indexing strategy.
