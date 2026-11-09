# Social v1 migration (`pubky-social-specs` 1.x)

**Status: in progress** on the integration branch `feat/social-v1` (cut from `dev`; child PRs merge into it, one
final PR merges it into `dev`). The port is complete: PR-F removed `pubky-app-specs` from the app and emptied the
compliance ratchet; the docs sweep (PR-G), QA-3 against a complete Nexus and the final PR remain. The approved plan, its decisions D1–D19 and the design documents behind them live
outside the repository (`~/.claude/plans/ok-we-have-a-majestic-rivest.md`, `social-v1/{reports,designs}`); this
file is the in-repo record and is kept current by every child PR.

## Behavior

`pubky-app-specs` 0.8.1 (wasm, data under `/pub/pubky.app/`) is deprecated and no longer used by the app. `pubky-social-specs` 1.0.0-rc.1
(native TypeScript, `/pub/social/v1/` + `/priv/social/v1/`) replaces it, and `pubky-social-migrator` 1.0.0-rc.1
copies each user's 0.x tree to the 1.x layout and records the done flag `/priv/social/v1/_migrated.json`. When
the branch ships, the app reads and writes only the 1.x trees, every existing user is force-migrated through a
blocking, resumable screen, no un-migrated user can run the 1.x app, and every current feature survives except the
ones listed under _Reductions_. No new 1.x features ship in this round.

### Decisions (summary of D1–D19)

- **Branching and review (D1, D5):** one integration branch, child PRs reviewed with the code-review skill and
  Greptile; `security-review` on the foundation (capabilities), the gate and the rollout-guard PRs; `dev` merged in
  regularly through the dev-sync routine below; port and gate ship in one deploy.
- **Forced migration (D2, D11):** an un-migrated user is signed out (grant retired, Dexie cleared), told why, signs
  in again with the new scopes and migrates in a blocking `/migration` screen. The session enters the auth store
  only after the gate passes; a grant minted by the new build resumes an interrupted run instead of being logged out
  again. Browser-key accounts that never backed up get the existing backup prompt first.
- **Scope (D3, D4, D10):** no new features (drafts, slugs, alt text UI, item notes UI, published feeds, 1.1 kinds);
  the app never ships before Nexus is complete, with a retest list run in a final full-stack pass.
- **Media (D6):** no app-side media fallback; CDN rendering stays with the v1 hash as the file id.
- **Bookmarks (D7):** locally owned; the two Nexus-generated notifications that needed public bookmarks are removed.
- **Rollout guards (D8, D9):** `DB_VERSION` 3 → 4 with a loop-breaker, and a one-release forced service-worker
  reload (reverted the release after).
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
- **Kinds (D16):** the local and Nexus vocabulary stays `short`/`long`; `toLocalPostKind` / `toStoredPostKind` in
  `src/core/pipes/post/post.kind.ts` are the one crossing to the stored `note`/`article`.
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
| PR-D     | migration gate and UI (`/migration`), `migrateToSocialV1`, auth controller wiring; ADR-0026 (open, see _The migration gate_ below)                                                                                                                                                 | A               | tests, code-review, security-review; migrator service test first              |
| PR-E     | rollout guards: service-worker reload, `DB_VERSION` 4 loop-breaker; ADR-0019/0021 amendments                                                                                                                                                                                       | —               | `npm test -- src/sw.test.ts src/core/database src/providers`, security-review |
| PR-CI    | `release-docker.yml`, `build-docker-image.yml`: `NEXT_PUBLIC_DB_VERSION=4`                                                                                                                                                                                                         | E               | CI task review                                                                |
| PR-D2    | dropped-values note on the profile edit page                                                                                                                                                                                                                                       | C, D            | tests, code-review                                                            |
| PR-F     | cleanup: remove `pubky-app-specs`, `pipes.builder.ts`, mocks, Turbopack alias, wasm suppressions; empty the ratchet                                                                                                                                                                | B1–B4, C, D, D2 | full `npm test`, `npm run build`                                              |
| PR-G     | docs and Greptile sweep                                                                                                                                                                                                                                                            | after F         | review                                                                        |
| Final    | `feat/social-v1` → `dev` after the full-stack retest; PR-E2 (revert the SW policy) opened the same day                                                                                                                                                                             | all             | code-review, security-review, Greptile                                        |

File ownership: `homeserver.ts` is PR-A then PR-D only; `controllers/auth/auth.ts` PR-A (two one-liners) then
PR-D only; `src/config/*` PR-A only; the lockfile changes only in PR-A and PR-F. Each child session merges
`feat/social-v1` into its branch before opening the PR.

