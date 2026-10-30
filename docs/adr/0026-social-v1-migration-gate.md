# ADR 0026: Social v1 Migration Gate

## Status

Accepted — 2026-10-30, for the `pubky-social-specs` 1.x port (`docs/migrations/social-v1.md`).

## Context

`pubky-social-migrator` copies a user's 0.x tree (`/pub/pubky.app/`) to the 1.x layout and writes the done flag
`/priv/social/v1/_migrated.json` last. Once the app reads and writes only the 1.x trees, an account whose tree is not
copied yet must not run the app: every local-first read would be empty, every write would land beside data the user
still sees in 0.x, and a grant minted by an earlier build lacks the `/pub/social/v1/`, `/priv/social/v1/` and
`/priv/app.pubky/v1/` scopes the 1.x writes need. The product decisions behind the port (D2, D11) say: an un-migrated
user is signed out, told why, signs in again with the new scopes and migrates in a blocking screen; the session enters
the auth store only after that; a grant minted by the new build resumes an interrupted run instead of being signed
out again; browser-key accounts that never backed up get the existing backup prompt first; nothing new ships with it.

The first wiring draft ran the migrator as a background coordinator after `restoreStatus === 'ready'`. By then
`bootstrapProfile` has read and written the homeserver, every `useLocalFirstQuery` hook, every coordinator keyed on
`session !== null` and every `useRequireAuth` write is live, and `HomeserverService.resolveOwnedSessionPath` serves any
caller holding the session whatever the status. A gate placed there cannot block anything.

## Decision

**The gate runs inside `AuthController`, before the session object enters the auth store.** On both paths that reach
`ready`, `restorePersistedSession` (after account preparation) and `completeAuthenticatedSession` (after the
persisted record is committed, before account preparation), the controller calls
`SocialMigrationController.ensureMigrated({ session, generation, entry, isCurrent })` and places the session with
`setSession`/`init` only on `'passed'`. Meanwhile the store holds the committed identity (pubky, reference,
generation, so logout and the route guard see the right account) and `session: null`, so nothing can act as the
account: `resolveOwnedSessionPath`, `canActAsAccount`, `waitForSession`, `withActiveSession` and the coordinators keyed
on the session all see "not ready" without a new guard each. The service and the application therefore take the
session explicitly (`HomeserverService.migrateToSocialV1({ session, … })`, `getBytesIfExists(url, session)`), an
extension of the ADR-0004/0024 session-store read exception rather than a use of it.

**One restore status, one auth status, one route.** `SessionRestoreStatus` gains `'social-migration'`;
`useAuthStatus` maps it to `AuthStatus.NEEDS_SOCIAL_MIGRATION` with `isLoading: false`, so `RouteGuardProvider`
redirects to `/migration` before its public-route early returns: `/post/*`, `/profile*`, `/shop/*` and the core
explore routes are not reachable mid-gate; only `/migration`, `/logout` and the legal pages render. `useRequireAuth`
and `waitForSession` treat the status like `restoring` (never open sign-in over the gate), the sign-in dialog closes
when the status is set, `CoordinatorsManager` starts coordinators only while the status is not
`NEEDS_SOCIAL_MIGRATION`, the Shop bridge reports the account as `restoring`, and the Header shows only the logo on
`/migration` so no own-profile query mounts. The status is set only when the screen is needed: a migrated account with
a trusted local record passes with no store change and no request.

**Decision flow.** Scopes first: a session that does not cover `MIGRATION_CAPS` (a pre-port Ring grant) is signed out
(`missing-scopes`). On restore: the local record, trusted when it saw the flag at this build's transform revision or a
later one, passes without network; otherwise the flag is read with the explicit session (a 404 is absent; 401, 403 and
transport failures throw, so a refused flag never reads as a missing one), a current flag writes the record and passes,
and an absent or outdated flag either resumes the run for a grant this build admitted or signs the account out
(`pre-migration-grant`, D2). On a fresh sign-in the grant's session-store id is recorded as admitted and the engine
runs; its own HEAD finds a finished migration (`already_migrated`). A signup runs the engine inline on its empty tree
with no screen (the engine writes the flag; the app never hand-writes `_migrated.json`). An upgrade adoption
(`preserveContext`) consults the local record only and keeps its context when it passes.

