# ADR 0026: Social v1 Migration Gate

## Status

Accepted — 2026-10-30, for the `pubky-social-specs` 1.x port (`docs/migrations/social-v1.md`).  
Updated — 2026-11-11 (outcome policy and telemetry brought in line with the controller and `report-telemetry.ts`)  
Updated — 2026-11-12 (the restore's flag read bounded by `HOMESERVER_SYNC_READ_TIMEOUT_MS`; a timeout ends in `temporary-error`)  
Updated — 2026-11-13 (the signed-out explanation is route-independent while its notice is pending; the cut-over worker reloads a tab to its creation URL, see _Amendment_)  
Updated — 2026-11-13 (the worker no longer reloads the new build's own pages, ADR-0021 amendment; the double boot and option (i) re-scoped, see _Consequences_ of the _Amendment_)

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
explore routes are not reachable mid-gate; only `/migration`, `/logout` and the legal pages render. A sign-in started
from the Shop keeps its return through that detour: the guard carries the `/sign-in` query to `/migration` and, once the
account is ready there, sends it to the validated Shop wrapper as it would from `/sign-in`. The same holds
before the gate decides: while an account without a trusted local record restores with no session in the store (the
exchange, account preparation and flag read of a second tab, say), the route guard renders only those routes, so no
page mounts before the account is sent to `/migration` or passed (a retry out of `temporary-error` keeps the pages
the failed restore already showed without a session). `useRequireAuth`
and `waitForSession` treat the status like `restoring` (never open sign-in over the gate), the sign-in dialog closes
when the status is set, `CoordinatorsManager` starts coordinators only while the status is not
`NEEDS_SOCIAL_MIGRATION`, the Shop bridge reports the account as `restoring`, and the Header shows only the logo on
`/migration` so no own-profile query mounts. The status is set only when the screen is needed: a migrated account with
a trusted local record passes with no store change and no request.

**Decision flow.** Scopes first: a session that does not cover `MIGRATION_CAPS` (a pre-port Ring grant) is signed out
(`missing-scopes`). On restore: the local record, trusted when it saw the flag at this build's transform revision or a
later one, passes without network; otherwise the flag is read with the explicit session (a 404 is absent; 401, 403 and
transport failures throw, so a refused flag never reads as a missing one), a current flag writes the record and passes,
and an absent or outdated flag resumes the run when this browser's record saw the flag at an earlier revision or
admitted the grant, and otherwise signs the account out (`pre-migration-grant`, D2). On a fresh sign-in the grant's
session-store id is recorded as admitted and the engine runs; its own HEAD finds a finished migration
(`already_migrated`). A signup runs the engine inline on its empty tree with no screen (the engine writes the flag; the
app never hand-writes `_migrated.json`). An upgrade adoption (`preserveContext`) consults the local record only, and
keeps its context when it passes and admits its grant.

**Outcome policy.** `done`/`already_migrated` record the flag revision locally and pass, through a summary screen
(Continue) only when the last run skipped something or any run of the gate dropped a profile value. `incomplete` and
`IO_ERROR` retry on their own (`SOCIAL_MIGRATION_AUTO_RETRY_DELAYS_MS`, three times), then block on Retry, and the
controller treats `ALREADY_RUNNING` the same way defensively (the engine reports it only for a lock adapter that yields
when another holder exists; the app's adapter waits, see _Cross-tab_, so the code does not arise there);
`AuthCoordinator` retries that reason on foreground and network return under its cooldown. `QUOTA` blocks with
`needBytes`; `PRIV_UNSUPPORTED`, `UNSUPPORTED_EPOCH` and a thrown engine error block on Retry with Sign out beside it,
except a rejected load of the migrator's chunk, which `HomeserverService.migrateToSocialV1` throws as a network failure:
it blocks at once as `incomplete` (no automatic retries), so Retry and the reconnect retry apply, and is reported once
per account and page; `SESSION_EXPIRED` and `CAPS_MISSING` sign the account out; `ABORTED` is our own cancel. A new
generation, `isLoggingOut`, `AuthController.logout` and `requireSessionReauthentication` cancel the run. The engine owns
its transport retries (429 backoff, three network retries, read-back before every cleanup delete); the app retries whole
runs. Those are the one set of homeserver retries that `retryHomeserverWrite` does not run;
`HomeserverService.deleteIdempotent` and `ProfileApplication.deleteFile` are attempt loops over single-attempt
`HomeserverService.delete` calls, not a policy of their own (`docs/error-handling.md`).

**Cross-tab.** The Web Lock `pubky-social-migrator:<owner>` is taken waiting (`navigator.locks.request(name,
{ signal }, fn)`, never `ifAvailable`): a second tab shows "Another tab is updating your account" and, once the first
finishes, its own run reads the flag. Without `navigator.locks` the run is unlocked. A second device migrating
concurrently is accepted with the engine's semantics (create-only writes, read-back before delete).

**Persistence.** The record is `localStorage` `social-migration:<pubky>` `{ v: 1, migratedRev?, admittedGrantIds,
lastRun?, droppedProfile?, notice? }`, zod-validated, unreadable means untrusted, excluded from the logout sweep like
`auth-store-v3-migrated`. Not Dexie (account preparation, logout and a `DB_VERSION` bump clear it before the gate runs)
and not the homeserver (the flag there is the authority; the record exists to avoid asking and to avoid loading the
migrator chunk). `SOCIAL_MIGRATION_TRANSFORM_REV` mirrors the engine's `transformRev` under a contract test, because the
revision is only reachable through the 790 KB chunk. `lastRun` shows "Continuing from an earlier run"; `notice` holds
the counts of what a run left behind for the profile edit page to show once. `droppedProfile` keeps the counts of the
profile values a run dropped across the runs of a gate, reloads and re-sign-ins included, until the run that records the
flag merges them into `notice`: a resumed walk finds the 1.x profile present and does not report them again. Recording
the flag clears them, also when a restore passes on the flag of a run that finished elsewhere. A tab-scoped
`sessionStorage` notice explains the forced sign-out after the stores were reset; while it is pending, the explanation
is owed on every route (see _Amendment — the explanation is route-independent_). The migrator is loaded by a dynamic
`import()` only when a run starts, which keeps its chunk out of the main bundle and out of the service-worker precache.

**Screen.** `/migration` → `templates/Auth/SocialMigration` → `organisms/SocialMigrationProgress` over the ephemeral
`useSocialMigrationStore` (written by `SocialMigrationController` only, progress coalesced to phase changes plus one
write per `SOCIAL_MIGRATION_PROGRESS_THROTTLE_MS`; a run's terminal `incomplete`/`paused`/`aborted` event is not
written, so the screen keeps the step that stopped while the gate waits to retry). The reauth state reuses the `/logout`
backup rule (`useHasBackupAccount`, `AlertBackup`) and then calls `AuthController.logout()` once (Strict Mode included);
after the logout it offers Sign in. `useBeforeUnloadGuard` holds the tab while a run is in flight.

**Telemetry.** One capture per (account, code) per page, operation `socialMigration`
(`src/libs/social-migration/report-telemetry.ts`): a blocked run is `Err.server` with `SERVICE_UNAVAILABLE` for
`incomplete`, `IO_ERROR`, `QUOTA` and `PRIV_UNSUPPORTED` (the homeserver is unreachable, full or does not serve the
private root) and `UNKNOWN_ERROR` for any other code; a thrown engine error is `Err.server(UNKNOWN_ERROR)`, described
by `errorName`, `kind` and `status` only; `CAPS_MISSING` is `Err.auth(FORBIDDEN)`; a failed load of the migrator's chunk
is `Err.network(CONNECTION_FAILED)` (code `ENGINE_LOAD`, the import rejection as the cause; the service throws that
failure uncaptured so this guard decides the single capture). Counts only: the report's `skipped`, `notes`,
`droppedValues` and `current` name the user's files and never leave the browser (`docs/error-handling.md`). The
restore's flag read is the one gate step with a deadline: `awaitBounded` waits `HOMESERVER_SYNC_READ_TIMEOUT_MS` (30 s)
for the GET, which the SDK cannot cancel, then rejects with `Err.timeout(REQUEST_TIMEOUT)` (operation
`readMigrationFlag`, context the pubky and the bound only), and `AuthController` ends the restore in `temporary-error`
(`/migration` shows Retry; the focus and network-return retries apply); the engine run, its Web Lock wait and the flag
write are not bounded.

## Amendment — the explanation is route-independent while its notice is pending (2026-11-13)

The forced sign-out (D2) writes its reason to the tab-scoped `sessionStorage` notice and `/migration` reads it after
the logout reset every store. Until this amendment only that page read it: a signed-out tab on any other route was an
ordinary guest, and `UNAUTHENTICATED_ROUTES` lets a guest sit on `/home` (explore mode) and `/` (the landing page).
That lost the explanation on the cut-over itself. Every open or reload after the deploy boots the new build twice:
the navigation is served while the old worker still controls the page, so the new build boots, runs the gate and signs
the account out on `/migration`; seconds later the new worker installs, activates and runs the takeover of the
ADR-0021 amendment, `client.navigate(client.url)`, and a `WindowClient.url` is the document's **creation URL**
(the URL the tab was opened or reloaded at, `/home` for a user reloading their feed), not the route the gate's
`pushState` moved it to. The second boot has no session and nothing routed it back to the explanation, so the user
saw the guest home or the landing page instead (the maintainer's manual pass, 2026-11-13; reproduced with Playwright
on a production build, `qa/restore-reauth-bounce/`). QA-4 Part C had triggered the takeover from the old page with
`registration.update()`, a single boot after the worker's navigation, which is why it passed.

**Decision.** While the notice is pending, a signed-out tab owes the explanation on every route: `RouteGuardProvider`
sends a settled `UNAUTHENTICATED` tab whose notice is set to `/migration` from every route but
`SOCIAL_MIGRATION_SIGNED_OUT_ROUTES` (`src/app/routes.ts`: the gate's own routes `/migration`, `/logout` and the legal
pages, plus `/sign-in`, the way out; the legal pages are listed to mirror the gate's set, since they and `/copyright`
render outside the guard, `AppShell`), the public and dynamic public routes included (the check runs before their early
returns, like the gate redirect). A retained account whose restore failed (`reauth-required`, `temporary-error`) counts
as signed out here too: `/migration` shows the notice's reason on its failed-restore screen already. The redirect is
`router.replace`: the user never chose the route the worker reloaded the tab onto, and a `push` would leave a Back
entry that only redirects again. The notice is read with `useSyncExternalStore` on every render (`false` on the server
and while React hydrates, the `useIsHydrated` pattern), so the decision is never a render stale: an effect-backed state
was one render behind and sent the Homepage click straight back, and a plain render-time read is a call the React
Compiler memoizes. Every way out of the explanation settles the notice: Sign in cleared it already; Homepage clears it
now before it navigates to `/`, on the signed-out and the failed-restore screens; and the header logo, which links to
`/` from `/migration`, clears it for a signed-out tab (`Header`, keyed on the auth status). The held account's
failed-sign-out screen and its logo keep it: the guard sends that tab back to the gate anyway, and the sign-out that
follows its Retry still owes the reason. A signed-in account owes nothing: the guard clears a notice it still finds
while the status is `AUTHENTICATED`, because the notice survives when another tab of the profile signs in (the session
syncs across and the gate passes on the local record or the flag, with no engine run to clear it) and would otherwise
send a later voluntary logout to the explanation with the wrong reason; the status is never `AUTHENTICATED` between the
notice's write and the forced sign-out, so the gate's own notice is never dropped by it. A held account is the gate's
own business. The notice stays in `sessionStorage` (tab-scoped), `src/sw.ts` and the controller's reauth path are
unchanged.

**Consequences.** The explanation survives the takeover reload and a user reload at any route. A tab that was opened on
`/home` and reloaded by the worker loses its in-app place (the known item recorded in `docs/migrations/social-v1.md`).
Since 2026-11-13 (FIX-FINAL-8, ADR-0021 amendment) the worker leaves a page that announced itself in place, so the
double boot above and the lost place apply to a 0.x tab and to an announce that lost the race to `matchAll`; the
route-independent explanation stays for those. Of the two options
surfaced for the maintainer, (i) the worker asking the page to `location.reload()` via `postMessage` is superseded by
that handshake for the new build's pages (they are not reloaded at all); (ii) the notice in `localStorage`, so every
tab of the profile explains the sign-out (today other tabs are signed out by the shared auth store without an
explanation), is not done.

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
- A homeserver that does not serve `/priv/` is not reachable with grant-only auth (grant sign-in shipped with `/priv/`),
  so the gate does not classify its 403 by message (that would be a third boundary exception): a restore's flag read
  treats that 403 as an error and settles on `temporary-error`, and the engine's `homeserver-unsupported` block shows
  only on the run that hit it.
- A restore whose SDK exchange settles after the 12 s UI deadline (`temporary-error`, pubky/pubky-app#3126) re-enters
  `restorePersistedSession` on its own, so the late session still passes `ensureMigrated` before `init` and a gate
  sign-out still ends as `social-migration`; nothing places a late session directly.

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
