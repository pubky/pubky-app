# Social v1 migration (`pubky-social-specs` 1.x)

**Status: release candidate** on the integration branch `feat/social-v1` (cut from `dev`; child PRs merge into it, one
final PR merges it into `dev`). The port is complete and verified: every slice, the QA-1 fixes, the Cypress port, the
Nexus `/v1` move (FIX-7) and the private-file polling (FIX-6, FIX-8) are merged, `pubky-app-specs` is gone from the
tree, the compliance ratchet is empty, QA-3 against the complete Nexus carrier found no app regression, QA-4 verified
the forced takeover and the database recreate on production builds in Chromium, Firefox and WebKit, the FIX-9
loop-breaker in Chromium and Firefox, and a 2,050-post migration, and QA-5 ran Locks before and after a migration
against a real Lock Server (_QA matrix_). What is left before the final PR is step 3 of
_Rollout order and release checklist_. The approved plan, its decisions D1–D19, the design documents and the QA reports
live outside the repository (`qa1-report.md`, `qa-3-results.md`, `qa-4-results.md`, `qa-5-results.md`); this file is
the in-repo record and is kept current by every child PR.

## Behavior

`pubky-app-specs` 0.8.1 (wasm, data under `/pub/pubky.app/`) is deprecated and no longer used by the app. `pubky-social-specs` 1.0.0-rc.1
(native TypeScript, `/pub/social/v1/` + `/priv/social/v1/`) replaces it, and `pubky-social-migrator` 1.0.0-rc.1
copies each user's 0.x tree to the 1.x layout and records the done flag `/priv/social/v1/_migrated.json`. When
the branch ships, the app reads and writes only the 1.x trees, every existing user is force-migrated through a
blocking, resumable screen, no un-migrated user can run the 1.x app, and every current feature survives except the
ones listed under _Reductions_. No new 1.x features ship in this round.

### Decisions (summary of D1–D19)

- **Branching and review (D1, D5):** one integration branch, every child PR given a full code review, a Greptile
  review and a `talosmachina` review; a security review on the foundation (capabilities), the gate and the
  rollout-guard PRs; `dev` merged in regularly through the dev-sync routine below; port and gate ship in one deploy.
- **Forced migration (D2, D11):** an un-migrated user is signed out (grant retired, Dexie cleared), told why, signs
  in again with the new scopes and migrates in a blocking `/migration` screen. The session enters the auth store
  only after the gate passes; a grant minted by the new build resumes an interrupted run instead of being logged out
  again. Browser-key accounts that never backed up get the existing backup prompt first.
- **Scope (D3, D4, D10):** no new features (drafts, slugs, alt text UI, item notes UI, published feeds, 1.1 kinds);
  the app never ships before Nexus is complete, with a retest list run in a final full-stack pass.
- **Media (D6):** no app-side media fallback; CDN rendering stays with the v1 hash as the file id.
- **Bookmarks (D7):** locally owned; the two Nexus-generated notifications that needed public bookmarks are removed.
- **Rollout guards (D8, D9):** `DB_VERSION` 3 → 4 with a loop-breaker (its unexpected-close probe reworked by FIX-9
  after QA-4 found it never fired; ADR-0019 amendment), and a forced service-worker reload on activation
  (`skipWaiting` plus claim-and-navigate). Its revert (PR-E2) is not tied to the next release: nobody can
  tell when the last 0.x tab is gone, so the forced policy stays until Nexus shows migrated users' 0.x writes at about
  zero or for a period the team picks; keeping it costs only the consented-update toast (ADR-0021 amendment).
- **Write path (D12):** `HomeserverService` is the only homeserver write path; `pubky-social-specs/client` is never
  imported outside `src/test-utils` (gate-tested). Reads are `list` + `getBytes` + `decodeObject`; writes
  `putBlob(built.body)` / `deleteIdempotent`.
- **Capabilities (D13):** `SOCIAL_V1_APP_CAPABILITIES = ['/pub/social/v1/:rw', '/priv/social/v1/:rw',
'/priv/app.pubky/v1/:rw']`, explicit, not inherited from the Locks `/priv/social/:rw` entry;
  `HOMESERVER_CAPABILITIES = [APP_CAPABILITIES, ...SOCIAL_V1_APP_CAPABILITIES, ...LOCKS_CAPABILITIES]`;
  `APP_CAPABILITIES = '/pub/pubky.app/:rw'` stays (0.x deletes, the migrator). Pinned in `src/config/auth.test.ts`.
- **Articles (D14):** the cover goes in the envelope `cover_image`; attachments hold inline media only; a reader
  rule handles app-written v1, migrated (off by one until the migrator fix) and legacy articles.
- **App files (D15):** settings and the notification cursor move to `/priv/app.pubky/v1/`, copied from the legacy
  files in the first bootstrap after the gate; legacy fallback reads stay as a safety net.
- **Kinds (D16):** the local vocabulary stays `short`/`long`; `toLocalPostKind` / `toStoredPostKind` in
  `src/core/pipes/post/post.kind.ts` are the one crossing to the stored `note`/`article`, which Nexus `/v1` also
  speaks: the Nexus services fold every response (see _Nexus API version_).
- **Bookmark order, summary screen, telemetry (D17):** bookmark order is bookmark time; the summary blocks on
  Continue only when something was skipped or dropped; dropped values show once on `/settings/edit`.
- **Naming (D18):** `SocialMigration*` in code (`Migration*` stays the DB-reset resync); route `/migration`; ADRs
  0026 (gate), 0027 (versioned edits and v1 data model), 0028 (private, locally owned bookmarks).
- **Config policy (D19):** accepted widenings, no visible reduction: article body cap = `articleBodyMaxLength`
  (body only, title has its own 100), collection item URI 200 → 1024, cover URL 200 → 300, the MIME table from
  the package minus `text/csv` (deferred, see follow-ups); `src/config/bookmarks.ts` retired with its mechanism;
  the mute SSE prefix was replaced by a poll of `/priv/social/v1/mutes/` (`MUTE_SYNC_POLL_INTERVAL_MS`, 30 s, a config
  addition; ADR-0014); new `src/config/social-migration.ts` and `src/config/app-files.ts`.

## Child PRs (into `feat/social-v1`)

