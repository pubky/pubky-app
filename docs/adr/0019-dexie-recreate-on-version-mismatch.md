# ADR 0019: Dexie Schema Changes Recreate the Local Database

## Status

Accepted — 2026-09-15  
Updated — 2026-10-30 (`DB_VERSION` 3 → 4 for the social v1 port; mixed-build tabs and the recreate loop-breaker)  
Updated — 2026-11-10 (the loop-breaker never fired: the unexpected-close path probes without `Dexie.exists()`; see _Amendment_)

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
- `AppDatabase.initialize({ allowRecreate })` guards the recreate against a tab running another build.
  The first mismatch in a page lifetime always recreates. A second one is refused with
  `Err.database(DatabaseErrorCode.VERSION_CONFLICT)` unless the caller allows it: `DatabaseProvider`
  passes `allowRecreate: true` on mount and from the user's retry, and `false` when it re-initializes
  after an unexpected close, which is how the other tab's recreate reaches this page. That path probes
  without `Dexie.exists()` and, once this page has recreated the database, treats a database that
  another connection's delete left missing or unreadable like another version (see _Amendment_).
- Local-only choices that the network cannot restore, today only the unblur flag, are accepted as
  lost by a recreate. Growing that set is a reason to revisit this ADR.

## Amendment — the loop-breaker's probe (2026-11-10)

**What was wrong.** The 2026-10-30 loop-breaker checked `recreatedThisPageLifetime` on the mismatch branch
only, and `runInitialize()` reached that branch only after `Dexie.exists()` reported the database. The
unexpected close that starts the check is the other tab's `deleteDatabase`, and the provider re-initializes
from inside that event (Dexie's `versionchange` handler fires `close` synchronously), so the probe ran in the
other tab's delete→reopen window, found no database, and created it at this build's version without
consulting the flag. `Dexie.exists()` is not passive either: for a missing database it opens a v1 stub,
aborts and deletes it, and that delete closes the other tab's connection, which re-initializes it in turn.
Browser QA on production builds of `dev` and `feat/social-v1` (QA-4 finding F-2: Chromium 151 and Firefox 153,
8 of 8 runs) saw the two tabs close each other with 3 to 50 deletes in 0.03 to 0.85 s and never a
`VERSION_CONFLICT`. Every run ended when the old tab's `open()` lost a race to the new version and Dexie 4
answered the `VersionError` by reopening without a version, which left the old build running on the new
database.

**The rule now.** `initialize({ allowRecreate: false })` runs `runInitializeAfterClose()`:

- It never calls `Dexie.exists()`. It reads the version with `getExistingDbVersion()`: a versionless
  `indexedDB.open` that closes at once when the database exists and aborts its upgrade when it is missing,
  so nothing is created and nothing has to be deleted. A versionless open never upgrades an existing
  database, so it never fires `versionchange` at another connection. Start-up uses the same probe after its
  `Dexie.exists()` check.
- Dexie's own `versionchange` handler closes with auto-open still on, so any query on this page would reopen
  the database at this build's version. The path turns auto-open off before it probes (after Dexie's `close()`
  has returned, which would otherwise turn it back on); every successful branch opens explicitly.
- A missing database is usually the other tab between its delete and its reopen, so the probe looks again on
  the init retry backoff (`DB_INIT_MAX_ATTEMPTS` and `DB_INIT_RETRY_BASE_DELAY_MS`: at most three probes over
  750 ms). A tab of this build reopens it at the current version, which is then opened as usual; this is what
  happens when the forced worker reload (ADR-0021 amendment) reloads several tabs at once.
- Once this page has recreated the database, another version is the conflict, and so is a database that is
  still missing or unreadable when another connection's `versionchange` closed ours (an `AppDatabase`
  subscriber records it; Dexie runs the newest subscriber first, so it is set before Dexie's own handler closes
  the connection and the provider re-initializes). The database stays closed and `VERSION_CONFLICT` is thrown.
  Nothing is created or recreated.
- A forced close has no `versionchange` (storage eviction, which WebKit does under pressure, or cleared site
  data): no other tab is at work, so a database it lost is created again, as before this amendment. The same
  holds before this page's first recreate: a missing database is created and a mismatch is recreated once.