**Outcome policy.** `done`/`already_migrated` record the flag revision locally and pass, through a summary screen
(Continue) only when the run skipped or dropped something. `incomplete` and `IO_ERROR` retry on their own
(`SOCIAL_MIGRATION_AUTO_RETRY_DELAYS_MS`, three times), then block on Retry; `AuthCoordinator` retries that reason on
foreground and network return under its cooldown. `QUOTA` blocks with `needBytes`; `PRIV_UNSUPPORTED`,
`UNSUPPORTED_EPOCH` and a thrown engine error block on Retry with Sign out beside it; `SESSION_EXPIRED` and
`CAPS_MISSING` sign the account out; `ABORTED` is our own cancel. A new generation, `isLoggingOut`,
`AuthController.logout` and `requireSessionReauthentication` cancel the run. The engine owns its transport retries
(429 backoff, three network retries, read-back before every cleanup delete); the app retries whole runs. This is the
one documented second retry policy beside `retryHomeserverWrite` (`docs/error-handling.md`).

**Cross-tab.** The Web Lock `pubky-social-migrator:<owner>` is taken waiting (`navigator.locks.request(name,
{ signal }, fn)`, never `ifAvailable`): a second tab shows "Another tab is updating your account" and, once the first
finishes, its own run reads the flag. Without `navigator.locks` the run is unlocked. A second device migrating
concurrently is accepted with the engine's semantics (create-only writes, read-back before delete).

**Persistence.** The record is `localStorage` `social-migration:<pubky>` `{ v: 1, migratedRev?, admittedGrantIds,
lastRun?, notice? }`, zod-validated, unreadable means untrusted, excluded from the logout sweep like
`auth-store-v3-migrated`. Not Dexie (account preparation, logout and a `DB_VERSION` bump clear it before the gate runs)
and not the homeserver (the flag there is the authority; the record exists to avoid asking and to avoid loading the
migrator chunk). `SOCIAL_MIGRATION_TRANSFORM_REV` mirrors the engine's `transformRev` under a contract test, because
the revision is only reachable through the 790 KB chunk. `lastRun` shows "Continuing from an earlier run"; `notice`
holds the counts of what a run left behind for the profile edit page to show once. A tab-scoped `sessionStorage` notice
explains the forced sign-out after the stores were reset. The migrator is loaded by a dynamic `import()` only when a
run starts, which keeps its chunk out of the main bundle and out of the service-worker precache.

**Screen.** `/migration` → `templates/Auth/SocialMigration` → `organisms/SocialMigrationProgress` over the ephemeral
`useSocialMigrationStore` (written by `SocialMigrationController` only, progress coalesced to phase changes plus one
write per `SOCIAL_MIGRATION_PROGRESS_THROTTLE_MS`). The reauth state reuses the `/logout` backup rule
(`useHasBackupAccount`, `AlertBackup`) and then calls `AuthController.logout()` once (Strict Mode included); after the
logout it offers Sign in. `useBeforeUnloadGuard` holds the tab while a run is in flight.

**Telemetry.** One `Err.server` (`SERVICE_UNAVAILABLE` for an unreachable or full homeserver, `UNKNOWN_ERROR`
otherwise) or `Err.auth(FORBIDDEN)` per (account, code) per page, operation `socialMigration`, counts only: the report's
`skipped`, `notes`, `droppedValues` and `current` name the user's files and never leave the browser.

## Consequences

### Positive ✅