| PR       | Scope                                                                                                                                                                                                                                                                              | Depends         | Gate                                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------- |
| PR-0     | `feat/tag_uri` (#2832) into `dev`: untag via Nexus `tag_uri`                                                                                                                                                                                                                       | Nexus           | targeted tests, code-review                                                   |
| **PR-A** | foundation: both packages beside the old one, `src/config/*`, kind crossing, reference spellings, `LastReadNormalizer.buildUrl`, `models.utils` v1 media helpers, `hasSocialV1Capabilities`, `ErrorService.SocialSpecs`, `getFreshBytes`, private SSE, test seam, gates, this file | PR-0            | targeted tests, code-review, security-review                                  |
| PR-B1    | posts, media, articles, collections, Locks; ADR-0027 + ADR-0023 amendment                                                                                                                                                                                                          | A               | targeted tests, code-review                                                   |
| PR-B2    | tags, follows, mutes; ADR-0014 amendment                                                                                                                                                                                                                                           | A               | targeted tests, code-review                                                   |
| PR-B3    | bookmarks (locally owned); ADR-0028                                                                                                                                                                                                                                                | A, C            | targeted tests, code-review                                                   |
| PR-B4    | feeds                                                                                                                                                                                                                                                                              | A               | targeted tests, code-review                                                   |
| PR-C     | profile, settings, last_read, bootstrap, notifications, account delete/export                                                                                                                                                                                                      | A               | targeted tests, code-review                                                   |
| PR-D     | migration gate and UI (`/migration`), `migrateToSocialV1`, auth controller wiring; ADR-0026 (accepted 2026-10-30, see _The migration gate_ below)                                                                                                                                  | A               | tests, code-review, security-review; migrator service test first              |
| PR-E     | rollout guards: service-worker reload, `DB_VERSION` 4 loop-breaker; ADR-0019/0021 amendments                                                                                                                                                                                       | —               | `npm test -- src/sw.test.ts src/core/database src/providers`, security-review |
| PR-CI    | `release-docker.yml`, `build-docker-image.yml`: `NEXT_PUBLIC_DB_VERSION=4`                                                                                                                                                                                                         | E               | CI task review                                                                |
| PR-D2    | dropped-values note on the profile edit page                                                                                                                                                                                                                                       | C, D            | tests, code-review                                                            |
| PR-F     | cleanup: remove `pubky-app-specs`, `pipes.builder.ts`, mocks, Turbopack alias, wasm suppressions; empty the ratchet                                                                                                                                                                | B1–B4, C, D, D2 | full `npm test`, `npm run build`                                              |
| PR-G     | docs and Greptile sweep                                                                                                                                                                                                                                                            | after F         | review                                                                        |
| Final    | `feat/social-v1` → `dev` after the full-stack retest and the maintainer's manual pass; PR-E2 (revert the SW policy) opened when the team decides (D9)                                                                                                                              | all             | code-review, security-review, Greptile, talosmachina                          |

File ownership: `homeserver.ts` is PR-A then PR-D only; `controllers/auth/auth.ts` PR-A (two one-liners) then
PR-D only; `src/config/*` PR-A only; the lockfile changes only in PR-A and PR-F. Each child session merges
`feat/social-v1` into its branch before opening the PR.

What landed, by PR number (every PR into `feat/social-v1` unless noted; each given a full code review, a Greptile
review and a `talosmachina` review, and merged with a merge commit once CI and both bots were green):

| PR                                | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #2986 (into `dev`)                | PR-0: untag via Nexus `tag_uri`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| #2987, #2988, #2989               | PR-A foundation; PR-E rollout guards; PR-CI `NEXT_PUBLIC_DB_VERSION=4`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| #2990, #2991, #2992, #2994, #2995 | PR-C profile and app files; PR-D migration gate; PR-B1 posts, media, articles, collections, Locks; PR-B4 feeds; PR-B2 tags, follows, mutes                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| #3008, #3009, #3010, #3011        | attachment MIME parity (`text/csv` deferred); PR-D2 dropped-values note; dev-sync 1; PR-B3 bookmarks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| #3012, #3013, #3014, #3015, #3016 | QA-1 fixes: gate UX polish, small fixes (BUG-1, BUG-3), media GC (BUG-2), PR-F cleanup, VRT fixtures                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| #3051, #3054, #3055               | dev-sync 2; FIX-5 Nexus file contract (`/v1/static`, metadata from the URI, signup order A7); the Cypress port                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| #3062                             | FIX-6: the mute list polled instead of a session-bound event stream                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| #3084, #3087, #3089, #3090        | dev-sync 3; FIX-8 `last_read` polled; branch e2e against pubky-stack `social-v1`; FIX-7 every Nexus call on `/v1`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| #3091                             | dev-sync 4 (`dev` @ `c5135dfb0`, merged 2026-11-10 as `cdd2e6ffa`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| #3092, #3093, #3094               | PR-G docs and Greptile sweep; the Cypress suite kept QA-owned in the contributor rules; e2e follow-up: v1 media bytes on the `/v1/static/files/` route and collection items from the stream, on the complete Nexus                                                                                                                                                                                                                                                                                                                                                                                                       |
| #3110, #3111, #3112               | pre-rc.2 cleanup (rule B image-only, post-#798 wording); e2e: a migration interrupted by a reload and one the homeserver stops answering, and the delete race window; FIX-9 mixed-build loop-breaker (ADR-0019 amendment)                                                                                                                                                                                                                                                                                                                                                                                                |
| #3113, #3114, #3115               | VRT: the migration screens in light (dropped again by dev-sync 5, see _Sync log_), the D17 note and the D8 conflict screen; e2e: a lock created before the migration survives it; dev-sync 5 (`dev` @ `0e4278661`, merged 2026-11-11 as `93db5b9dc`)                                                                                                                                                                                                                                                                                                                                                                     |
| #3118                             | F2 (SF-3): a failed first PUT sweeps its uploads; a failed collection create rolls its cover back; stray `posts/{id}/` entries skipped                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| #3119                             | F4: profile links validated as the v1 data model stores them; a `links[n].url` refusal lands on its field (SF-5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| #3117                             | F3 (SF-4): collection edits match stored items by the post they name; a migrated 0.x row keeps the head's v1 spelling and notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| #3116                             | F6 (SF-7): the `isCurrent` viewer guard on every private fetch of the resync and the bootstrap, and on the resync's settings-store load                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| #3121                             | F1 (final review SF-1, SF-2, F-QA6-1, F-QA6-3): the Shop return survives the gate detour; `/migration` settles a failed restore (Sign in, or Retry for `temporary-error`); `signIn()` reports a gate sign-out as not completed so the restore dialogs no longer navigate home over the explanation; reason-specific sign-out copy; the backup screen keeps only AlertBackup's Done (its Sign out button, which only prompted for the backup again, is removed); a failed engine chunk load blocks as unreachable and is reported once per account; thrown-engine telemetry by shape only (`errorName`, `kind`, `status`) |
| #3122                             | F5 (SF-6): feed filter tags folded with the stored label fold (`canonicalizeTagLabel`): pipe, dialog, sidebar filter, home store                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| #3123                             | F8: one chained `bookmarks` + `post_details` read for Followed Collections and the count; dev stall matched, not reproduced on prod                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| #3120                             | F7 (SF-8 to SF-11, the [F7] nits): the runbook, `AGENTS.md`, the ADRs, the Greptile rules and seven source comments brought up to the branch head; QA-4, QA-5, the Nexus watcher wedge (pubky/pubky-nexus#1229) and the final review recorded; the two uncaptured-`AppError` sites named in `AGENTS.md`                                                                                                                                                                                                                                                                                                                  |
| #3132                             | G3: `publishLock` waits 30 s (`requestTimeout`) for the lock create and the announcement PUT; slow homeserver PUTs had pushed the lock create past Cypress's 5 s default (branch e2e flake, QA-owned suite)                                                                                                                                                                                                                                                                                                                                                                                                              |
| #3133                             | second review (2026-11-12) appends: the `mailto:`/`tel:` link reduction in _Reductions_ and the release notes, fourteen `auth/SocialMigration` VRT states and the pending baseline dispatch, the e2e record with the `locks.cy.ts` timing failure, QA-6 in the QA matrix, the two uncaptured-`AppError` sites in the Greptile error rule, the storage and e2e-dispatch rollout steps                                                                                                                                                                                                                                     |
| #3134                             | dev-sync 6 (`dev` @ `9c8e05ffd`, the v1.14.0 backmerge #3131: the `version` bump only, no conflicts, nothing ported)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| #3135                             | G1 (SF2-3, SF2-4, N2-1): tests only; the article cover entry pinned through the card (PostArticle's envelope cover, `localCover` and slot-0 gates), the store (`setArticleCover` revoke-unless-reused, `reset`) and the edit seed (`useEditAttachments` cover strip from `articleCovers`, never the inline list by index); each review-id gap fails a mutation that passed every suite before                                                                                                                                                                                                                            |
| #3136                             | G2 (final review 2: SF2-1, SF2-2, the [G2] test nits), tests only: an upgrade adoption is gated without a trusted local record and kept in place with one; `getReplies` finds both spellings of the parent; a 401 on the flag read throws; the signed-out `/migration` guard case asserts the render; the older-revision record case names what it checks; the `Ärger` tag fold in TaggedList                                                                                                                                                                                                                            |
| #3137                             | dev-sync 7 (`dev` @ `ece09b536`: #3126 applies a session exchange that settles after the 12 s UI deadline; auto-merged above the gate, the late result re-enters `restorePersistedSession` so the gate still decides; two tests pin it over the real gate controller, one Neutral bullet in ADR-0026)                                                                                                                                                                                                                                                                                                                    |
| #3141                             | FIX-FINAL-1 (Greptile P1 on #3140): `withSyncLock` extracted from `FeedApplication` into `src/core/utils/sync-lock.ts`; bookmark writes hold `pubky-bookmarks-sync:<pubky>` shared, `fetchBookmarks` holds it exclusive across LIST, GETs and `reconcile`, so a write in another tab is never undone; the per-tab write sequence removed; a write that waited on the lock re-checks the viewer before each local and homeserver write (`isCurrent`, like mutes; bookmarks and feeds) and reports the skip to the hooks, which announce nothing (Greptile P1 on #3141); ADR-0028 amended                                  |
| #3144                             | FIX-FINAL-2 (Greptile P1 on #3140, round 2): a bookmark write holds the bookmark's own lock `pubky-bookmark-write:<pubky>:<postId>` exclusive inside the shared user lock, so writes to one bookmark are ordered across tabs, `deleteIdempotent` retries and back-off included (a PUT from another tab during a DELETE's back-off had been erased by the retry, the row kept, the file gone until the next listing dropped it); feed writes take the user lock exclusive; `createTestWebLocks` honours `shared`; ADR-0028 amended                                                                                        |
| #3145                             | FIX-FINAL-3 (Greptile P2 on #3140): the mute poll and the mute writes hold the per-user Web Lock `pubky-mutes-sync:<pubky>` (`fetchMutedUsers` exclusive across LIST, local read and upsert; `commitMute` shared, with the pair lock `pubky-mute-write:<pubky>:<mutee>` exclusive inside so a retried unmute DELETE cannot remove a mute another tab just put back), so a tab's stale LIST never undoes another tab's mute; the poll's in-flight skip dropped (a waiting commit writes after the run), the settle and LIST counters kept as defence in depth; cross-tab tests mirror #3141's; ADR-0014 amended           |
| #3143                             | FIX-FINAL-4 (Greptile P1 on #3140, round 2): `FileApplication.getMetadata` dedupes by URI and uses a cached row only for the URI it describes; the key `owner:hash` drops the extension, so the same bytes uploaded under two accepted types had left one row answering both URIs and the earlier post's card showed the later upload's name and type (uploading device only); any other v1 address is answered from the URI, nothing when the data model refuses its name, and a 0.x row stands as before; `useVisualFeedTiles` matches rows to attachments by `uri`; one `data-patterns.md` sentence                   |
| #3146                             | FIX-FINAL-5 (Greptile P1 on #3140): every homeserver read held under a per-user sync lock (each LIST, bookmark GET batch, feed GET, the feed write's fenced re-read) is bounded by `HOMESERVER_SYNC_READ_TIMEOUT_MS` (30 s, new constant) via `awaitBounded`: past the bound the run rejects with `REQUEST_TIMEOUT` before its reconcile or PUT (a feed write rolls back, a feed GET skips its feed), nothing applied late; PUTs and DELETEs under the locks stay unbounded (`HomeserverService` retries, browser timeout); ADR-0014 and ADR-0028 amended, a sentence each in `local-first.md` and `environment.md`      |
| #3148                             | dev-sync 8 (`dev` @ `75243da08`: #3142 removed browser-key sign-up, so `AuthController.signUp` left the gate's files and the inline-signup gate test drives the Ring signup; the D2 backup prompt for legacy browser keys kept as is, its building blocks are still on `dev`; #2926 Paykit reconnect, #3127 truncate)                                                                                                                                                                                                                                                                                                    |

The branch also carries CI-owned VRT baseline commits from the `VRT Update Baselines` dispatches after the QA-1 fixes
(two dispatches, 2026-10-31 and 2026-11-02), after dev-sync 2, 3 and 4, and after #3113 (`495ddbca3`): the new
`auth/SocialMigration` suite and the fixture-driven re-captures. The dispatch after #3110 changed no baseline, and none
has run after dev-sync 5 (`test:vrt:check-baselines` passed on the merged tree).

History: between PR-A and PR-D the branch had a known limitation (the first bootstrap read and wrote the app files at
`/priv/app.pubky/v1/`, so a pre-port Ring grant failed those requests until the gate signed it out, and
`AuthApplication.userIsSignedUp` read an un-migrated account as not signed up). The gate closed both.

## The migration gate (PR-D, ADR-0026)

Behavior. Every restore and every sign-in passes `SocialMigrationController.ensureMigrated` before the session enters
the auth store (`restoreStatus` `social-migration`, session `null`, committed identity visible meanwhile). A session
without `MIGRATION_CAPS` or a saved grant from before the gate whose flag is absent is signed out on `/migration`
(backup prompt first for a never-backed-up browser key), told why, and offered Sign in; the new grant is admitted, runs
`pubky-social-migrator` on the blocking screen (steps, "{done} of {total}", "Do not close this tab"), and bootstraps as
usual once it passes. A reload or a closed tab mid-run resumes on the next restore (the grant is admitted); a second
tab waits for the Web Lock and then reads the flag; a signup runs inline on its empty tree with no screen. Outcomes:
`incomplete`/`IO_ERROR` auto-retry (2 s, 5 s, 15 s) then Retry, also on foreground and network return; `QUOTA` shows
the bytes needed; `PRIV_UNSUPPORTED`, `UNSUPPORTED_EPOCH` and a thrown error block on Retry with Sign out;
`SESSION_EXPIRED` signs out and the next sign-in resumes; a run that skipped or dropped something waits on a summary
(Continue) and leaves the counts for the profile edit page (PR-D2).

Persistence and recovery. `localStorage` `social-migration:<pubky>` (`migratedRev`, `admittedGrantIds`, `lastRun`,
`notice`) survives the logout sweep; a trusted `migratedRev` makes a restore pass with no request and no migrator chunk;
the flag on the homeserver stays the authority (401/403 on its read are errors, never "absent"). A tab-scoped
`sessionStorage` notice explains the sign-out after the stores reset. `SOCIAL_MIGRATION_TRANSFORM_REV` is
contract-tested against the engine's `transformRev`; a higher build revision walks the tree again.

Paths. Ring QR/deep link, Bitkit and Passport adopt then gate (Passport stops its timers before adoption, so a run that
takes minutes does not time the attempt out); recovery phrase and encrypted file sign in then gate (the dialog closes
when the gate takes over); Ring signup runs inline (#3142 removed browser signup; a browser key created before it
still gets the backup prompt at the forced sign-out); a capability upgrade (Locks, Shop) consults the local
record only and keeps its context. Shop learns the account as `restoring` while gated.

Verification matrix (QA-1, local stack, see _QA matrix_): seed user X with 0.x data on the current build, deploy the branch, restore → sign-out
explanation → Sign in → `/migration` runs → `/home`; reload mid-run resumes ("Continuing from an earlier run"); second
tab waits; sign in from a second browser after the first finished passes on the flag read; a never-backed-up browser key
sees the backup prompt first; a pre-port Ring grant sees `missing-scopes`; signup lands on onboarding with no gate screen;
QUOTA, offline (auto-retry then Retry), summary with a dropped profile image; `/post/*`, `/profile/<pk>`, `/shop` redirect
to `/migration` while gated; logout from `/migration` works with the backup prompt.

Telemetry: operation `socialMigration`, counts only (`docs/sentry.md`). VRT: new suite `auth/SocialMigration` (fourteen
states × desktop/mobile, dark only: `/migration` is a signed-out route, forced dark since #3081; #3121 added
`restore-reauth-required` and `restore-temporary-error` and changed the `reauth-backup` capture, whose Sign out button
is gone, so those baselines wait for the next `VRT Update Baselines` dispatch, see the checklist), the D17 note in
`settings/Settings` and the D8 conflict copy in `misc/DatabaseErrorScreen` (desktop/mobile × dark/light), CI-owned
baselines. Cypress: a seeded 0.x account shows the progress screen on sign-in; a freshly signed-up one
never reaches `/migration`, and an empty or v1-only one only passes through it while the check runs (see _Cypress_).

## Compliance gate and dev-sync routine

Two gate tests keep the branch honest while it lives, and ship to `dev` with the final PR:

- `src/core/services/homeserver/write-call-sites.gate.test.ts`: every homeserver write goes through
  `HomeserverService` (test helpers under `src/test-utils` exempt) and no non-test file imports
  `pubky-social-specs/client`.
- `src/core/services/homeserver/social-v1-compliance.gate.test.ts`: scans non-test `src/**` (comments ignored,
  string literals counted) for `/pub/pubky.app`, the `pubky.app/` path fragment, `blobs/`, `*UriBuilder`,
  `PubkyApp*` classes, `PubkySpecs*`, any `pubky-app-specs` import, the Nexus `.bookmark` field and, since FIX-7, the
  Nexus `v0` version as a path segment or literal (`nexusV0`). `PERMANENT` lists the spellings that outlive the port
  with a reason each (today: the `/pub/pubky.app/:rw` scope and the chat `v0` scopes in `src/config/auth.ts`, the
  `v0` type in `src/config/nexus.ts`, the `files/by_ids` call in `file.api.ts`, the 0.x settings and `last_read`
  fallback paths, and the author check that still accepts 0.x File and blob URIs in articles); `LEGACY_RATCHET`
  listed every file that matched when the gate landed (55 files on 2026-10-30), each child PR shrank it, and PR-F
  emptied it. A file that matches outside `PERMANENT` fails the gate: a new 0.x spelling is ported, never listed.
  The same test (FIX-6) fails on `.session(` chained onto `eventStreamForUser` / `eventStreamFor`, directly or
  through variables, anywhere in non-test `src/**`: no session-bound event stream may be held open (ADR-0014).
- ESLint `no-restricted-imports` bans `pubky-app-specs`, the package and every subpath, everywhere linted (`cypress/` is
  not), and the compliance gate also catches a dynamic `import('pubky-app-specs')`. The package itself is uninstalled (see
  _Cypress_).

Dev-sync routine (its own short-lived session, daily or before a child PR merges, in the integration worktree):
fetch, record the sync SHA, list the merged `dev` PRs, merge, resolve, then a narrow compliance sweep of the
incoming diff only (those PRs were reviewed on `dev`; unrelated findings are out of scope): (a) `npm run typecheck`,
the ESLint restricted import, and the compliance gate on the merged tree; (b) a targeted read of
the incoming hunks for the v1 rubric only: the old package or wasm builder, hard-coded homeserver paths or
`*UriBuilder`, post/file shape assumptions (one file per post, `files/{tsid}`, File metadata objects, `embed.kind`),
`short`/`long` written to the homeserver, Nexus bookmark fields consumed, bookmarks/mutes/feeds treated as public,
capability strings outside `src/config/auth.ts`, a new route or coordinator that ignores the gate status, a
`vi.mock` of the spec package. Port only what the sweep flags, in the sync commit (or a child PR when non-trivial);
never touch anything else in the incoming code. Then lint, typecheck, the gates, targeted tests, the full
`npm test` (plus `npm run build` when routes or config changed), a line in the sync log below, and flag any
invalidated Cypress spec.

Team notice: while `feat/social-v1` is open, `dev` PRs touching homeserver paths, post/file shapes,
bookmarks/mutes/feeds or auth capabilities should be written against `pubky-social-specs` or flagged.

### Sync log

| Date       | `dev` SHA                      | Merged PRs                                                                                                                                                                                                       | Ported by the sweep                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-30 | `28b06db7d` (from `f63e73aad`) | #2981 (with #2982), #2983, #2965, #3002, #3001, #2897                                                                                                                                                            | `toLockContentKind` keyed on `KnownPostKind` (was `PubkyAppPostKind`) and its test; `usePostInputLock` hands the locked post `toLocalPostKind(lockedKind)`; the "locks the edited body" integration test asserts the `createLockContent` input (no `PubkyAppPost` spy); "pubky-app-specs v1.0.0-rc.1" renamed `pubky-social-specs` in ADR-0022, `docs/locks.md`, `locks.types.ts` and a test title                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Ratchet unchanged. Cypress (flag): #2897's `cypress/plugins/seed.ts` writes 0.x through `pubky-app-specs`. New VRT `LockedPostCard.vrt` (CI-owned baselines)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-11-03 | `1c1d67295` (from `28b06db7d`) | #2952 (dependency bump), #3004, #3037, #2896, #3035, #3005, #3039, #3041, #3040, #3048                                                                                                                           | Nothing: the rubric read of the incoming `src` hunks flagged no code (Locks UI and polish, the E2E Locks stub writes through `HomeserverService`, no new page route, `(feeds)/default.tsx` only 404s)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Ratchet unchanged. Lockfile: dev's versions plus the branch delta, `npm install`, proven with `npm ci`. Deps-bump verification on the merged tree: typecheck, lint, format:check, both gates, full `npm test` 1032 files / 17742 passed / 2 expected fail / 2 skipped, `npm run build` (migrator chunks out of the precache, `skipWaiting`/`clientsClaim` kept, 2,254 URLs and 14.55 MB), smoke on `npm run dev` and `next start`. 82 mobile VRT baselines conflicted and keep the branch side: dispatch VRT Update Baselines on `feat/social-v1` after the merge. Cypress (flag): #2896's Locks spec, see _Cypress hand-off_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-11-09 | `c782f7e65` (from `1c1d67295`) | #3041, #3040, #3048, #3050, #3052, #2985, #3056, #3069, #3023, #3017, #2935, #3057, #2805, #3078, #3022, #3033, #3073, #2953, #3060, #3059, #3053, #3065, #3036, #3006, #3068, #3067, #3031, #2993, #2996, #2986 | `NotificationApplication.fetchLastReadFromHomeserver` (#3006) read the now private `last_read` through `getFreshJson`, an anonymous fetch that answers 401 on `/priv/`: it reads through the session with `notFoundAsNull` instead. In the merge: `HomeserverService.subscribeUserEventStream` refuses `/priv/` paths; the last_read stream path follows the v1 file; Locks publish clean-up (#3056/#3069) on the v1 `GuardedPostBuilder` path; #3059's `notFoundAsNull` on the v1 profile probe; `locks.cy.ts` delete intercept on the v1 version path                                                                                                                                                                                                                                                                                                                                                                                                                                  | Event-stream hub (#3006/#3068) merged with no channel: the mute list keeps polling (ADR-0014) and `NotificationLastReadSyncCoordinator` is not started, so the hub opens no request; see FIX-8. Deps: dev's versions (incl. `@synonymdev/pubky` 0.17.1, `next-themes`) minus `pubky-app-specs`, plus the two v1 packages; proven with `npm ci`. FIX-7 read sites: see _Reductions and follow-ups_. 21 VRT PNGs conflicted (Search, Settings muted users) and keep the branch side; light mode (#2993) brought the rest: dispatch VRT Update Baselines on `feat/social-v1` after the merge. Verified on the merged tree: typecheck, lint, format:check, both gates, full `npm test` 1057 files / 18226 passed / 2 expected fail / 2 skipped, `npm run build` (2,256 precache URLs, 14.50 MB, migrator chunks out, `skipWaiting`/`clientsClaim` kept), `test:vrt:check-baselines`, smoke on `npm run dev` (light and dark, no `/events-stream` request) and `next start` (worker controlling). Cypress: `locks.cy.ts` touched (QA-3 run). Ratchet unchanged (empty)                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-11-09 | `c5135dfb0` (from `c782f7e65`) | #3080, #3082, #3083, #2887                                                                                                                                                                                       | Nothing in `src`: the Locks request timeouts (#3080) are pure service code with no path spelling, #3082 is one copy literal, and the dialog VRT suites (#2887) read the local `details`/`counts` fields only and render no post card. Cypress: #3083's shared `pollNexusPostDetails` helper landed on the branch's `/v1/post/{author}/{id}/details` URL (the one conflict, resolved to v1); the `onboarding.cy.ts` deadline move auto-merged on the v1 stream URL                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Ratchet unchanged (empty). 440 VRT PNGs from dev taken as-is (none conflicted: the branch had not re-captured any of them): dispatch VRT Update Baselines on `feat/social-v1` after the merge. No open PR on `cypress/**` against the branch at run time, so #3083 merged in full and no sequencing with the e2e follow-up was needed. Verified on the merged tree: typecheck, lint, format:check, both gates (25), full `npm test` 1058 files / 18428 passed / 2 expected fail / 2 skipped, `npm run build` (migrator chunks out of the precache, `skipWaiting`/`clientsClaim` kept), `test:vrt:check-baselines`. No browser smoke: no route, config, dependency or service-worker input changed. Cypress: `cypress/support/locks.ts` and `cypress/e2e/onboarding.cy.ts` touched (`locks.cy.ts`, `onboarding.cy.ts` for the next e2e run)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-11-11 | `0e4278661` (from `c5135dfb0`) | #3099, #3086, #3085, #3081, #3075, #3063, #3025, #2893                                                                                                                                                           | Nothing in `src`: #3099 (Replay block class, position-only backup ids), #3063 and #3025 (Locks wallet notice, error contract tests) carry no social path, kind or Nexus read; #3081's `clearThemePreference` sits in the branch's `AuthController.logout`, which the gate's forced logout also takes. Docs: `contract-testing.md` named `pubky-app-specs` three times, now `pubky-social-specs` (never mocked) and the Dependabot `pubky-sdk` group as it is. Cypress: `seedCreateLockPost` (#3025) writes the announcement through the author's writer as a v1 `note` with `lock` and serves a v1-encoded guarded post (dev used the 0.x builder and `kind: 'short'`), v1 authors only; `lockPostIndexed` on `/v1/post/{a}/{id}/details`; the `lock` Nexus expectation added, `bookmark` and `seedAddToCollection` stay removed; #2893's mobile helpers (`itMobile`, `openProfileTab`, `openEditProfile`, `showProfileHeader`, feed helpers) applied to the branch's restructured specs | #3081 forces dark on every `SIGNED_OUT_ROUTES` path, which includes `/migration` (`AUTH_ROUTES`): the twelve `auth/SocialMigration` light states (#3113) were dropped with their 120 baselines (`visual-regression-testing.md`); the `/settings/edit` note and the version-conflict screen keep light (signed-in routes). `.github/workflows/e2e-test.yml` auto-merged: dev's viewport matrix and nightly mobile schedule, the branch's `pubky_stack_ref: 'social-v1'` and `feat/social-v1` push trigger intact (push runs desktop only). `@sentry/cli` 3.8.2; no `pubky-app-specs` in deps, lockfile or Dependabot. Verified on the merged tree (fresh `npm ci`): typecheck (app and `cypress/`), lint, format:check, both gates (25), full `npm test` 1061 files / 18683 passed / 2 expected fail / 2 skipped, `npm run build` (the 3.46 MB SDK chunk is still not precached, as before), `test:vrt:check-baselines`, `auth/SocialMigration` VRT on chromium 24/24. Code review of the resolution hunks: findings fixed or justified in PR. Cypress specs touched (next e2e run): `locks.cy.ts` (seeded lock posts), `collections`, `deep-links`, `notifications`, `onboarding`, `profile` (conflicts), and `contacts`, `feed`, `pagination`, `posts`, `search`, `settings` (auto-merged); e2e not run locally (CI's push run on the merge passed, 13 of 13 specs). PR #3114 (`locks.cy.ts`, seed files) was open at run time and overlaps; it merged after as `ae4ba8ad2` |
| 2026-11-11 | `9c8e05ffd` (from `0e4278661`) | #3131 (the v1.14.0 backmerge, `master` → `dev`, carrying #3102 `Release v1.14.0`)                                                                                                                                | Nothing: the incoming diff is the `version` bump `1.13.0` → `1.14.0` in `package.json` and the two matching lines of `package-lock.json` (2 files, 3 lines); no `src`, `cypress`, workflow, docs or VRT hunk to read                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Auto-merged, no conflicts. Nothing else on the branch pins `1.13.0`: the app reads `NEXT_PUBLIC_APP_VERSION ?? packageJson.version` (`next.config.ts`) into `APP_VERSION` (`SettingsInfo`, `APP_RELEASE_URL`, `chunkLoadRecovery`); the service-worker takeover and the `DB_VERSION` loop-breaker do not key on it. `pubky-social-specs` and `pubky-social-migrator` 1.0.0-rc.1 unchanged; no `pubky-app-specs` in deps, lockfile or Dependabot. Verified on the merged tree (fresh `npm ci`): typecheck (app and `cypress/`), lint, format:check, both gates (25), full `npm test` 1064 files / 18808 passed / 2 expected fail / 2 skipped, `npm run build` (the 3.46 MB SDK chunk is still not precached, as before), `test:vrt:check-baselines`. No browser smoke: no route, config, dependency or service-worker input changed. Cypress specs touched: none; e2e not run locally. VRT baselines unchanged, nothing to dispatch. #3132 (`cypress/support/locks.ts`) merged into the branch during the run and was folded into the sync branch without conflict (format:check, typecheck and the gate re-run green)                                                                                                                                                                                                                                                                                                                                                        |
| 2026-11-11 | `ece09b536` (from `9c8e05ffd`) | #3126 (`fix(auth): apply restore results after the UI timeout`: an SDK exchange that settles after the 12 s UI deadline is applied at once instead of waiting for a focus, online or manual retry)               | Nothing in `src`: the late-result continuation only re-enters `restorePersistedSession`, which carries the gate (`prepareAccount` → `ensureMigrated` → `init` on `passed`), and is guarded on `restoreStatus === 'temporary-error'`, so it never fires on `social-migration`; the tests `vi.spyOn` the application and the service only, with the gate mocked `passed` by the file's `beforeEach` as before. Added on the branch: two tests over the real gate controller (`auth.social-migration.test.ts`, "an exchange that settles after the UI deadline": a late session is placed only after the flag read saw no session, a late session from before the gate is signed out instead of placed; both fail on the pre-merge controller) and one Neutral bullet in ADR-0026                                                                                                                                                                                                           | Auto-merged, no conflicts: dev's hunk sits above the branch's gate sequence, which is unchanged. Composition: the `/migration` Retry (#3121), the coordinator's focus/online retry and the new continuation all call `restorePersistedSession`; one exchange, one gate run, the first caller consumes it (`sessionRestore` is cleared right after `bounded`), a gate sign-out still ends as `social-migration` and a failed flag read as `temporary-error`. ADR-0024's new sentence kept as merged. Verified on the merged tree (fresh `npm ci`): typecheck, lint, format:check, both gates (25), `npm test -- src/core/controllers/auth src/core/controllers/social-migration src/core/application/auth src/providers/RouteGuardProvider src/components/templates/Auth src/core/coordinators/auth src/hooks/useAuthStatus` 15 files / 513 passed, full `npm test` 1064 files / 18818 passed / 2 expected fail / 2 skipped, `npm run build` (the 3.46 MB SDK chunk is still not precached, as before). No browser smoke: no route, config, dependency or service-worker input changed. Cypress specs touched: none; e2e not run locally. VRT baselines unchanged, nothing to dispatch. Ratchet unchanged (empty)                                                                                                                                                                                                                                                             |
| 2026-11-12 | `75243da08` (from `ece09b536`) | #3142 (`feat(onboarding): remove in-browser key creation from sign-up`), #2926 (`fix(locks): reconnect Bitkit for a creator Paykit already holds`), #3127 (`fix(text): support browsers without intl segmenter`) | Nothing in `src` by the rubric: #2926's Paykit reconnect URL and same-origin `/api/paykit-creator` probe carry no social path, kind or Nexus read; #3142 and #3127 none either. Conflicts (the gate's own files): `application/auth/auth.ts` (imports: the branch's `buildUri` from `pubky-social-specs` with dev's `TKeypairParams`-free type import), `controllers/auth/auth.ts` (dev's removal of `signUp` taken; the gate sequence, the boolean returns and the #3126 continuation untouched), `auth.migration.test.ts` (dev's removal of the signup tests and `ProfileController` import, the branch's `SocialMigrationController` import kept). Ported: the gate test "runs a signup inline" now drives the Ring signup (`getSignupAuthUrl`, purpose `signup`), the only signup left; the RouteGuardProvider inline-signup test sits on `/onboarding/scan` instead of the removed `/onboarding/pubky`                                                                              | D2 backup prompt kept unchanged: #3142 removed the onboarding `Backup` organism and routes but kept `AlertBackup`, `DialogBackup`, `DialogConfirmBackup`, `useHasBackupAccount` and the stored secret/mnemonic, which are all the `reauth-backup` state renders, so a browser key created before #3142 that never backed up still gets the backup prompt before the forced sign-out (no product-visible change). Cypress: #3142 breaks `completeOnboardingFromInstall` (`#create-keys-in-browser-btn`, `/onboarding/pubky`, `/onboarding/backup`) on `dev` as on the branch (QA-flagged in #3142, not edited there); the branch's migration specs seed users and sign in by file, so only the signup-inline assertion in `onboarding.cy.ts`'s first test rides on the removed flow; specs not touched, e2e not run locally. VRT: dev deletes the `onboarding/BackupPage` and `onboarding/PublicKey` suites with their 20 PNGs and changes `Install` (button removed) and `DialogLocksAuth` (narrow-viewport rows); `auth/SocialMigration` renders as before. Ratchet unchanged (empty). Verified on the merged tree (fresh `npm ci`): typecheck (app and `cypress/`), lint, format:check, both gates, full `npm test` 1062 files / 18944 passed / 2 expected fail / 2 skipped, `npm run build`                                                                                                                                                                               |

## Cleanup (PR-F)

`pubky-app-specs` is gone: PR-F moved it to `devDependencies` for the Cypress seed plugin only, and the e2e port
(PR #3055) ported that plugin and uninstalled it, so it is in neither `package.json` nor the lockfile. ESLint and the
compliance gate still ban it in `src/**` as a guard. Gone with it in PR-F: the wasm builder
singleton `src/core/pipes/pipes.builder.ts` and its test, the builder double in `pipes.test-utils.ts`, the unused 0.x
kind helper `src/core/services/local/post/post.helpers.ts`, every `vi.mock('pubky-app-specs')`, the
`@/config/posts` preload in `src/config/test.ts`, and the last `LEGACY_RATCHET` entries (the list is empty).

- Build: the old package's wasm chunk (634 KB) left the precache (2,053 → 2,051 URLs, 14.61 → 13.96 MB); the
  migrator chunks are still excluded.
- `experiments.asyncWebAssembly` is removed: builds with and without it emitted byte-identical client chunks and the
  same wasm assets. `@synonymdev/pubky` and the migrator instantiate base64-inlined wasm, and the Locks SDK and
  Prelude reach theirs through `new URL(…, import.meta.url)` asset modules, so no dependency imports a `.wasm` as
  an ES module. The Turbopack alias for the old package is gone; the `@synonymdev/pubky` one stays.
- Tests: the WebAssembly console and unhandled-rejection suppressions in `src/config/test.ts` and `vitest.config.ts`
  are removed; the full suite printed the same output with and without them. The jsdom navigation filter stays.

Follow-ups (not in PR-F): `pubky-social-specs` and `pubky-social-migrator` could join the `pubky-sdk` group in
`.github/dependabot.yml` (a CI task; the e2e port only removed `pubky-app-specs` from it); the `@synonymdev/pubky` chunk (3.4 MB
since SDK 0.16) is over `maximumFileSizeToCacheInBytes` (3 MiB), so it is left out of the precache, on `dev` too;
`src/core/utils/pubky-app-spec-feed-mappers.ts` keeps its old file name although it maps `pubky-social-specs` values.

## Bookmarks (PR-B3, ADR-0028)

Bookmarks are private (`/priv/social/v1/bookmarks/`), so Nexus never sees them and the local `bookmarks` table is the
source of truth: `BookmarkApplication.fetchBookmarks` LISTs the directory at bootstrap and in the DB-reset resync,
GETs the time of each bookmark not stored locally yet, and reconciles the table and the one local stream
`timeline:bookmarks:all`. The bookmarks feed is served from that row only (posts hydrated through `by_ids`), the
bookmark count is local and live, Followed Collections walks the same stream, and every Nexus bookmark field
(`post.bookmark`, `counts.bookmarks`, the `source=bookmarks` stream) is ignored or removed. An un-bookmark deletes
the v1 file only: the 0.x copy cannot be named, so it stays on the homeserver and in Nexus as an invisible ghost
until Nexus stops indexing `/pub/pubky.app/bookmarks/`. `src/config/bookmarks.ts` (`BOOKMARK_REMOVAL_PROTECTION_MS`)
is retired with `recentUnbookmarks`.

Reductions, reported to the team:

- The Nexus notifications "a post you bookmarked was deleted or edited" and "a collection you follow was updated"
  stop for v1 bookmarks (D7); the notification type and renderer stay for 0.x ghosts.
- A bookmark made or removed on another device shows at the next sign-in (or after a local database reset), not
  live and not on a plain reload (no bookmarks SSE).
- Followed Collections hydrates through every bookmark, posts included: it keeps walking until a page of
  collections is shown or the bookmarks run out, so it may fetch the details of many bookmarked posts first.
- Following a collection stays a bookmark of the collection post, now private: its creator never learns of it.

## Nexus API version (FIX-7, ADR-0027 amendment)

Nexus serves two APIs: `/v0`, frozen (0.x kind names, bookmark fields, `attachments_metadata`, `files/by_ids`, tag
`relationship`), and `/v1` (`pubky/pubky-nexus` `feat/social-spec-handling`, API1 #1221), which the release uses.
Every call is built by `buildNexusUrl` under `NEXUS_API_VERSION = 'v1'` (`src/config/nexus.ts`, a config addition);
the Nexus services fold each response once at the read boundary: the kind fold `note`/`article` → `short`/`long`
(fail-open: `unknown` stays `unknown` and renders as a note) runs in `PostNormalizer.fromNexus`,
`NotificationNormalizer.toLocalKind` and the server-side `fetchUserAndPostForMetadata`; the tag fold
`relationship = relationship ?? (tag_uri != null)` runs in `TagNormalizer.fromNexus`, which `PostNormalizer.fromNexus`
and `UserNormalizer.fromNexus` apply to their tags. The URL builders send `kind=note|article|…`; the
`StreamKind` values and the persisted stream ids keep `short`/`long`. `post.bookmark` and `counts.bookmarks` are
optional (`UserCountsModel` stores `0` on every row, no `DB_VERSION` change); `bootstrap.files` and `attachments_metadata`
are gone. The one `/v0` call is
`filesApi.getFiles` (`POST v0/files/by_ids`), for 0.x attachment metadata only: once per fetched page of posts, before
the posts are persisted, at the four `FileApplication.fetchFilesForPosts` call sites (the bootstrap page in
`application/bootstrap/bootstrap.ts`, a stream page and the originals of its reposts in
`application/stream/posts/post.ts`, a TTL refresh batch in `application/ttl/ttl.ts`), in place of the inline
`attachments_metadata` `/v0` served, and per card for any row still missing; sunset in the ADR; the
compliance gate (`nexusV0`) lets no other file under `src` name `v0`. `/v1` also folds tag labels by the data model's
frozen whitespace table, which `canonicalizeTagLabel` / `isValidTagLabel` now mirror (contract-tested against `buildTag`).

Deploy coupling is unchanged (D6/D10): the app follows the Nexus deploy; a `/v1` app against a `main` Nexus gets 404s.

Retest: the FIX-7 checks were run in QA-3 on 2026-11-10 (_QA matrix_), one per row there: the feed and content filters
and the content search with a kind filter (QA-3 item 6), an article from Nexus rendering as an article and keeping its
kind through an edit (items 4 and 14; the lock path was not exercised there, item 12 NOT RUN, and ran in QA-5 against
a real Lock Server), tag membership from `tag_uri` and the untag (item 8), the bootstrap
without `files` with one `files/by_ids` request per page (item 7), an un-migrated author's image post for a v1 viewer
(item 7), profile counts without `bookmarks` (item 10), labels with uppercase or whitespace (item 8), collections via
`source=collection` (item 11), and the OG image of an image note (item 7; the article OG was not exercised). A post of
kind `unknown` was not observed (item 9: the migrator skipped the corpus' unknown-kind post), so "renders as a note and
cannot be edited" rests on the unit tests.

Cypress (not run here, for the QA-3 e2e run): every Nexus intercept and probe moved to `/v1` in
`cypress/support/{nexus,common,contacts,feeds,pagination,profile,locks}.ts`, `cypress/e2e/{onboarding,posts}.cy.ts`
and `cypress/plugins/seed.ts` (`PUT /v1/ingest/{id}`); no spec asserts a `kind=` value in a URL.

## Retest list (final full-stack pass, D10)

Written before the Nexus branch was complete (N2b, N3, N4, N5, `tag_uri` backfill); QA-3 ran it on 2026-11-10 against
the carrier at `d94c3e89` (_QA matrix_). Still open from it: `details.content` verbatim for a **migrated** article
(Nexus serves the 0.x content shape, QA-3 F-1, no user-visible defect), the Cypress suite on `dev` (it waits for the
pubky-stack bump at the joint deploy), and the staging-only checks (one real-Ring sign-in with the ten-scope grant;
Locks with a real Paykit and Bitkit, after QA-5 ran Locks before and after a migration against a real Lock Server with
a Paykit double). The collection-items test runs unconditionally since #3094.

- v1 files on the N5 route, `{nexus}/v1/static/files/{owner}/{hash}.{ext}/{variant}` for every variant, including other
  users' files and OG images; 0.x files stay on `/static/files/{owner}/{tsid}/{variant}` and avatars (v1 images too) on
  `/static/avatar/{user}`. The prefix is staged and may still move: it is one constant, `NEXUS_V1_STATIC_PATH` in
  `src/config/nexus.ts`, derived from `PUBKY_RUNTIME_CDN_URL`. The production proxy has to forward `/v1/static/*`.
- Other users' v1 attachments without metadata: `/v1` serves no `attachments_metadata` and `/v0/files/by_ids` skips a
  v1 address with a server-side warning, so the app reads the type from the extension and the name from the filename,
  with no size or dimensions, and requests `by_ids` for 0.x files only. A real row (own upload) wins. SVG `main` downloads and its WebP
  `small` displays (`nosniff`); PDFs get the file card, and other non-media types show nothing, as with a real row.
- A new user's avatar (A7): signup writes `profile.json`, already naming the avatar, before the avatar's bytes, so
  Nexus indexes the file instead of ignoring it for good. Check the avatar serves once the flip is indexed.
- The epoch flip on the v1 `profile.json` and the per-user backfill (N3/N4): posts, tags and follows written before
  the profile appear.
- The "post edited" notification burst a migration's PUTs may emit.
- Tag deletion across epochs via `tag_uri`.
- `details.content` served verbatim for articles (the cover in the envelope).
- Nexus notification URI forms; the resources stream without `app`; `details.uri` after a URI-only change.
- Bookmarks on a live homeserver: the LIST of `/priv/social/v1/bookmarks/` through the session, the GETs of their
  times, and the DELETE of a file already gone answering 404.
- The Cypress suite on `dev`, against pubky-stack with the carrier Nexus, in Chrome (the local port ran headed Electron).
- `source=collection` for a v1 collection (`nexus-contract` point 16): covered in Cypress since the carrier.
  `deep-links.cy.ts` reads a seeded v1 and a 0.x collection's items from the stream, and `collections.cy.ts` one
  written in the UI.
- v1 media bytes: covered in Cypress since N5. `expectImageServed` (`cypress/support/media.ts`) checks the route, a 200
  with an image type and the decoded image for a v1 upload and its replacement (`posts.cy.ts`, image and article
  cover), a v1 and a 0.x image post and article cover (`deep-links.cy.ts`) and an avatar set in the profile editor
  (`profile.cy.ts`, on `/static/avatar/{user}`).

## Cypress (QA-owned; edited by the social v1 work under agreement)

The suite stays QA-owned. The social v1 work edits it under QA's agreement (ruling of 2026-11-10) until the final PR
lands, and runs it on the branch meanwhile; everyone else flags an invalidated spec (`AGENTS.md`,
`docs/commit-message.md`). The edits so far: the port in #3055, FIX-7's `/v1` intercepts (#3090), the e2e follow-ups
#3094 (v1 media bytes, collection items), #3111 (interrupted runs, the delete race window; `cypress/support/migration.ts`)
and #3114 (a 0.x lock through the migration), and the conflict resolutions of dev-syncs 3, 4 and 5 (#3084, #3091,
#3115): 28 files against `dev`. What the specs now assume:

- Paths: posts, files, tags, follows and the profile under `/pub/social/v1/` (a post write is one version,
  `posts/{id}/{editId}.json`, and `postIdFromWriteUrl` in `cypress/support/nexus.ts` reads the post id from it);
  bookmarks and feeds under `/priv/social/v1/`; settings and `last_read` under `/priv/app.pubky/v1/`.
- Kinds: a guarded Locks post stores the v1 kind of its content (`note`, `article` or `image`), and seeded posts use
  `note`, `image`, `article` and `collection`.
- Bodies: `expectV1PostWrite` in `cypress/support/nexus.ts` decodes what the composers and the migration write with
  `pubky-social-specs`, on the Node side, so a 0.x shape on a v1 path fails.
- Removed by product decision: the "followed collection updated" notification scenario (D7), with the
  `seedBookmark` and `seedAddToCollection` tasks and the `bookmarkIndexed` check that only it used. Bookmarks are
  private, so Nexus never sees them.
- The gate: a sign-in waits for its destination route. An empty or v1-only tree, or one already migrated, goes through
  `/migration` only while the check runs, with no progress screen.
  `cy.signInWithEncryptedFile(path, passcode, { migrates: true })` also asserts the progress screen for a 0.x account,
  and `acknowledgesSummary` clicks through the summary. `onboarding.cy.ts` covers a clean run over every kind of object
  with what it writes and what reads back, the same account's later edits, deletes and new writes reaching Nexus, the
  summary, and a signup that never reaches `/migration`. Since #3111 it also covers the two interruptions: a reload
  mid-copy resumes the run on the restored grant ("Continuing from an earlier run", one flag write, one version file
  per post), and a homeserver that stops answering writes ends the run `incomplete`, which auto-retries three times,
  blocks on Retry and then finishes without duplicates. `locks.cy.ts` (#3114) takes a 0.x lock through the migration
  (the seeding paragraph below). A second tab waiting on the Web Lock is not testable in Cypress (one tab); it and the
  other stages are at the unit level and in the QA matrix.

Seeding (`cypress/plugins/seed.ts`, `cypress/plugins/seed.writers.ts`): `seedUserViaApi` writes v1 through
`pubky-social-specs`. `{ legacy: true }` writes the 0.x layout by hand under `/pub/pubky.app/`, so a supporting user
who never signs in stays un-migrated, and each writer spells references the way its own clients do. That is the
backwards-compatibility coverage: `deep-links.cy.ts` opens a 0.x account's post, article, profile and collection and a
thread and reposts across both layouts, and `notifications.cy.ts` receives a 0.x account's follow, tag and reply. A signed-in
test account seeds v1 or empty, except those that exercise the migration: the `onboarding.cy.ts` runs, and the 0.x lock
owner in `locks.cy.ts`. For that one, `createLegacyLockViaApi` also writes the files the Lock Server kept for a 0.x lock
(the guarded 0.x post and image under `/priv/app.locks/content/`, `/pub/app.locks/<lockId>.json`) beside the 0.x
announcement; after the migration the owner view, an unlock through the stand-in, a teaser edit and the delete run on it.
Cypress stays QA-owned; that test landed under the agreement described at the top of this section.
`seedCreateLockPost` (from `dev`'s Locks error coverage, dev-sync 5) publishes a paid lock for a v1 account without
the composer: the Locks `lock.json` under `/pub/app.locks/`, then the announcement through the author's writer as a v1
`note` whose `lock` names it. The guarded post is returned, encoded as `GuardedPostBuilder.toPrimary` encodes it, for the stand-in
Lock Server to serve; nothing is written under `/priv/app.locks/content/`.

Phones (`dev`'s #2893, dev-sync 5): a test registered with `itMobile` (`cypress/support/mobile.ts`) also runs in the
mobile viewport; a plain `it` is desktop only. The merge applied `dev`'s mobile helpers to the branch's specs where
`dev` changed them. A push to `feat/social-v1` runs desktop only, as on `dev`; the mobile subset runs on a
`workflow_dispatch` with `target: mobile` (or `both`), and the nightly schedule runs only on the default branch.

e2e runs on pushes to `dev`/`master` and, while the branch lives, `feat/social-v1`, against the private pubky-stack:
`feat/social-v1` points `pubky_stack_ref` (`.github/workflows/e2e-test.yml`) at pubky-stack's `social-v1` branch, whose
Nexus submodule is pinned to the carrier (pubky/pubky-stack#388). How that pin and the trigger change at the release is
in _Rollout order and release checklist_, steps 2 and 3. Local runs need `signup_mode = "token_required"` on the
homeserver, as CI sets it: otherwise the invite check answers 400 and onboarding stops at Continue. CI runs the suite on
every push to the branch (desktop, Chrome, 13 specs): green on the FIX-7 merge (2026-11-10, after one earlier flake on a
post delete that the Nexus delete race explains, _External questions_), on #3094, #3110, #3112 and #3111, on the
dev-sync 5 merge `93db5b9dc`, on #3114's `ae4ba8ad2` and on the fix PRs #3118, #3119, #3116, #3121, #3122 and #3123
(`8fd6da28e`, `963cdf7e3`, `9d2780d3d`, `8652c8af2`, `ae2e20fd3`, `d98f14a6d`; 2026-11-11, 13 of 13 each). Two pushes
failed: #3113's timed out in `posts.cy.ts` and `locks.cy.ts` and the next push was green; the #3117 merge (`e5bca7d1e`,
run 43005369209) failed `locks.cy.ts` on `publishLock`'s `cy.wait('@createContentLock')`: slow homeserver PUTs delayed
the lock create about 80 ms past Cypress's 5 s default `requestTimeout` ("No request ever occurred"), test timing that
predates the branch; #3132 gives both `publishLock` waits a 30 s `requestTimeout`. "e2e not run" in the _Sync log_ means
the sync session's local run. Local runs use the Chrome-family binary Playwright's VRT setup installs, never Electron or
a snap browser, so they match CI's matrix.

The e2e follow-up that the port left open landed as #3094 (2026-11-10): `expectImageServed` (`cypress/support/media.ts`)
asserts the route, a 200 with an image type and the decoded image for v1 media on `/v1/static/files/` and for 0.x media
on `/static/files/`, and the collection-items test in `deep-links.cy.ts` runs for the v1 and the 0.x collection alike
(no `it.skip` left in the file).

## Reductions and follow-ups

After dev-sync 3 (2026-11-09):

- **FIX-8, cross-device `last_read`: built (poll).** `dev` ships live cross-device sync of the notification read
  boundary (#3006, ADR-0029): `NotificationLastReadSyncCoordinator` follows `/pub/pubky.app/last_read` on the tab's
  shared homeserver event stream (#3068). On this branch the file is `/priv/app.pubky/v1/last_read.json`, and a private
  stream needs a session: a session-bound stream holds the shared session lock until its response headers reach the
  SDK, with no timeout; behind anything that buffers event streams (the Cypress proxy does, so would an intermediary)
  that is unbounded and a 401 refresh then waits forever (pubky/pubky-homeserver#798, probed 2026-11-09). Polling has
  no such exposure, so the private files are polled for this release: that channel is not started and the hub opens
  no request; `NotificationLastReadPollCoordinator` polls
  `NotificationController.fetchLastReadFromHomeserver` on the mute list's cadence instead (start, visible, `online`,
  every `NOTIFICATION_LAST_READ_SYNC_POLL_INTERVAL_MS` = `MUTE_SYNC_POLL_INTERVAL_MS`, 30 s; ADR-0029 amendment).
  Verified for the poll and the `markAllAsRead` fence: the SDK's session read sends a default-mode fetch, and the
  homeserver serves `/priv/` `Cache-Control: no-store` (`private, no-cache` + `ETag` from v0.18.0), so the read is
  never a stale browser-cache hit. The channel class stays in the tree, unregistered, until the SDK bounds that lease
  or the team accepts the exposure.
- **FIX-7, Nexus `/v1` API: done** (see _Nexus API version_). The read sites dev-sync 3 listed (`tag-cache.ts`
  `tag_uri` and `relationship`, `application/tag/tag.ts`, `tag.utils.ts`) are served by the derived `relationship` and
  stay unchanged; `locked=true` exists on `/v1` with the same rules (OpenAPI) and is pinned in the stream api test.
- **FIX-9, mixed-build loop-breaker: fixed (#3112), verified in the browser (QA-4 A.5).** QA-4 (F-2) found that the
  ADR-0019 breaker never fired with two builds in one profile: the re-initialization after the old tab's delete ran
  `Dexie.exists()` inside that tab's delete→reopen window, created the database at v4, and the probe's stub delete
  bounced the old tab back. That path now reads the version passively and looks again while the database is
  missing (about 5 s). After this page's own recreate it shows "Close other Pubky tabs, then retry." for anything
  but v4, except after a forced close such as storage eviction, which still recreates a lost database (ADR-0019
  amendment, with the residuals for the 0.x tab). QA-4 re-ran its Playwright repro on a production build of the fix
  (2026-11-10): 7 of 7 two-build runs (Chromium 151 ×4, Firefox 153 ×3) showed the conflict screen within 0.5–0.8 s,
  none bounced, and a same-build two-tab takeover showed no false conflict (_QA matrix_).

### Reductions (reported, not built around)

- Bookmark-derived notifications ("post you bookmarked was deleted/edited", "followed collection updated") stop (D7).
- Cross-device bookmark changes are visible at the next sign-in or local database reset only; no bookmarks event stream.
- `/feed/<id>` deep links change once at the migration (a feed id is the hash of its filter, and the migrator
  re-derives every id when it copies a 0.x feed) and again on every filter edit, which is the data model's design.
- Forced sign-out, a new grant with the longer scope list, and a forced reload of open tabs at the cut-over; a stale
  tab reloaded by the cut-over worker loses an unsaved composer draft (the composer persists no draft; deferring the
  reload for a dirty composer was declined on 2026-11-04).
- Migrated articles with the rc.1 off-by-one render through the migrated-article reader rule (A′), and keep doing so
  after the migrator fix, since the fixed migrator rewrites nothing an earlier run wrote (ADR-0023 amendment).
- Mute changes and the notification read boundary (`last_read`) changed on another device appear within the poll
  interval (≤30 s) or on focus, not live: a session-bound stream's lease is unbounded while its response headers are
  outstanding (pubky/pubky-homeserver#798; ADR-0014, and the `last_read` poll is ADR-0029).
- Item notes and attachment alt text are preserved on write but not shown (D4).
- Profile links that are not plain web URLs (`mailto:`, `tel:`, an upper-case scheme) are dropped by the migrator, shown
  once on `/settings/edit` as dropped values (D17), and refused by the profile form since #3119: the v1 data model
  admits only lower-case `http://` or `https://` URLs with a host, no whitespace or control character, of at most 300
  code points.

### Follow-ups (not in this round)

- **Migrator rc.2 adoption PR** (after the maintainer tags `v1.0.0-rc.2` of pubky/pubky-social-specs with #210): bump
  `pubky-social-specs` and `pubky-social-migrator`, mirror `SOCIAL_MIGRATION_TRANSFORM_REV` 4 (contract-tested) and
  keep rule A′: it goes only once no rc.1-written article is left to read (the revision bump re-walks but rewrites
  nothing, so pinning rc.2 retires nothing), as the `src/libs/post/articleCover.ts` docblock says since the pre-rc.2
  cleanup PR (#3110), which also made rule B image-only (`attachments[0]` is the cover only when its file row says
  image; a PDF or video at slot 0 is no cover and never paints as one). Re-QA a migrated article with cover and inline
  media.
- Restore the mute and `last_read` event streams when the SDK bounds the session lease for streams or the team
  accepts the exposure (pubky/pubky-homeserver#798): register the `last_read` channel and remove the poller
  (ADR-0029), bring back the mute channel (ADR-0014). The compliance gate's `.session(` rule goes with them.
- Muted users unknown to Nexus are hidden in Settings → Muted users, so such a mute cannot be removed from the UI
  while the MUTED stream still holds the key (QA-3 O-1; minor).
- Media GC residual: `LocalFileService.isReferencedElsewhere` checks the owner's profile image and the locally cached
  posts, so a shared file can still be lost when the other referencing post is outside the cache and the Nexus `by_ids`
  view misses it; server-side or Nexus-backed reference counting is the real fix (QA-1 BUG-2, partly fixed; ADR-0027).
  Until then edits and avatar changes never delete media, a post delete skips any file it cannot verify unreferenced,
  and orphans accumulate in each account's storage.
- Avatar route: avatars are built on `/static/avatar/{user}`, not `/v1/static/avatar/{user}`; both answer the same on
  the carrier (QA-3 O-2). Align when the Nexus team says which one stays.
- Ring folds the ten requested scopes into nine (`/priv/social/v1/:rw` is covered by `/priv/social/:rw`); adoption and
  the gate work with the folded grant (QA-1 O-7, QA-3 O-4). Known, nothing to do unless Ring changes.
- Nexus post delete vs. read-repair race (pubky/pubky-nexus#1213, found 2026-11-10): a read concurrent with a delete
  can resurrect the post in Redis. The e2e `postGone` waiter stays at 404, which is right; deletes in e2e may flake
  until Nexus fixes it.
- Nexus watcher wedge on a duplicate post id (pubky/pubky-nexus#1229, pre-existing on Nexus `main`; QA-1 S-1, QA-4
  F-3): post ids are per-author microsecond timestamps, but the graph makes `Post.id` globally unique, so when two
  authors publish the same id the indexer fails that batch with a non-retryable constraint error, retries it forever
  and stops indexing for every user until an operator moves the Redis cursor past the event. No app change; the local
  stack recovered by a cursor bump in QA-4.
- Migrated articles are served by Nexus in the 0.x content shape on `/v1` (QA-3 F-1, Nexus contract point 24); the app
  renders both shapes through the reader rules, so no change here.
- Cleanup pass of the `/pub/pubky.app/` copies: not at release (meeting 2026-11-04: no app-side deletion; Nexus clears
  legacy data later). The 0.x tree sunset (who deletes it, when legacy reads stop, the `rescan` schedule) and the
  removal of the one `/v0` call (`files/by_ids`, ADR-0027 _Sunset_) follow it.
- Private drafts and `planPublish`, slugs, attachment alt text UI, collection item notes UI, published feeds,
  `createSocialClient`, 1.1 kinds (D4); the auth-store v4 cut-over (contingency only).
- The generic file card renders only PDFs, so a CSV, zip or txt upload shows no card (pre-existing); `text/csv`
  attachments (the data model allows them) are deferred with it.
- `pubky-social-specs` and `pubky-social-migrator` could join the `pubky-sdk` Dependabot group (a CI task), and
  `src/core/utils/pubky-app-spec-feed-mappers.ts` keeps its old file name although it maps `pubky-social-specs` values.
- PR-E2, the service-worker policy revert, when the team decides (D9, ADR-0021); the "Update available" toast returns
  with it.

## Rollout order and release checklist

The app ships with, never before, the Nexus deploy that carries the social v1 steps (D6/D10): a `/v1` app against
today's Nexus gets 404s. `docs/release.md` has the one-time additions to the release process; this is the order and the
gate list.

1. **Nexus deploys first.** The carrier `feat/social-spec-handling` (the epoch flip and per-user backfill, v1 files,
   collection items, the `/v1` API, the `tag_uri` backfill; complete at `d94c3e89` on 2026-11-06, the QA-3 reference)
   merges to Nexus `main` through its umbrella PR, pubky/pubky-nexus#1129, whose merge commit is the deploy ref; the
   Nexus team names the staging and production dates. Whatever fronts `nexus.*.pubky.app` must forward `/v1/*` (the
   API and `/v1/static/*`) to Nexus in the same deploy (open with the Nexus team). Nexus deletes its bookmark indexing
   at the joint deploy (agreed 2026-11-05).
2. **pubky-stack.** pubky/pubky-stack#388 (branch `social-v1`, Nexus submodule pinned to the carrier) is re-pinned to
   the deploy ref and merged into `staging`: that is the staging Nexus bump, and what makes the `dev` e2e run green.
3. **The final app PR** `feat/social-v1` → `dev` merges only near that deploy, so `dev` stays deployable meanwhile. It
   sets `pubky_stack_ref` in `.github/workflows/e2e-test.yml` back to `staging`, drops the `feat/social-v1` push trigger,
   and gets a full code review, a security review, Greptile, talosmachina and the frontend team's review. Before it:
   the maintainer's manual pass on the local stack (after a reset and re-seed), the final review's should-fix PRs
   (the `fix/social-v1-*` PRs listed after step 7; the code ones are merged), the
   migrator rc.2 adoption PR, and this docs sweep (the e2e follow-up landed as #3094); after it, a staging deploy and
   the maintainer's staging test (one real-Ring sign-in with the ten-scope grant; Locks before and after a migration
   with a real Paykit and Bitkit), then production with the Nexus deploy. Once step 2 is done, dispatch `e2e-test.yml`
   by hand (`workflow_dispatch`) on the final PR's head, where `pubky_stack_ref` already reads `staging`, and merge only
   when that run is green; pubky-stack's `social-v1` branch is deleted only after the merge, because the branch's own
   push runs still point at it.
4. **Infrastructure gates.** The production homeserver serves the same feature set as staging and the local stack at
   0.16.2 (verified 2026-11-04). A migration temporarily doubles each user's storage (the 0.x tree stays until the
   cleanup pass), so before the deploy the infrastructure owner raises the allowances of the accounts nearest their cap
   first, then the heaviest. Moderation service readiness is a release gate. Bot accounts (the moderation
   bot) need a migration path (open). `NEXT_PUBLIC_DB_VERSION=4` is in both Docker workflows (PR-CI).
5. **No rollback after the first migrated user** (ADR-0019, ADR-0026): before anyone migrates, redeploying the previous
   image tag is safe (the database version mismatch recreates symmetrically); after, v1 writes are invisible to a 0.x
   client and Nexus has flipped epochs, so a defect goes through `docs/hotfix.md`, and a hotfix that skips the gate is
   never acceptable.
6. **Release notes** (`docs/release.md`, _The social v1 release_) tell users what changes and list the reductions above.
7. **After the deploy.** A team account migrates on production and its v1 post appears in Nexus; Sentry filtered on
   `operation: socialMigration` shows no terminal codes; the branch e2e trigger is gone; PR-E2 is opened when the team
   decides (D9); #2928 and #2929 (the spec author's draft PRs) are closed.

Final review (2026-11-11): an independent review of the whole branch diff against `dev` (`93db5b9dc` vs `0e4278661`, 15
lenses, every finding checked by two independent verifiers) found no blocking defect, seven should-fix code defects and
the docs drift #3120 fixes. The defects landed as six PRs into `feat/social-v1`, all merged on 2026-11-11 before the
final PR: the Shop sign-in return kept through the gate and `/migration` settled for a failed restore (#3121), the
uploads of a post whose PUT failed swept (#3118), collection items matched by post identity on an edit instead of being
rewritten to 0.x spellings (#3117), profile links validated the way the v1 data model does (#3119), feed filter tags
folded with the stored label fold (#3122) and every private fetch of the resync guarded with the viewer session (#3116);
the docs drift is the sweep #3120. The QA-6 live pass that followed (its findings are recorded in #3121 and #3123) added
a seventh code fix, merged the same day: the `/collections` live queries kept observing bookmarked post details on a
cold visit (#3123). Two findings identical on `dev` are `dev` follow-ups, not merge gates: clearing an article's cover
can re-promote an unreferenced slot 0 under rule B, and the attachment-reference collector misses a backslash-escaped
`attachment:n`. The review also confirmed step 3's `pubky_stack_ref` flip as a hard precondition of the final PR. Final
review 2 (Opus, 2026-11-12, seven lenses on the merged head `d98f14a6d`): no blocking finding; the seven fixes hold
together as one change; five regression-guard test gaps (the D11 gate for a capability upgrade, reply lookup under both
spellings of the parent post, and three article-cover paths: `PostArticle`'s `localCover`, `legacyCoverSlot` and
`setArticleCover`) are closed in test-only PRs (pending), and its one docs gap, the `mailto:`/`tel:` link reduction, is
recorded above.

Checklist:

- [ ] Nexus `main` carries the carrier; staging and production deploy ref and dates named; the proxy forwards `/v1/*`
- [ ] pubky/pubky-stack#388 re-pinned to the deploy ref and merged (staging Nexus bump)
- [ ] Integration branch green: lint, typecheck, full `npm test`, `npm run build`, branch e2e 13/13, VRT baselines
      regenerated by CI after the last dev-sync
- [ ] `VRT Update Baselines` dispatched after #3121 (two new `auth/SocialMigration` states and the changed
      `reauth-backup` capture have no CI baseline yet; the second review bundles it with the dispatch after dev-sync 6)
- [ ] QA-1, QA-3, QA-4, QA-5 and QA-6 recorded (_QA matrix_, done 2026-11-12); the maintainer's manual pass done;
      staging checks (Ring grant, Locks with a real Paykit)
- [ ] Storage allowances raised; moderation service ready; bot-account migration path decided
- [ ] Migrator rc.2 adopted (both packages, `SOCIAL_MIGRATION_TRANSFORM_REV` 4)
- [ ] Final PR reviewed (full code review, security review, Greptile, talosmachina, frontend team), `pubky_stack_ref`
      back to `staging`, the `feat/social-v1` e2e trigger dropped
- [ ] Release per `docs/release.md`, with the social v1 release notes
- [ ] Post-deploy canary and Sentry check; PR-E2 scheduled per D9

## QA matrix

Four QA passes ran on the local stack (_Local stack runbook_): QA-1, QA-3 and QA-5 with the built-in browser, QA-4 with
Playwright on production builds, each verifying every step against the homeserver (`/storage/<pk>/…` LIST and GET,
admin WebDAV for `/priv/`, the request log), Nexus and the browser console; a fifth, QA-6, was a live pass of the gate
and collections UI whose record is in the fix PRs it fed. The full reports with screenshots live with the plan, outside
the repository (`qa1-report.md`, `qa-3-results.md`, `qa-4-results.md`, `qa-5-results.md`); the summary by item:

**QA-1 (2026-10-30/31, `feat/social-v1` with B3 merged, Nexus placeholder `feat/v1-social-indexing`): 19 PASS, 1 N/A of 20.** Persisted 0.x sessions signed out (`pre-migration-grant`, a Ring 0.x grant `missing-scopes`, a never-backed-up key
with the backup prompt first) · phrase sign-in → `/migration` → summary → home, flag revision 3, 0.x tree
byte-identical · reload after migration: no gate, no migrator chunk · migrated article (rule A′), collection and image
note render · post create, edit (second version is the head), reply, repost, delete (every version gone, tombstone,
the 0.x copy removed too) · article with cover and inline media, title edit · collections create, add (also into a
migrated one), remove, cover removal (BUG-1 and BUG-2 found here) · tags, migrated tag untag via `tag_uri`, hashtag
folding · follows, mutes (unmute deletes both copies), second tab live · feeds with new ids, filter edit, delete ·
profile bio, links, status, avatar · settings and `last_read` at `/priv/app.pubky/v1/` · bookmarks (private file,
bookmark-time order, count, unbookmark, followed collections) · account export N/A (no UI entry point, same on `dev`),
account delete instead · a second user migrates and sees the first's v1 posts · signup with no `/migration` screen ·
Ring simulator full and trimmed grants (BUG-3) · interrupted run resumes, second tab waits · encrypted-file sign-in ·
migrator CLI dry run `already_migrated`. Bugs: BUG-2 (high, a cover removal deleted a shared content-addressed file;
fixed in #3014, residual in _Follow-ups_), BUG-1 (medium, an uncaught `ValidationError` per keystroke in the
collection URL field; fixed in #3013), BUG-3 (low, the trimmed-grant toast blamed the key; fixed in #3013). Media via
the CDN failed as expected before Nexus N5. The "post edited" notification burst was observed on the placeholder Nexus
and is gone on the carrier (QA-3 item 2).

**QA-3 (2026-11-10, `feat/social-v1` @ `03bdc021a`, homeserver 0.16.2, nexusd `d94c3e89`): 12 PASS (4 with
observations), 1 PARTIAL, 1 NOT RUN of 14; no app regression.** 1 migration path from a persisted 0.x session (sign-out,
grant retired, phrase sign-in, progress, summary with the expected skips, exactly one flag write, 0.x tree
byte-identical) PASS · 2 epoch flip and backfill within the run, every indexable post served with v1 URIs and kinds,
no "post edited" burst PASS · 3 app files, private trees LISTed and read back, re-derived feed ids, an old `/feed/<id>`
link opens home (accepted reduction) PASS (O-1) · 4 migrated article renders (cover on top, inline image in place)
PASS, Nexus `content` not verbatim for the migrated article PARTIAL (F-1, Nexus) · 5 second sign-in reads the flag, no
second write PASS · 6 feeds on the `/v1` contract (`kind=note|article`, search with a kind, no `exclude_kinds`, no
`source=bookmarks`) PASS · 7 media: v1 files on `/v1/static/files/{owner}/{hash}.{ext}/{variant}`, one `/v0/files/by_ids`
per page for 0.x attachments, OG image PASS (O-2, F-2) · 8 tags: trim and fold, cross-epoch untag via `tag_uri` PASS ·
9 `unknown` kind recorded PASS without being observed (the migrator skipped the corpus' unknown-kind post, so no such
post reached Nexus) · 10 user counts without `bookmarks`, local bookmark count
PASS · 11 collections: migrated collection, add by URL (BUG-1 fixed), remove, Followed Collections past 21 bookmarks,
live unfollow, cold cache PASS (O-3) · 12 Locks before and after a migration NOT RUN here (no Lock Server on the stack
at the time; run in QA-5 below, the real-Paykit path stays with the staging test) · 13 cross-device: mark-all-read and
a mute reach a second context within about 15 s PASS · 14 the QA-1 matrix re-run: create, edit, reply, repost, delete (the Nexus delete race not observed), article with cover and
inline seen by another user, profile, follow, notifications with v1 URIs, Ring simulator sign-in and gate, sign-out and
sign-in without a migration PASS (O-4). Findings: F-1 and F-2 are Nexus-side (the 0.x content shape for migrated
articles; corpus posts whose 0.x File objects were never indexed keep 0.x attachment URIs), O-1 to O-4 are in
_Follow-ups_ (O-3, a bootstrap that skipped the private-tree fetches after a forced IndexedDB wipe, was not reproducible
with genuinely empty storage).

**QA-4 (2026-11-10, `feat/social-v1` @ `4ff5475cb` and the FIX-9 build from #3112, production builds under `next start`,
Playwright headless, one engine at a time): takeover and database recreate PASS in Chromium 151, Firefox 153 and WebKit
26.5; the mixed-build loop-breaker FAIL on `4ff5475cb` and PASS on the FIX-9 build, in Chromium and Firefox; heavy
migration PASS.** Part A, forced service-worker takeover and `DB_VERSION` 3 → 4 (build A = `dev` `0e4278661` at
`DB_VERSION` 3 with the consent worker, build B = the branch, same origin, signed out throughout): the new worker
reloads every open tab onto the new build (Chromium +3.4 s, Firefox +23.1 s with a cold HTTP cache) PASS · the database
is recreated at v4 once, no loop PASS · the mixed-build loop-breaker FAIL on `4ff5475cb` in 0 of 4 Chromium and 0 of 3
Firefox runs (F-2: the two tabs closed each other with 3 to 50 deletes in under a second and the old build ended up on the new
database; fixed by FIX-9, #3112, ADR-0019 amendment) and PASS on the FIX-9 build, 7 of 7 runs (Chromium ×4, Firefox
×3): the conflict screen within 0.5–0.8 s of the old tab's recreate, no bounce, no stub delete, and no false conflict
in a same-build two-tab takeover · the migrator chunks stay out of the precache PASS · F-1 (pre-existing on `dev`): the
3.46 MB `@synonymdev/pubky` chunk is over Serwist's 3 MiB `maximumFileSizeToCacheInBytes` and is dropped from the
precache with a build warning (_Cleanup_, follow-ups) · F-3 (Nexus, pre-existing, the same as QA-1 S-1): two seed
clients posted in the same microsecond and the watcher wedged on the global `Post.id` constraint until a Redis cursor
bump past the event, which cost Nexus that one note (pubky/pubky-nexus#1229, _Follow-ups_). Part B, a heavy 0.x
account (2,050 posts incl. 50 articles with cover and inline images, 301 files for 308 MB, 500 tags, 200 follows, 300
bookmarks, 50 mutes, 3 feeds): the run walked
3,708 objects, hit a 507 quota pause set for the test ("Your homeserver is out of space", the bytes needed, Sign out /
Retry), resumed on Retry skipping the copies already present, and finished in 277 s wall (189 s without the wait) with
a continuously moving counter and a peak JS heap of 34.5 MB; every v1 tree complete and the 0.x tree untouched, Nexus at
epoch `v1` with the author stream paging without duplicates; home, profile, posts, bookmarks and a migrated article
render, a second sign-in costs only the flag read; the engine's 404 presence checks fill the console (O-1, harmless) and
a quota pause re-reads blobs read but not yet written (O-2, by design). Part C, the whole flow in Firefox and WebKit on
build B (before FIX-9) from a persisted 0.x session: the worker reloads the signed-in tab (Firefox +6.1 s, WebKit
+0.86 s, so `WindowClient.navigate` is confirmed on WebKit; `docs/pwa.md`), the D2 sign-out notice, sign in →
`/migration` → home,
the `beforeunload` guard holds a reload during the copy, the migrated article renders and a note posts to v1; 0 console
errors in Firefox, only O-1 in WebKit; desktop and 390 px layouts without overflow. PASS.

**QA-5 (2026-11-10/11, `feat/social-v1` @ `4ff5475cb`, `@synonymdev/locks-sdk` 0.1.0): Locks before and after a
migration against a real Lock Server, both flows PASS.** The Lock Server was built from pubky/locks v0.1.0 (the source of
the pinned SDK) and run beside the stack with its own Postgres, its pkarr record on the stack relay and the app's
`PUBKY_RUNTIME_LOCK_SERVER` pointing at it; Paykit was a scripted double of the six Lock Server → Paykit calls (setup
status, invoices, payment status, connection status, drain lookups and drains), so payments settled on a timer. Flow 1,
a lock created after the migration (a v1 creator from the Ring simulator, a reader whose small 0.x tree migrated
inline): the real
`/connect` shell in an iframe and the relay approval open the Locks session; the article with an inline image is locked
at ₿1,000, the guarded bytes go through the creator API and never get a public copy, the server writes the lock file
and the announcement is a v1 `image` with `lock`; Nexus `/v1/post` carries `lock` and the Locks feed filter lists it;
the owner reads the bytes from its own session; sign-out revokes the Locks session; the reader pays, receives the
credential, reads through the Lock Server and renders, and the replica and purchase files land under `/priv/social/`;
a teaser edit writes a new version with the same `lock` and no Lock Server call; a delete without a Locks session is
refused with an inline sign-in and then removes the lock (202), both versions and leaves the deletion tombstone, while
the reader keeps the replica. Flow 2, a lock a 0.x client created before the migration (seeded with 0.x shapes against
the real server): the sign-in migrates inline and the announcement keeps `lock` verbatim as a v1 `note`; the owner
view reads the 0.x guarded bytes through the parser's 0.x fallback; the reader unlocks; a teaser edit versions the
post; the delete removes the lock, the v1 versions and the 0.x original. Every creator route accepted the 0.x shapes,
so there is no creator-API gap. Still only testable on staging or with real components: a real Paykit and Bitkit
(invoice creation, the Noise link, settlement timing, `reader_setup_pending`, USD quotes, drains with cancellations),
Ring with HPKE and the phone approval flow, sessions from before Locks and the grant upgrade path, a large 0.x tree with
locks on the `/migration` screen, the Lock Server's current HEAD against SDK 0.1.0, and the deletion job's later phases.

**QA-6 (2026-11-11, a live pass of the gate and collections UI on the branch before the fix round; its captures and
video sit in the UI review sheet outside the repository and its three findings in the PR bodies of #3121 and #3123; no
results file): three findings, all fixed.** F-QA6-1: after a gate sign-out the sign-in dialog's `onRestore` pushed
`/home` over the signed-out explanation, because `AuthController.signIn()` resolved `true` when the gate had signed the
account out (fixed in #3121, which reports a gate sign-out as not completed) · F-QA6-2: on the first cold visit to
`/collections` after sign-in, Followed Collections stopped at 7 of 25 with no "Show more" and the Bookmarks card count
dropped while Dexie held every row; a reload fixed it (the live queries stopped observing `post_details`; fixed in
#3123) · F-QA6-3: the sign-out subtitle did not name its reason (`pre-migration-grant`, `missing-scopes`,
`session-expired`; fixed in #3121).

Browser QA matrix for a later pass (sign-in paths: Ring simulator scoped grant, recovery phrase, encrypted file, fresh
signup; pass = the stated outcome, no unexpected `AppError` toast, homeserver and Nexus agree): un-migrated persisted
session → sign-out → sign-in → migration → home; un-migrated fresh sign-in gates without a sign-out; fresh signup
migrates its empty tree inline; a run interrupted at `migrating` resumes; a migrated account costs one flag read and
loads no migrator chunk; a second tab waits on the Web Lock; a second device migrated elsewhere passes on the flag; a
trimmed Ring grant fails adoption with the "Authorization failed" toast naming the missing permission; QUOTA shows the
bytes needed with Retry; an old-build tab reloads within seconds of a new-build load; two builds with the worker
blocked show the "Close other Pubky tabs" recovery screen. Then the feature re-verification: post create, edit, delete,
reply, repost; image, video and PDF uploads for own and other users' media; article with cover and inline media
including a migrated one; collections add, remove, follow in both reference spellings; bookmarks after a migration;
tags and untag including migrated tags; follow and unfollow; mute and unmute with a second tab; feeds create, edit,
delete; profile edit with avatar; notifications; settings and `last_read`; Locks creator and reader; account export
(no UI entry point today) and delete; the forced reload. Of these, QA-4 ran the QUOTA pause with Retry, the old-build
tab reload (Chromium, Firefox, WebKit) and the two-build recovery screen (on the FIX-9 build, Chromium and Firefox),
and QA-5 ran Locks creator and reader before and after a migration; the rest waits for the maintainer's pass.

## Local stack runbook

The local pubky-docker stack (homeserver testnet, Nexus, Neo4j, Redis, Homegate) is one shared in-memory tenant and one
graph: one person uses it at a time, and whoever owns the stack is the only one who starts, stops, resets or rebuilds
its containers (a user and a post written during one check once turned up in another's e2e run, 2026-11-04).

- **Components and pins.** `pubky-docker` with its testnet watcher keys; `HOMESERVER_TAG=v0.16.2`,
  `HOMEGATE_TAG=v0.2.0` in its `.env`; `nexusd` built from source at the carrier ref under test (`d94c3e89` for QA-3)
  with `docker compose --profile backend build nexusd`, then `up -d` (re-run `up -d nexusd` if it exits before Neo4j is
  up); `./list-component-versions.sh`, `GET :6286/info` and `GET :8080/v1/info` confirm the set. The homeserver runs
  with `signup_mode = "token_required"` (as CI does), so seeding signs up with an admin token.
- **App env** (`.env.local`, the local testnet example in `.env.example`): Nexus `http://localhost:8080`, CDN
  `http://localhost:8080/static`, the testnet homeserver key at `http://localhost:6286`, Homegate `:6300`, relay
  `http://localhost:15412/inbox/`, `PUBKY_RUNTIME_TESTNET=true`, `PUBKY_RUNTIME_ENV=production` (turns the staging
  sign-in guard off and sets the `pubky.app` client id). Never run the `pubky-app` compose profile (it bakes an old
  `DB_VERSION`).
- **Seeding.** User X is the migrator's semantic vector corpus (a 0.x tree with every object kind, invalid rows
  included) written by a throwaway Node script on the SDK, outside the repository, with its recovery file kept out of
  the repository too; users Y and Z and the cross-user data (follows, replies, reposts, tags, bookmarks, a followed
  collection, an avatar) are created on a 0.x `dev` build of the app; a Ring-grant user comes from the Ring simulator
  (identities are memory-only: keep its tab open). Then the dev server switches to the integration worktree and the
  persisted sessions hit the gate. The Locks cases need a Lock Server, which the stack itself does not ship: QA-5 ran
  one beside it (built from pubky/locks v0.1.0, its own Postgres, a Paykit double; _QA matrix_).
- **Inspection.** Homeserver `GET :6286/storage/<pk>/<path>` (LIST with `?limit=`), admin WebDAV `:6288/dav/<pk>/priv/…`
  (PROPFIND with `Depth: 1`), `GET :6286/events/?cursor=0&limit=200` (what Nexus consumes), Nexus `/v1/user/<pk>`
  (`epoch`), `/v1/post/<pk>/<id>`, `/v1/stream/posts/keys`; the migrator CLI `--dry-run --json` cross-checks a tree
  (`already_migrated` after a run).
- **Reset.** The testnet homeserver is in-memory: a restart (a laptop reboot included) loses every tree, and Nexus keeps
  a stale graph. Clean graph: stop `nexusd`, `redis-cli FLUSHALL`, Neo4j `MATCH (n) DETACH DELETE n`, set the homeserver
  cursor in Redis back to 0, start `nexusd`, re-seed. Never re-seed on a stale graph.
- **Cypress locally** needs the stack above plus `PUBKY_RUNTIME_PKARR_RELAYS=["http://localhost:15411"]` under
  `next start`, and runs with the Chrome-family binary (see _Cypress_).

## External questions and answers

Asked of the Nexus team, the data model's author, the Ring team and ops while the branch lived; answers are recorded
where they changed the app.

- **Nexus (answered by the carrier):** the flip trigger is the v1 `profile.json` PUT, and 0.x PUT/DEL are ignored after
  it (the app's dual 0.x delete is harmless); v1 objects written before the profile are indexed by the per-user backfill
  at the flip, which rewrites post addresses, attachments and tag ids and keeps `indexed_at`; no "post edited" burst in
  the normal flow; `tag_uri` points at the v1 copy after the flip and deleting it removes the edge; a tag on the
  profile URL counts as a user tag; v1 files are served at `/v1/static/files/{owner}/{hash}.{ext}/{variant}` with no
  metadata (no `File` object, so the app types another user's v1 attachment from its URI) and the avatar route serves a
  v1 image; `/v0/files/by_ids` skips a v1 address with a warning and a 200; kind names on `/v1` are `note`/`article`
  (strict in filters); collection items of either epoch are read back; notification URIs are the stored versionless
  address, while `parent_post_uri` and `embed_uri` are spelled as the referencing author wrote them; `/v0` is frozen
  and served until the remaining clients leave it; rate-limit buckets are shared across the two prefixes.
- **Nexus (open):** the staging and production deploy ref and dates; who forwards `/v1/*` on the proxy in front of
  Nexus, in the same deploy; the owner and timing of the `/pub/pubky.app/` cleanup pass (the Nexus gate PR calls it a
  requirement, the 2026-11-04 meeting said no deletion at release); a removal date for `/v0`; whether the extension
  Nexus picks for a copied blob always equals the migrator's; E1 (head selection by edit id) timing; the 0.x content
  shape served for migrated articles (QA-3 F-1); the delete race (pubky/pubky-nexus#1213); the watcher wedge on a
  duplicate post id (pubky/pubky-nexus#1229, _Follow-ups_).
- **Data model author:** the migrator's article cover promotion is fixed in pubky/pubky-social-specs#210 (renumbered
  references, no promotion of a referenced slot 0, transform revision 4), awaiting the maintainer's review and the
  rc.2 tag; `/priv/app.pubky/v1/` is the app namespace the port adopted (its confirmation was asked and no answer is
  recorded); `memoryHomeserver` differences from SDK 0.16.2 are test-only; Ring writes no 0.x profile at signup.
- **Ring:** scopes are approved all-or-nothing (partial approval exists only for the encryption action), with no count
  or length limit in code; the published Ring folds `/priv/social/v1/:rw` into `/priv/social/:rw`, so the grant shows
  nine scopes and adoption works; HPKE approvals with the current SDK are to be verified on staging with a real Ring
  before the release (QA used the simulator).
- **Ops:** the production homeserver reports the same features as staging and the local 0.16.2 stack; old `_next/static`
  chunks after a deploy are moot under the forced reload; storage allowances and the moderation service are release
  gates (above).
- **SDK (pubky/pubky-homeserver#798):** filed 2026-11-04 as "a session-bound event stream deadlocks the bearer refresh";
  the 2026-11-09 probe in a plain browser refuted the deadlock (the stream's lease is released as soon as its response
  headers arrive; only a proxy that buffers event streams, as Cypress's does, makes it unbounded), and the issue was
  closed on 2026-11-10 as not a deadlock (it holds the hardening note: the SDK holds the lease while `subscribe()`
  waits for the headers, with no upper bound). Polling stays for this release; the follow-up is above.
