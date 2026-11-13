# ADR 0027: Social v1 Versioned Edits and Data Model

## Status

Accepted — 2026-10-30

Amended — 2026-10-31 (QA-1 BUG-2): media is collected on a post delete only, and only once every check says nothing
else of the owner references it; edits and avatar replacement never delete media. See _Media lifetime_ below.

Amended — 2026-11-04 (FIX-5, Nexus N5): v1 media is served at `{nexus}/v1/static/files/{owner}/{hash}.{ext}/{variant}`
(`NEXUS_V1_STATIC_PATH`, derived from the CDN runtime value); Nexus keeps no metadata for a v1 file, so another user's
v1 attachment is typed from its URI; a signup PUTs the profile naming the avatar before the avatar's bytes (A7). See
_Media_ below and `docs/data-patterns.md`, _Media reads_.

Amended — 2026-11-09 (FIX-7): every Nexus call is built under the `/v1` API, which serves the stored kind names and
drops the bookmark, file-details and tag `relationship` fields; the local vocabulary stays `short`/`long` and the
Nexus services fold every response once. One call stays on the frozen `/v0`. See _Nexus API version_ below.

Amended — 2026-11-13 (FIX-FINAL-9, the Greptile P1 on #3140, round 6): a post's create (from the local row through
the first PUT), edit and delete hold the post's Web Lock `pubky-post-write:<owner>:<postId>` exclusive, in every tab
of the origin, so writes to one post run one after another: a delete lists the version an in-flight create or edit
PUT and deletes it, and an edit queued behind a delete finds the tombstone and writes nothing; the head read and the
delete's listings are bounded by `HOMESERVER_SYNC_READ_TIMEOUT_MS`; the edit's and the delete's fences guard their
first pass; the media collection runs after the lock. See the _Create_, _Edit_ and _Delete_ bullets below.