- No un-migrated account can read or write as itself anywhere in the app, by construction rather than by guards.
- A migrated account costs nothing on restore: no request, no chunk, no status change.
- An interrupted run resumes after a reload or a tab close instead of looping through sign-out and sign-in.
- Every outcome the engine documents has one screen and one policy, tested over the real migrator.

### Negative ❌

- Every existing user is signed out once and signs in again; a never-backed-up browser key goes through the backup
  prompt first.
- The sign-in paths place the session later than before: a bootstrap failure before the gate places it leaves no
  retained handle, so the retry runs the SDK exchange again (the gate runs before account preparation on sign-in so
  that a failed cleanup still retains the admitted session).
- The engine's transport retries plus the gate's run retries are two retry policies to reason about.

### Neutral ⚠️

- `restorePersistedSession` returns `false` on `reauth-required` with the status left at `social-migration`; the screen
  owns the outcome from there.
- The local record trusts a revision it saw; a bumped `transformRev` walks the tree again through the flag read.
- A second device still migrating while this one signs in passes on its own flag read once the first finishes.

## Alternatives Considered

### Background coordinator (the first draft)

**Description**: run the migrator once per session after `ready`, log the report.

**Why not chosen**: cannot block (see Context); `CAPS_MISSING` waits silently forever; `ifAvailable` gives the second
tab `ALREADY_RUNNING` with no way to learn when the first finished; nothing surfaces to the user or to Sentry.

### Upgrade in place through `SessionUpgradePanel`

**Description**: keep the pre-port grant, request the missing scopes with the Locks upgrade panel, migrate, continue.

**Why not chosen**: D2 decided logout then ordinary sign-in: a trimmed Ring approval already fails adoption, the panel
carries Locks copy, and the retained un-migrated session would sit in the store meanwhile.

### Gate after `init({ session })`

**Description**: place the session with `restoreStatus: 'restoring'` and gate before `ready`.

**Why not chosen**: `resolveOwnedSessionPath` serves the session whatever the status, `MuteListSyncCoordinator` starts
on `session !== null`, and a mounted dynamic public page can write in the redirect window.

### Fields on `useAuthStore` instead of a new store

**Why not chosen**: progress fires per object; Header, RouteGuard and every `useAuthStore` subscriber would re-render
thousands of times. `useSignInStore` and `useMigrationStore` are the precedent for an ephemeral side store.

## Implementation Notes

- `src/core/controllers/social-migration/social-migration.ts` (state machine, store, record, telemetry),
  `src/core/application/social-migration/social-migration.ts` (leaf: `readFlag`, `run`),
  `HomeserverService.migrateToSocialV1` and `getBytesIfExists(url, session)`,
  `src/libs/social-migration/{record,signed-out-notice,report-telemetry,summary}.ts`,
  `src/core/stores/socialMigration/*`, `src/config/social-migration.ts`.
- `src/app/(auth)/migration/page.tsx`, `templates/Auth/SocialMigration`, `organisms/SocialMigrationProgress`,
  `atoms/Progress` (Shadcn), `hooks/useBeforeUnloadGuard`.
- Tests run the real migrator over `memoryHomeserver` with `createTestWebLocks`; the service test is the canary for
  the wasm under vitest/jsdom. VRT suite `src/test/vrt/auth/SocialMigration.vrt.test.tsx` (CI-owned baselines).
- The dropped-values note on `/settings/edit` reads `record.notice` (its own PR).

## Related Decisions

- Extends: [ADR-0004](./0004-layering-and-dependency-rules.md) (explicit session instead of the store read at the
  migrator boundary), [ADR-0024](./0024-grant-authentication.md) (a new restore status; the session is placed after
  the gate).
- Depends on: ADR-0015 (error handling), ADR-0021 (service-worker policy; the migrator chunk stays out of the precache).

## References

- `docs/migrations/social-v1.md`, `node_modules/pubky-social-migrator/README.md`
- [pubky/pubky-app#2929](https://github.com/pubky/pubky-app/pull/2929) (the first wiring draft)
