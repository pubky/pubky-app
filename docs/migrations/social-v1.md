# Social v1 migration (`pubky-social-specs` 1.x)

**Status: in progress** on the integration branch `feat/social-v1` (cut from `dev`; child PRs merge into it, one
final PR merges it into `dev`). The approved plan, its decisions D1–D19 and the design documents behind them live
outside the repository (`~/.claude/plans/ok-we-have-a-majestic-rivest.md`, `social-v1/{reports,designs}`); this
file is the in-repo record and is kept current by every child PR.

## Behavior

`pubky-app-specs` 0.8.1 (wasm, data under `/pub/pubky.app/`) is deprecated. `pubky-social-specs` 1.0.0-rc.1
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
  the package (adds `text/csv`); `src/config/bookmarks.ts` retired with its mechanism; the mute SSE prefix is
  `/priv/social/v1/mutes/`; new `src/config/social-migration.ts` and `src/config/app-files.ts`.

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
| PR-D     | migration gate and UI (`/migration`), `migrateToSocialV1`, auth controller wiring; ADR-0026                                                                                                                                                                                        | A               | tests, code-review, security-review; migrator service test first              |
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

## Compliance gate and dev-sync routine

Two gate tests keep the branch honest while it lives, and ship to `dev` with the final PR:

- `src/core/services/homeserver/write-call-sites.gate.test.ts`: every homeserver write goes through
  `HomeserverService` (test helpers under `src/test-utils` exempt) and no non-test file imports
  `pubky-social-specs/client`.
- `src/core/services/homeserver/social-v1-compliance.gate.test.ts`: scans non-test `src/**` (comments ignored,
  string literals counted) for `/pub/pubky.app`, the `pubky.app/` path fragment, `blobs/`, `*UriBuilder`,
  `PubkyApp*` classes, `PubkySpecs*`, any `pubky-app-specs` import and the Nexus `.bookmark` field.
  `PERMANENT` lists the spellings that outlive the port with a reason each; `LEGACY_RATCHET` lists every file that
  matched when the gate landed (55 files on 2026-10-30). A new file that matches fails the gate; a listed file
  that stops matching must leave the list, so each child PR shrinks it and PR-F empties it.

Dev-sync routine (its own short-lived session, daily or before a child PR merges, in the integration worktree):
fetch, record the sync SHA, list the merged `dev` PRs, merge, resolve, then a narrow compliance sweep of the
incoming diff only (those PRs were reviewed on `dev`; unrelated findings are out of scope): (a) `npm run typecheck`,
the ESLint restricted import once PR-F adds it, and the compliance gate on the merged tree; (b) a targeted read of
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

| Date | `dev` SHA | Merged PRs | Ported by the sweep | Notes |
| ---- | --------- | ---------- | ------------------- | ----- |

## Retest list (final full-stack pass, D10)

Re-run once the Nexus branch is complete (N2b, N3, N4, N5, `tag_uri` backfill):

- v1 media and avatars through the CDN (N5), including other users' files, `files/by_ids` metadata and OG images.
- The epoch flip on the v1 `profile.json` and the per-user backfill (N3/N4): posts, tags and follows written before
  the profile appear.
- The "post edited" notification burst a migration's PUTs may emit.
- Tag deletion across epochs via `tag_uri`.
- `details.content` served verbatim for articles (the cover in the envelope).
- Nexus notification URI forms; the resources stream without `app`; `details.uri` after a URI-only change.
- The Cypress suite on `dev` after QA's update.

## Cypress hand-off (QA-owned, flag only)

Specs invalidated by the port, to be updated by QA with or before the final PR (e2e runs on push to `dev`):
`cypress/e2e/{posts,collections,notifications,feed,onboarding,profile,pagination,deep-links}.cy.ts` and
`cypress/support/{posts,collections,profile,pagination,nexus}.ts` (the URI regex in `nexus.ts`,
`postIdFromWriteUrl`). Seeded accounts now land on `/migration`; the "followed collection updated" scenario is
removed by product decision (D7); the settings and `last_read` paths move to `/priv/app.pubky/v1/`.

## Reductions and follow-ups

Reductions (reported, not built around): bookmark-derived notifications ("post you bookmarked was deleted/edited",
"followed collection updated"); cross-device bookmark changes visible at the next session start only; `/feed/<id>`
deep links change once (a feed id is the hash of its filter, and the migrator re-derives every id when it copies a
0.x feed); forced sign-out and forced reload on upgrade; migrated articles with the rc.1 off-by-one render through
the migrated-article reader rule until the migrator fix lands.

Follow-ups (not in this round): private drafts and `planPublish`, slugs, attachment alt text UI, collection item
notes UI, published feeds, `createSocialClient`, the 0.x tree sunset (who deletes `/pub/pubky.app/`, when legacy
reads stop, the `rescan` schedule), bookmark SSE, the auth-store v4 cut-over (contingency only), 1.1 kinds; generic
file card renders only PDFs; CSV/zip/txt uploads show no card (pre-existing).