Known limitation on the intermediate branch (after PR-A and PR-C, before PR-D): the first bootstrap reads and
writes the notification cursor and the settings at `/priv/app.pubky/v1/`, so a pre-port Ring grant (lacking
`/priv/app.pubky/v1/:rw`) fails those requests until the gate signs it out for a new grant. Root sessions are
unaffected. PR-C also makes `AuthApplication.userIsSignedUp` probe the v1 profile alone: until the gate lands, a
session restored on an un-migrated account reads as not signed up.

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
when the gate takes over); browser and Ring signup run inline; a capability upgrade (Locks, Shop) consults the local
record only and keeps its context. Shop learns the account as `restoring` while gated.

Verification matrix (QA-1, local stack): seed user X with 0.x data on the current build, deploy the branch, restore → sign-out
explanation → Sign in → `/migration` runs → `/home`; reload mid-run resumes ("Continuing from an earlier run"); second
tab waits; sign in from a second browser after the first finished passes on the flag read; a never-backed-up browser key
sees the backup prompt first; a pre-port Ring grant sees `missing-scopes`; signup lands on onboarding with no gate screen;
QUOTA, offline (auto-retry then Retry), summary with a dropped profile image; `/post/*`, `/profile/<pk>`, `/shop` redirect
to `/migration` while gated; logout from `/migration` works with the backup prompt.

Telemetry: operation `socialMigration`, counts only (`docs/sentry.md`). VRT: new suite `auth/SocialMigration` (ten
states × desktop/mobile), CI-owned baselines. Cypress: a seeded 0.x account shows the progress screen on sign-in; a freshly signed-up one
never reaches `/migration`, and an empty or v1-only one only passes through it while the check runs (see _Cypress_).

## Compliance gate and dev-sync routine

Two gate tests keep the branch honest while it lives, and ship to `dev` with the final PR:

- `src/core/services/homeserver/write-call-sites.gate.test.ts`: every homeserver write goes through
  `HomeserverService` (test helpers under `src/test-utils` exempt) and no non-test file imports
  `pubky-social-specs/client`.
- `src/core/services/homeserver/social-v1-compliance.gate.test.ts`: scans non-test `src/**` (comments ignored,
  string literals counted) for `/pub/pubky.app`, the `pubky.app/` path fragment, `blobs/`, `*UriBuilder`,
  `PubkyApp*` classes, `PubkySpecs*`, any `pubky-app-specs` import and the Nexus `.bookmark` field.
  `PERMANENT` lists the spellings that outlive the port with a reason each; `LEGACY_RATCHET` listed every file that
  matched when the gate landed (55 files on 2026-10-30), each child PR shrank it, and PR-F emptied it. A file that
  matches outside `PERMANENT` fails the gate.