- A transient probe failure goes back to the `initialize()` retry loop, as on start-up. The
  `allowRecreate: true` paths (first load and Retry) are unchanged.

**Residual: the old build.** The fix ships in the new build only. It guarantees that a new-build tab stops
touching the database and shows "Close other Pubky tabs, then retry." while a tab of another build is active;
it cannot change that tab. A 0.x tab still recreates the database at its own version whenever it finds another
one, still probes with `Dexie.exists()`, and its Dexie 4.4.7 `open()` still falls back to the existing version
on a `VersionError`. It can therefore still end up on the new database, writing 0.x-shaped rows, when the new
build creates the database in the gap between the old tab's delete and reopen: on the new tab's first load, when
the user presses Retry with the old tab still open, or once when a new-build tab that started on the current
database meets the old tab's first recreate (the first mismatch in a page lifetime still recreates; refusing it on
the unexpected-close path too would remove this case and is left open). Rows written there stay, because the
database is at the current version and start-up does not recreate it. Closing the old tab, which is what the screen
asks, or the forced worker reload ends the exposure.

One opening on this page is not covered: `clearDatabase()` (`franky.helpers.ts`) opens the database explicitly when
it is closed, and an explicit `open()` ignores the auto-open switch. It runs from sign-out and account preparation; a
call already in flight at the moment of the conflict can still open the database at this build's version. Starting
either flow needs the app, which the conflict screen replaces.

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
- Two tabs of different builds in one browser profile would otherwise take turns: each recreate closes
  the other tab's connection (`versionchange` → Dexie `close`), whose provider re-initializes, finds the
  wrong version, and recreates again, wiping the database and re-running the resync in both tabs each
  round. The loop-breaker in _Decision_ stops the new build after one round; `DatabaseErrorScreen` then
  says "Close other Pubky tabs, then retry.", and in the social v1 release the forced worker reload
  (ADR-0021 amendment) brings the old tab onto the new build. A tab of a build without the breaker
  keeps recreating until it reloads, and can land on the new database (_Amendment_, residual).
- A bump that ships with a forced sign-out (the social v1 gate, ADR-0026) resyncs twice on the first
  load: the recreate sets `wasDbReset` before auth restore, and the bootstrap after the gate runs
  `MigrationController.resync` again. Accepted: both runs are reads of small lists.
- The default in `src/libs/env/env.ts` does not ship on its own: the Docker workflows
  (`release-docker.yml`, `build-docker-image.yml`) pass `NEXT_PUBLIC_DB_VERSION` as a build arg, so a
  bump is two PRs, the app change and a CI-task PR for those two lines, merged together.

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
  path, the transient-error cases that must not recreate the database, and the refused second recreate;
  its "Re-initialization after another tab closed the connection" suite runs the two-tab race on
  fake-indexeddb (another build reopening, a tab of this build reopening, the database staying missing
  while a query runs, a forced close) and asserts the absence of `Dexie.exists()`, of deletes and of
  versioned opens from this page.
  `src/providers/DatabaseProvider/DatabaseProvider.test.tsx` shows the conflict screen through the real
  `db` and its `close` handler.
- Loop-breaker: `InitializeOptions.allowRecreate`, `recreatedThisPageLifetime`, `runInitializeAfterClose`,
  `getExistingDbVersionAfterClose` and the passive `getExistingDbVersion` in `franky.ts`,
  `DatabaseErrorCode.VERSION_CONFLICT` in `src/libs/error/error.codes.ts`, the two `initDatabase` call
  sites in `src/providers/DatabaseProvider/DatabaseProvider.tsx`, and the `description` prop of
  `src/components/molecules/DatabaseErrorScreen/DatabaseErrorScreen.tsx`.
- Version history: 3 → 4 on 2026-10-30 for the social v1 port (feed enums become strings, file ids
  become `owner:hash`, post `uri` spellings change, bookmarks become locally owned). The index map did
  not change, so the recreate is the only way to guarantee that every client starts clean.

## Related Decisions

- Supersedes: [ADR-0007: Dexie Version Normalization](./0007-dexie-version-normalization.md)
- Related: [ADR-0003: Streams as Caches](./0003-streams-as-caches.md),
  [ADR-0005: TTL Refresh Policy](./0005-ttl-refresh-policy.md)