Amended — 2026-11-13 (FIX-FINAL-10, the Greptile P1 on #3140, round 7): a collection edit is a change
(`TCollectionEdit`: add, remove, reorder, details) applied to the stored head under the post lock and to the row read
there, never the item list the controller read before the lock, so an edit queued behind another edit of the same
collection keeps that edit, and one the head already holds writes no version. See the _Edit_ bullet below.

Part of the `pubky-social-specs` 1.x migration (`docs/migrations/social-v1.md`). Amends ADR-0023 (article covers)
and the Locks reader described in ADR-0022.

## Context

`pubky-app-specs` 0.8 stored one file per post (`/pub/pubky.app/posts/{id}`), overwritten on edit, and media as a
File metadata object naming a blob. `pubky-social-specs` 1.0 stores a post as a directory of **versions**
(`/pub/social/v1/posts/{id}/{editId}.json`, the highest `editId` is the head, references stay versionless), media as
one content-addressed file (`files/{hash}.{ext}`, name and alt on the post's attachment), article covers in the
envelope (`cover_image`), collection items as `{ uri, note }`, and every object may carry members this client does not
know (`$unknown`). Writes are spelled by the package (`buildPost`, `editPost`, `encodeObject`); a hand-written
`JSON.stringify` is wrong by contract.

Three constraints shaped the port. Writes stay local-first (ADR-0001): Dexie first, the homeserver after, rollback
on failure. `HomeserverService` stays the only write path, with its retry policy and write fences (ADR-0004,
`docs/error-handling.md`), so the package's own client (`pubky-social-specs/client`), which writes through the SDK
session directly, is never imported outside `src/test-utils` (gate test). And the app changes no visible behaviour:
kinds stay `short`/`long` locally (Nexus `/v0` served them so; `/v1` serves `note`/`article`, folded at the read
boundary), item notes and alt text are preserved but not shown, no drafts, slugs or private posts.

## Decision

- **Create** builds the first version with `PostNormalizer.to` → `buildPost` and PUTs `built.body` at `built.url`
  through `HomeserverService.putBlob`. The Dexie row holds the versionless reference (`buildUri(author, 'post', id)`)
  as its `uri`; a parent or embed is rebuilt from its composite id, never copied from a cached row's `uri`, which
  Nexus may still spell the 0.x way. The local row and the first PUT run under the post's write lock (the _Edit_
  bullet), the uploads before it (no delete can target a post that has no row yet), `onPostSynced` and the tags
  after it, so a delete during the first PUT (a 429 back-off can hold it for 30 s) waits, lists the version and
  deletes it, instead of listing an empty directory and reporting the post deleted before the version lands.
- **Edit stays local-first with a fenced head re-read.** `PostApplication.commitEdit` projects the edit onto the
  cached row (`PostNormalizer.toLocalEdit`, pure), then inside `HomeserverService.createWriteFence()` +
  `retryHomeserverWriteAfterReread` it LISTs `posts/{id}/`, picks the head (`pickHeadVersion`), GETs and decodes it,
  applies the edit (`PostNormalizer.toEdit`: spreads the head, so the lock, kept attachments' alt text, the article
  cover, item notes and `$unknown` survive), `editPost`s the next version and PUTs it. A refusal the policy retries
  runs the read again; the row converges to what was PUT; a failure restores the row and sweeps the uploads. An
  empty LIST (a post the migration skipped) is `NOT_FOUND`. An edit and a delete of one post hold the post's Web
  Lock `pubky-post-write:<owner>:<postId>` exclusive (`withSyncLock`, every tab of the origin; a per-tab queue
  where Web Locks are unavailable): the edit checks the tombstone, uploads, projects, reads the head and PUTs under
  it, so an edit that starts after a delete finds the tombstone and writes nothing (`NOT_FOUND`: no upload, nothing
  to sweep, the tombstone intact, since `LocalPostService.edit` clears the tombstone flag by design and must never
  run over a delete); the fence is taken before the wait for the lock and guards its first pass (`guardFirstPass`),
  checked once the lock is held and again before the PUT, so an edit that waited across a logout, an account change
  or a session replacement writes nothing, not an upload or the projection (`SESSION_EXPIRED`), and one whose
  session changes during its uploads PUTs nothing and rolls back (the sweep of its uploads is best-effort: after a
  logout or an account switch it cannot reach the old account's files); the head read (LIST and GET as one)
  is bounded by `HOMESERVER_SYNC_READ_TIMEOUT_MS`
  (`awaitBounded`), a timeout failing the edit like a failed read and releasing the lock. Two tabs editing at once
  write their versions one after the other, the second above the first's; the higher edit id is the head. A
  collection edit is a change (`TCollectionEdit`: add, remove, reorder, details) applied to the head under the post
  lock (`CollectionPostContent.apply` inside `toEdit`) and to the row read there (`toLocalEdit`), never the item list
  the controller read before the lock, so an edit queued behind another edit of the same collection keeps that edit
  (a details edit never carries items; a reorder merges the draft against the head's items); one the head already
  holds writes no version and the row converges to the head. Edits from another device or origin are not ordered:
  Nexus follows event order.
- **Delete** tombstones the row, then runs `deletionPaths({ kind: 'post', id, listings })` over a LIST of both roots
  plus the 0.x copy when the grant covers `/pub/pubky.app/:rw` and a GET finds it, one sequential
  `deleteIdempotent` per path (0.x first, oldest version first, public before private). A 0.x copy the grant cannot
  delete is logged (`legacyRefused`). It holds the post's write lock from the local tombstone through the last
  DELETE, so it lists the post's directory only after an earlier edit's PUT in any tab and deletes that version too,
  and an edit queued behind it is refused; its listings (both LISTs and the 0.x `exists`) share one
  `HOMESERVER_SYNC_READ_TIMEOUT_MS` bound, past which it fails before any DELETE with the row tombstoned locally, as
  after a failed LIST. Its fence, taken before the wait for the lock, guards its first pass, checked once the lock
  is held, so a delete that waited across a logout, an account change or a session replacement tombstones nothing
  and sends nothing (`SESSION_EXPIRED`; `deleteIdempotent` takes no fence, so that check is the guard). The writes
  under the lock (the first PUT, uploads, the PUT and its back-off, the DELETEs) stay unbounded, as under the
  bookmark, feed and mute locks. Media is collected afterwards, once the lock is released, under the rule
  in _Media lifetime_.
- **Dual spellings.** A post URI is never compared against one spelling: lookups reduce it to a composite id or match
  both `postReferenceSpellings` (replies, collection membership and counts, validators, the Locks announcement).
- **Media** is hashed (`hashMedia` + `buildFile`), PUT once, and rowed as `owner:hash` with the upload's
  `content_type`, `size` and `name`. The homeserver is asked `exists` before the PUT, so a rollback never deletes a
  file another post already references; the per-tab timestamp-id guard is gone. A v1 file is rendered from the Nexus
  route `{nexus}/v1/static/files/{owner}/{hash}.{ext}/{variant}` (`NEXUS_V1_STATIC_PATH` in `src/config/nexus.ts`,
  FIX-5, Nexus N5); 0.x files and every avatar stay on `/static` (D6: no app-side homeserver fallback).
- **Articles** write the cover in `cover_image`; `attachments` hold inline media only and `attachment:{n}` indexes
  them directly. One reader, `resolveArticleCover`, serves the three stored shapes (ADR-0023 amendment).
- **Collections** write `{ uri, note }` items through `toNewInput` / `toStored` + `encodeContent`; notes are kept. An
  edit is a `TCollectionEdit` change applied to the stored head (see _Edit_), so any edit rewrites a stored `layout`
  this client does not know to the default through `parse` (pre-existing).
- **Locks** write the guarded primary as a v1 `Post` from a pipe (`GuardedPostBuilder`, `encodeObject` by kind) and
  read both the v1 and the 0.x shape; a locked article keeps its cover in slot 0 with `cover_image: null`.
- **Media lifetime** (amended 2026-10-31). A content-addressed file is shared: the migrator dedupes identical blobs
  and identical uploads collapse to one `files/{hash}.{ext}`, so an avatar, several posts and a collection cover can
  name the same file, and every earlier version file of a post (immutable) still references what a later edit
  removed. The package leaves collection to the app (`planDelete` returns `mediaGcCandidates`: "only the app knows
  whether something else still uses one"). So:
  - **Edits never delete media.** Removing or replacing an attachment, an article's `cover_image` or a collection's
    cover only writes the next version; the old file stays. Replacing the avatar never deletes the previous file.
  - **A post delete** hands the post's attachments (when the row keeps no connections) and its homeserver cover to
    `FileApplication.commitDelete`, which deletes a file only when all of these say it is unreferenced: the local
    cache (`LocalFileService.isReferencedElsewhere`: another cached post's attachments or content, the owner's cached
    profile image), the owner's `profile.json` read fresh (`getFreshBytes` + `decodeObject(…, 'user')`), and a fresh
    Nexus view (`by_ids`, `force`) of every post a LIST of the owner's public `posts/` names, attachments and
    content. A check that fails, or a Nexus view missing a listed post (indexing lag, an author Nexus has not
    indexed: its streams answer an empty page, never a 404, so the LIST is the completeness proof), keeps the file
    with a `Logger.warn`, never an error or a toast. An orphan is the safe failure. A read that fails outright (a
    homeserver or Nexus outage) is still reported by its service like any other data read; lag is not a failure
    (`by_ids` answers 200 without the post) and reports nothing.
  - **A rollback** (`commitDeleteUploaded`) deletes only files the failed write itself created: the upload asked
    `exists` first, and a `preexisting` file stays. The same verified delete serves a discarded composer session's
    uploads (`FileController.commitDelete`).
  - Private trees are not checked: the app writes no private object that references public media.
- **Kinds** cross the vocabulary in one place (`toLocalPostKind` / `toStoredPostKind`); `storedKind` fails closed.
- **Nexus API version** (amended 2026-11-09, FIX-7). Every Nexus URL is built by `buildNexusUrl` under
  `NEXUS_API_VERSION` (`v1`, `src/config/nexus.ts`); the endpoints are spelled without a version. `/v1` serves the
  same routes as `/v0` with the data model's names and shapes, so the app crosses once more at the **Nexus read
  boundary**, in the Nexus services, before anything is stored or compared:
  - **Wire kinds vs local kinds.** `/v1` spells `details.kind` and a notification's `post_kind` as `note`/`article`
    and takes only those names in a `kind=` filter (`short` is a 400). The local tables, the persisted stream ids
    (`timeline:all:short`) and the 120 read sites keep `short`/`long` (D16). `PostNormalizer.fromNexus` folds every
    post a service returns (`toLocalPostKindFromNexus`: `toStoredPostKind` then `toLocalPostKind`, fail-open, so
    `unknown` and any name this client does not know stay as served and the post renders as a note, never hidden,
    never written back since `storedKind` fails closed); `NotificationNormalizer` already folded `post_kind`. The
    URL builders (`buildPostStreamUrl`, `searchApi.byContent`) send the stored name (`toNexusPostKindFilter`); the
    server-side metadata fetch (`fetchUserAndPostForMetadata`) folds the one detail it reads outside the services.
  - **Tag `relationship`.** `/v1` drops it; `tag_uri` (the viewer's own tag file, `null` otherwise) says the same.
    `TagNormalizer.fromNexus` derives `relationship = relationship ?? (tag_uri != null)` on every tag and taggers
    response, so the local `NexusTag` keeps a required `relationship` and the tag cache pipes are untouched; the
    `*Wire` types in `nexus.types.ts` are the responses before this fold. A request without a viewer derives `false`.
  - **Dropped fields.** The bootstrap `files` and the post `attachments_metadata` are gone with their types: the
    page's 0.x attachment metadata is fetched once (`FileApplication.fetchFilesForPosts`, before the posts are
    persisted) on bootstrap, the stream and the TTL refresh. `NexusPost.bookmark` and `NexusUserCounts.bookmarks`
    are optional on the wire (`UserCountsModel` stores `0` on every row, no `DB_VERSION` change); the `/v0` body
    flag `include_attachment_metadata` is gone. `exclude_kinds` and `source=bookmarks` are never sent.
  - **The one `/v0` call.** `filesApi.getFiles` (`POST v0/files/by_ids`) names its version explicitly: a 0.x
    attachment URI carries no extension or type, `/v1` serves no file details, and un-migrated authors keep such
    posts until they open the new app, so without it their images would degrade to file cards for every viewer
    (D10). It is asked for 0.x addresses only, once per fetched page of posts before they are persisted
    (`FileApplication.fetchFilesForPosts`, in place of the inline `attachments_metadata` `/v0` served; at most
    `NEXUS_FILES_BY_IDS_MAX_URIS` per request) and per card for any row still missing. **Sunset:** remove it (with
    `NexusFileService.fetchFiles` and `FileApplication.fetchFiles*`) when `/v0` gets a removal date or every author
    has migrated. The compliance gate lets no
    other file under `src` name `v0`.
- **Limits** come from the package: the article body cap is `articleBodyMaxLength` for the body alone, in code
  points, which `getCharacterCount` already counts.

## Consequences

### Positive ✅

- Local-first semantics are unchanged for the user: the edit shows at once, offline fails exactly as before.
- Members this client does not know or show survive every edit, so other 1.x clients lose nothing.
- Content-addressed media dedupes identical uploads and needs no id guard.
- A shared file is never deleted on the strength of local knowledge alone (QA-1 BUG-2), and an edit never strips an
  earlier version of its media.

### Negative ❌

- An edit costs a LIST and a GET before the PUT; a post with only a 0.x copy cannot be edited until migrated.
- Orphans accumulate: every file an edit or an avatar change drops, and every file a delete could not verify, stays
  on the homeserver until media GC moves server-side (homeserver or Nexus reference counting, a follow-up in
  `docs/migrations/social-v1.md`).
- A post delete with media costs a profile GET, a LIST of the owner's posts and one `by_ids` request per 50 posts.
- What the checks cannot see: an edit another device made within Nexus's indexing window (Nexus still serves the
  previous head), an earlier version of another post, and an account whose posts Nexus never indexes, whose media
  is then never collected.

### Neutral ⚠️

- `post_details.content` holds the envelope the package spells; readers stay tolerant of the 0.x spelling.
- No `DB_VERSION` bump from this slice: value shapes change inside existing columns, no index does.
- The post write lock orders the tabs of one origin only. What it leaves: another device's or origin's edit can
  still land after this device's delete listing (Nexus follows event order); on an insecure origin the queue covers
  one tab; a collection edit uploads its new cover in the controller (`PostController.commitEditCollection`) before
  the lock, so one queued behind a delete still uploads and then sweeps that cover; a collection change applied to a
  head another device's version replaces between this device's LIST and its PUT is still last-writer-wins (no
  compare-and-swap; `pickHeadVersion` picks one), and the controller's local no-op (an item the row already shows)
  trusts the row; the edit's generic error toast says "Try again" for an edit a delete refused.

## Alternatives Considered

### The package client (`createSocialClient`)

`posts.head` / `posts.edit` / `posts.delete` do the LIST and the ordering for us, but write through the SDK session
past the retry policy, the write fences and the per-path write queue. Rejected: one write path (ADR-0004).

### Network-before-Dexie edits (PR 2928)

Reading the head before the local write loses the local-first guarantee and makes an offline edit fail late with
nothing shown. Rejected.

### Keeping the article cover in slot 0

Other 1.x clients and the migrator put it in `cover_image`; slot 0 would make our articles unreadable to them and the
migrated-shape heuristic permanent. Rejected (D14).

## Implementation Notes

- `src/core/pipes/post/{post.normalizer,post.head,post.collection,post.kind,post.reference}.ts`,
  `src/core/pipes/file/file.normalizer.ts`, `src/core/pipes/locks/{guardedPost.builder,locks.parser}.ts`
- Nexus read boundary: `src/core/services/nexus/nexus.utils.ts` (`buildNexusUrl`, `carryNexusResponseStartedAt`),
  `PostNormalizer.fromNexus`, `UserNormalizer.fromNexus`, `TagNormalizer.fromNexus{,Taggers}`, applied in
  `src/core/services/nexus/{post/post,user/user,bootstrap/bootstrap,stream/posts/postStream,stream/users/userStream}.ts`
- `src/core/application/post/post.ts` (`commitCreate`, `commitEdit`, `commitDelete`, `readHead`),
  `src/core/application/file/file.ts` (`commitDelete`, `commitDeleteUploaded`), `src/core/services/local/{post,file}`
- Media lifetime tests: `src/core/controllers/post/post.media.integration.test.ts` (the BUG-2 regression included)
- `src/libs/post/articleCover.ts` and its consumers; `docs/data-patterns.md`, `docs/local-first.md`, `docs/locks.md`
- Gate: `write-call-sites.gate.test.ts` lists `PostApplication.commitCreate` and `commitDelete` as unfenced writes.

## Related Decisions

- Amends: [ADR-0023: Article Inline Media as Attachment Slots](./0023-article-inline-media-attachment-slots.md)
- Depends on: [ADR-0001: Local-first writes](./0001-local-first-writes.md),
  [ADR-0004: Layering and dependency rules](./0004-layering-and-dependency-rules.md)
- Related: [ADR-0022: Locks — creator-side publishing](./0022-locks-creator-publishing.md)