- ESLint `no-restricted-imports` bans `pubky-app-specs` and `pubky-app-specs/*` everywhere linted (`cypress/` is not),
  and the compliance gate also catches a dynamic `import('pubky-app-specs')`. The package itself is uninstalled (see
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

| Date       | `dev` SHA                      | Merged PRs                                                                                                                                                                                                       | Ported by the sweep                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-30 | `28b06db7d` (from `f63e73aad`) | #2981 (with #2982), #2983, #2965, #3002, #3001, #2897                                                                                                                                                            | `toLockContentKind` keyed on `KnownPostKind` (was `PubkyAppPostKind`) and its test; `usePostInputLock` hands the locked post `toLocalPostKind(lockedKind)`; the "locks the edited body" integration test asserts the `createLockContent` input (no `PubkyAppPost` spy); "pubky-app-specs v1.0.0-rc.1" renamed `pubky-social-specs` in ADR-0022, `docs/locks.md`, `locks.types.ts` and a test title                                                                                                                                                      | Ratchet unchanged. Cypress (flag): #2897's `cypress/plugins/seed.ts` writes 0.x through `pubky-app-specs`. New VRT `LockedPostCard.vrt` (CI-owned baselines)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-11-03 | `1c1d67295` (from `28b06db7d`) | #2952 (dependency bump), #3004, #3037, #2896, #3035, #3005, #3039, #3041, #3040, #3048                                                                                                                           | Nothing: the rubric read of the incoming `src` hunks flagged no code (Locks UI and polish, the E2E Locks stub writes through `HomeserverService`, no new page route, `(feeds)/default.tsx` only 404s)                                                                                                                                                                                                                                                                                                                                                   | Ratchet unchanged. Lockfile: dev's versions plus the branch delta, `npm install`, proven with `npm ci`. Deps-bump verification on the merged tree: typecheck, lint, format:check, both gates, full `npm test` 1032 files / 17742 passed / 2 expected fail / 2 skipped, `npm run build` (migrator chunks out of the precache, `skipWaiting`/`clientsClaim` kept, 2,254 URLs and 14.55 MB), smoke on `npm run dev` and `next start`. 82 mobile VRT baselines conflicted and keep the branch side: dispatch VRT Update Baselines on `feat/social-v1` after the merge. Cypress (flag): #2896's Locks spec, see _Cypress hand-off_                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-11-09 | `c782f7e65` (from `1c1d67295`) | #3041, #3040, #3048, #3050, #3052, #2985, #3056, #3069, #3023, #3017, #2935, #3057, #2805, #3078, #3022, #3033, #3073, #2953, #3060, #3059, #3053, #3065, #3036, #3006, #3068, #3067, #3031, #2993, #2996, #2986 | `NotificationApplication.fetchLastReadFromHomeserver` (#3006) read the now private `last_read` through `getFreshJson`, an anonymous fetch that answers 401 on `/priv/`: it reads through the session with `notFoundAsNull` instead. In the merge: `HomeserverService.subscribeUserEventStream` refuses `/priv/` paths; the last_read stream path follows the v1 file; Locks publish clean-up (#3056/#3069) on the v1 `GuardedPostBuilder` path; #3059's `notFoundAsNull` on the v1 profile probe; `locks.cy.ts` delete intercept on the v1 version path | Event-stream hub (#3006/#3068) merged with no channel: the mute list keeps polling (ADR-0014) and `NotificationLastReadSyncCoordinator` is not started, so the hub opens no request; see FIX-8. Deps: dev's versions (incl. `@synonymdev/pubky` 0.17.1, `next-themes`) minus `pubky-app-specs`, plus the two v1 packages; proven with `npm ci`. FIX-7 read sites: see _Reductions and follow-ups_. 21 VRT PNGs conflicted (Search, Settings muted users) and keep the branch side; light mode (#2993) brought the rest: dispatch VRT Update Baselines on `feat/social-v1` after the merge. Verified on the merged tree: typecheck, lint, format:check, both gates, full `npm test` 1057 files / 18226 passed / 2 expected fail / 2 skipped, `npm run build` (2,256 precache URLs, 14.50 MB, migrator chunks out, `skipWaiting`/`clientsClaim` kept), `test:vrt:check-baselines`, smoke on `npm run dev` (light and dark, no `/events-stream` request) and `next start` (worker controlling). Cypress: `locks.cy.ts` touched (QA-3 run). Ratchet unchanged (empty) |

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

## Retest list (final full-stack pass, D10)

Re-run once the Nexus branch is complete (N2b, N3, N4, N5, `tag_uri` backfill):

- v1 files on the N5 route, `{nexus}/v1/static/files/{owner}/{hash}.{ext}/{variant}` for every variant, including other
  users' files and OG images; 0.x files stay on `/static/files/{owner}/{tsid}/{variant}` and avatars (v1 images too) on
  `/static/avatar/{user}`. The prefix is staged and may still move: it is one constant, `NEXUS_V1_STATIC_PATH` in
  `src/config/nexus.ts`, derived from `PUBKY_RUNTIME_CDN_URL`. The production proxy has to forward `/v1/static/*`.
- Other users' v1 attachments without metadata: `attachments_metadata` is empty for v1 and migrated posts and `by_ids` is
  a 400 for v1 addresses, so the app reads the type from the extension and the name from the filename, with no size or
  dimensions, and requests `by_ids` for 0.x files only. A real row (own upload) wins. SVG `main` downloads and its WebP
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
- `source=collection` for a v1 collection (`nexus-contract` point 16): un-skip the test in `deep-links.cy.ts`, and
  confirm no screen depends on the stream while it is empty.
- v1 media bytes: once N5 is on the stack, extend the image tests in `posts.cy.ts` with `naturalWidth > 0` and the
  `/v1/static/files/` prefix. Until then the 0.x tests in `deep-links.cy.ts` are the only ones that load media bytes.

## Cypress (ported in PR #3055)

The suite was QA-owned while the port ran; it was ported to v1 in PR #3055 and `cypress/**` moved with it. What
the specs now assume:

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
  summary, and a signup that never reaches `/migration`. The other stages are at the unit level and in the QA matrix.

Seeding (`cypress/plugins/seed.ts`, `cypress/plugins/seed.writers.ts`): `seedUserViaApi` writes v1 through
`pubky-social-specs`. `{ legacy: true }` writes the 0.x layout by hand under `/pub/pubky.app/`, so a supporting user
who never signs in stays un-migrated, and each writer spells references the way its own clients do. That is the
backwards-compatibility coverage: `deep-links.cy.ts` opens a 0.x account's post, article, profile and collection and a
thread and reposts across both layouts, and `notifications.cy.ts` receives a 0.x account's follow, tag and reply. A signed-in
test account seeds v1 or empty, except the one that exercises the migration.

e2e runs only on pushes to `dev`/`master`, against the private pubky-stack, whose Nexus submodule must move to the
carrier before the final PR. Local runs need `signup_mode = "token_required"` on the homeserver, as CI sets it:
otherwise the invite check answers 400 and onboarding stops at Continue.

## Reductions and follow-ups

After dev-sync 3 (2026-11-09), for the coordinator:

- **FIX-8, cross-device `last_read`: built (poll).** `dev` ships live cross-device sync of the notification read
  boundary (#3006, ADR-0029): `NotificationLastReadSyncCoordinator` follows `/pub/pubky.app/last_read` on the tab's
  shared homeserver event stream (#3068). On this branch the file is `/priv/app.pubky/v1/last_read.json`, and a private
  stream needs a session, which deadlocks the SDK's bearer refresh (ADR-0014, pubky/pubky-homeserver#798). So that
  channel is not started and the hub opens no request; `NotificationLastReadPollCoordinator` polls
  `NotificationController.fetchLastReadFromHomeserver` on the mute list's cadence instead (start, visible, `online`,
  every `NOTIFICATION_LAST_READ_SYNC_POLL_INTERVAL_MS` = `MUTE_SYNC_POLL_INTERVAL_MS`, 30 s; ADR-0029 amendment).
  Verified for the poll and the `markAllAsRead` fence: the SDK's session read sends a default-mode fetch, and the
  homeserver serves `/priv/` `Cache-Control: no-store` (`private, no-cache` + `ETag` from v0.18.0), so the read is
  never a stale browser-cache hit. The channel class stays in the tree, unregistered, until #798 is fixed.
- **FIX-7, Nexus `/v1` API: read sites this sync added.** `src/core/pipes/tag/tag-cache.ts` reads the Nexus tag
  `tag_uri` to confirm a same-viewer create (lines 44-48) and carries the Nexus tag `relationship` (line 100), from the
  #2986 fixes; `src/core/services/nexus/stream/posts/postStream.utils.ts` sends the new `locked=true` stream filter
  (#3056), which the `/v1` API must accept. Already on the branch before this sync: `src/core/application/tag/tag.ts`
  (taggers `tag_uri` / `relationship`) and `src/core/models/shared/tag/tag.utils.ts`. Not changed.

Reductions (reported, not built around): bookmark-derived notifications ("post you bookmarked was deleted/edited",
"followed collection updated"); cross-device bookmark changes visible at the next sign-in only; `/feed/<id>`
deep links change once (a feed id is the hash of its filter, and the migrator re-derives every id when it copies a
0.x feed); forced sign-out and forced reload on upgrade; migrated articles with the rc.1 off-by-one render through
the migrated-article reader rule until the migrator fix lands; mute changes and the notification read boundary
(`last_read`) changed on another device appear within the poll interval (≤30 s) or on focus, not live (a
session-bound event stream deadlocks the SDK's bearer refresh, ADR-0014; the `last_read` poll is ADR-0029).

Follow-ups (not in this round): private drafts and `planPublish`, slugs, attachment alt text UI, collection item
notes UI, published feeds, `createSocialClient`, the 0.x tree sunset (who deletes `/pub/pubky.app/`, when legacy
reads stop, the `rescan` schedule), bookmark SSE, restoring the mute SSE once the SDK releases the session lock for
streams, the auth-store v4 cut-over (contingency only), 1.1 kinds; generic
file card renders only PDFs; CSV/zip/txt uploads show no card (pre-existing); text/csv attachments (spec allows
them; deferred); media GC for orphaned files (server-side or Nexus-backed reference counting): edits and avatar
changes never delete media and a post delete skips any file it cannot verify unreferenced (ADR-0027), so orphaned
files accumulate in each account's storage until then.
