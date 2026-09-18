# ADR 0019: Dexie Schema Changes Recreate the Local Database

## Status

Accepted — 2026-09-15

## Context

[ADR-0007](./0007-dexie-version-normalization.md) assumed normalized schema versions with migrations
registered in ascending order and validated by snapshot tests. The database layer that shipped in
`src/core/database/franky/franky.ts` never grew that migration chain: there is a single
`this.version(DB_VERSION).stores({...})` declaration and no `.upgrade()` call anywhere under `src/`.

That is deliberate, not unfinished. The local Dexie store is a cache
([ADR-0003](./0003-streams-as-caches.md), [ADR-0005](./0005-ttl-refresh-policy.md)): rows are
rebuilt from nexus reads and homeserver writes, and per-entity TTLs drive refreshes. One piece of
local state is not derived from the network: a user's explicit unblur choice is stored only as
`moderation.is_blurred = false` (`LocalModerationService.setUnBlur`, reached from
`ModerationController.unBlur`) and is never written to the homeserver. Everything else can be
refetched. The cost of that position is that a version mismatch
has to be resolved without a per-version upgrade path, and the app must never read a database whose
key or index map no longer matches the code.

The version probe has a failure mode of its own. Reading the stored version opens the database a
second time, and on WebKit/iOS that probe can abort transiently. Treating a transient abort as
"unknown version" would delete a healthy database, so the two cases have to be told apart.

## Decision

Local schema evolution is destructive and explicit.

- The schema is declared exactly once, as `this.version(DB_VERSION).stores({...})` in the
  `AppDatabase` constructor (`src/core/database/franky/franky.ts`). `DB_VERSION` is
  `Env.NEXT_PUBLIC_DB_VERSION` (`src/config/database.ts`); no other module declares a version.
- On startup `AppDatabase.initialize()` reads the stored version and compares it to `DB_VERSION`,
  normalizing Dexie's internal ×10 representation. On a mismatch, or when the stored version cannot
  be resolved at all, `runInitialize()` calls `recreateDatabase()`: close the database, run
  `indexedDB.deleteDatabase(name)`, reopen it with the current schema, and report
  `wasDbReset: true`.
- There is no incremental migration chain and no snapshot test of upgrade paths. Changing a table's
  key or index map is a reviewed change that ships with a `DB_VERSION` bump, never a side effect of
  another feature.
- A transient `indexedDB` failure while probing the version is re-thrown rather than treated as an
  unknown version, so the initialization retry loop can recover the connection. Only a genuinely
  unreadable version self-heals by recreating.
- Callers that care that the database was emptied read `wasDbReset`. `RouteGuardProvider` uses it to
  re-run `MigrationController.resync` and to hold routing until that resync finishes.
- Local-only choices that the network cannot restore, today only the unblur flag, are accepted as
  lost by a recreate. Growing that set is a reason to revisit this ADR.

## Consequences

### Positive ✅

- No migration code to write, review, or keep backward compatible, and no way for a schema change
  to leave a partially upgraded database behind.
- One code path for desktop, mobile and tests, so schema state cannot diverge between targets.
- Local data is treated as what it is: for everything except the unblur flag, losing it costs a
  refetch rather than user data.

### Negative ❌

- Every `DB_VERSION` bump discards the local database and forces a resync for each user, so a bump
  is a user-visible event rather than an internal detail.
- The recreate path is destructive, which makes the transient-error guard load-bearing: a false
  "version unknown" reading wipes data.
- Deletion only completes once other tabs and connections release the database; the delete request
  can sit `onblocked`, which the layer reports as a warning.
- Nothing checks that an index-map edit actually came with a version bump. The review has to.
- A recreate discards local-only user choices. An explicit unblur is not synced, so after a bump the
  item is moderated again and blurred: the next nexus persistence pass upserts the record with
  `is_blurred: true` (`ModerationModel.bulkSave` in `src/core/services/local/stream/{posts,users}`).

### Neutral ⚠️

- Every local-only choice that is not refetched (today: the unblur flag) works against this decision
  and would eventually force a migration path.

## Alternatives Considered

### Alternative 1: Ascending migrations with explicit upgrade paths (ADR-0007)

**Description**: Register every schema version with its own `.upgrade()` step and validate the chain
with snapshot tests.

**Pros**:

- Local data survives a version bump, so no resync cost.

**Cons**:

- A migration, and a test for it, for every schema change, plus support for every historical version
  that is still in the wild.
- The data being migrated is a cache that the next TTL refresh rebuilds anyway.

**Why not chosen**: The maintenance cost buys nothing the cache cannot rebuild.

### Alternative 2: Clear the affected tables instead of deleting the database

**Description**: Keep the database and delete only the tables whose schema changed.

**Pros**:

- Preserves unrelated tables and produces a smaller refetch.

**Cons**:

- Requires per-version knowledge of which tables changed, which is the migration map again, and it
  still permits a mixed-schema database.

**Why not chosen**: The same bookkeeping as migrations, with weaker guarantees.

### Alternative 3: Version the database name

**Description**: Leave the old database in place and open a new one named `<name>__<version>`.

**Pros**:

- Recreation becomes instant and cannot fail on a blocked delete.

**Cons**:

- Storage is leaked until the old database is deleted anyway, and the blocked-delete problem only
  moves to that cleanup.

**Why not chosen**: Deferred cleanup with no guarantee that it happens.

## Implementation Notes

- Schema and lifecycle: `src/core/database/franky/franky.ts` (`AppDatabase` constructor,
  `runInitialize`, `normalizeStoredVersion`, `recreateDatabase`, `initialize`).
- Version source: `src/config/database.ts` (`DB_VERSION = Env.NEXT_PUBLIC_DB_VERSION`).
- `wasDbReset` consumer: `src/providers/RouteGuardProvider/RouteGuardProvider.tsx`.
- Tests: `src/core/database/franky/franky.test.ts` covers the version mismatch, the unknown-version
  path, and the transient-error cases that must not recreate the database.

## Related Decisions

- Supersedes: [ADR-0007: Dexie Version Normalization](./0007-dexie-version-normalization.md)
- Related: [ADR-0003: Streams as Caches](./0003-streams-as-caches.md),
  [ADR-0005: TTL Refresh Policy](./0005-ttl-refresh-policy.md)
