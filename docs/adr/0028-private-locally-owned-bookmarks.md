# ADR 0028: Private, Locally Owned Bookmarks

## Status

Accepted — 2026-10-30

Amended — 2026-11-11 (FIX-FINAL-1, the Greptile P1 on #3140): `fetchBookmarks` holds the user's sync lock
`pubky-bookmarks-sync:<pubky>` `exclusive` from the LIST through the GETs to the reconcile, and every bookmark write
holds it `shared` across its row write and its PUT or DELETE (`withSyncLock` in `src/core/utils/sync-lock.ts`, the
helper the feed sync already used, now shared). A Web Lock is one per origin, so the lock spans every tab: the
per-tab write sequence (`captureWriteSequence`, `since`) guarded this tab only, and a bookmark made or removed in
another tab while this tab was listing was undone by the reconcile (the Neutral residual below, now resolved). What
remains is the fallback where Web Locks are unavailable, a queue in each tab.

Amended — 2026-11-11 (the Greptile P1 on #3141): a write that waited on the lock re-checks the viewer once it holds
it, before the local write and again before the homeserver write, like a mute commit (`isCurrent`, the
`captureViewerSession()` guard the controller passes). Logout and account preparation clear the shared database
without waiting for the lock, so a stale write would otherwise land in the next account's table; it writes nothing
instead, as feed writes do, and reports the skip (`BookmarkApplication.persist` and `FeedApplication.commitDelete`
resolve false, `FeedApplication.persist` null), so no hook shows a success state or toast for a write that never
happened.

Amended — 2026-11-11 (FIX-FINAL-2, the Greptile P1 on #3140, round 2): writes to one bookmark no longer overlap
each other. `persist` nests the bookmark's own lock `pubky-bookmark-write:<pubky>:<postId>` `exclusive` inside the
shared user lock, so a `deleteIdempotent` retry and its back-off, which run outside the per-path write queue, and a
PUT's retries, which that per-tab queue orders in its own tab only, are ordered against every other write to the same
bookmark in any tab: a PUT from another tab or surface during a DELETE's back-off had been erased by the retry,
leaving the row saved and the file gone until the next listing reconciled the row away. Writes to different bookmarks
still overlap under Web Locks (the fallback queue runs every write of the user one at a time, whatever the mode); the
lock order is always user then bookmark, and `fetchBookmarks` takes the user lock alone, so the two cannot deadlock.
Feed writes (`FeedApplication.persist`, `commitDelete`) take the user's feed lock `exclusive` instead of a nested
lock: they are rare, and an edit that changes the id touches two ids.

Part of the `pubky-social-specs` 1.x migration (`docs/migrations/social-v1.md`, decisions D7 and D17). Retires the
bookmark removal protection (`recentUnbookmarks`, `BOOKMARK_REMOVAL_PROTECTION_MS`) and adds a leaf fetch to the two
root-node orchestrators of ADR-0009.

## Context

`pubky-app-specs` 0.8 stored a bookmark publicly at `/pub/pubky.app/bookmarks/{hash}`, and every bookmark surface in
the app was fed by Nexus: the viewer's `bookmark` field on every post view filled the local `bookmarks` table, the
bookmarks feed paged the Nexus `source=bookmarks` stream, the bookmark count was `NexusUserCounts.bookmarks`, and the
Followed Collections section seeded itself from the Nexus bookmarks stream filtered to collections. A five-minute
in-memory guard (`recentUnbookmarks`) kept a stale Nexus response from restoring a bookmark the viewer had just
removed.

`pubky-social-specs` 1.0 makes a bookmark a **private** object, `/priv/social/v1/bookmarks/{filename}.json`, where
the filename is the base64url of the target (or `~{hash}` for a target too long for a filename) and the stored object
holds `created_at` (microseconds) and, for the overflow form only, the target. Nexus never sees the private tree. The
migrator copies every 0.x bookmark there (target rewritten to the v1 post reference), and the 0.x copy cannot be
deleted by the app: its filename is a hash the package does not expose. So for a migrated account every Nexus
bookmark field describes only those undeletable 0.x ghosts. Trusting them would bring back every post the viewer
un-bookmarks, for good.

The migration gate (ADR-0026) guarantees every signed-in account is migrated, so no epoch check is needed.

## Decision

**The local `bookmarks` table is the source of truth, hydrated from the homeserver listing; every Nexus bookmark
field is ignored.**

- **Writes** stay local-first with the documented no-rollback contract: `BookmarkNormalizer.to` (`buildBookmark`
  of the versionless v1 post reference) → `LocalBookmarkService.persist` → `HomeserverService.putBlob` of the
  package's bytes. An un-bookmark deletes the v1 file only, with `deleteIdempotent` (a missing file is the state a
  delete wants). The row is written before the sync and left in place when the sync fails; callers re-read local
  state (`useBookmark`, `useRemoveDeletedPost`).
- **Hydration**: `BookmarkApplication.fetchBookmarks(pubky, { isCurrent })`, a leaf, LISTs
  `listPrefix(pubky, 'private') + 'bookmarks/'` (`listAll`, so every page; a missing directory is empty). Each URL
  goes through the pure `BookmarkNormalizer.fromListing`: a primary filename spells the post, the overflow form needs
  a GET and `decodeObject`, and anything that is not a versionless v1 post (a web page, a profile, a post version, a
  0.x reference, another kind of file) is skipped with a warning. Order is bookmark time (D17), which the listing
  does not carry: one GET per filename not already stored locally, ten at a time with `Promise.allSettled`; a failed
  GET keeps the bookmark as made now. `LocalBookmarkService.reconcile` then, in one transaction over `bookmarks` and
  `post_streams`, deletes the rows the listing no longer names, upserts the listed ones and rewrites the single
  stream row `timeline:bookmarks:all` from the table, newest bookmark first, without a Nexus cursor. The whole run,
  LIST, GETs and reconcile, holds the user's sync lock `pubky-bookmarks-sync:<pubky>` `exclusive`, and every write
  (`persist`, the row and its PUT or DELETE) holds it `shared` (`withSyncLock`, the helper the feed sync uses: a Web
  Lock shared by every tab of the origin, a per-tab queue where Web Locks are unavailable) with the bookmark's own
  lock `pubky-bookmark-write:<pubky>:<postId>` `exclusive` inside it, so a bookmark being written in any tab is
  either listed or written after the reconcile, never undone by it, and two writes to one bookmark never overlap,
  retries included, while writes to different bookmarks do; and a fetch that outlives
  an account switch writes nothing: the `isCurrent` viewer guard is the same one every private fetch of the
  bootstrap and of the resync receives (mutes, feeds, bookmarks), and the resync's settings-store load checks it too.
- **Wiring**: `BootstrapApplication.initialize` runs it in its first `Promise.all` beside the mute and feed fetches,
  and `MigrationApplication.resync` beside them after a database recreation. Both stay depth 1 (ADR-0009).
- **One local stream**: `timeline:bookmarks:all` holds every bookmark, collections included.
  `TIMELINE_BOOKMARKS_COLLECTION` and `buildFollowedCollectionsStreamId` are gone. `PostStreamApplication` serves it
  **cache only**: a page is a slice of the row, `cacheMissPostIds` are the posts without cached details (the
  controller hydrates them through `by_ids`), the stream ends with the row, there is no Nexus page and no head poll,
  and `prepareStreamForInitialLoad` never drops it as stale or dirty (it is the only copy). The bookmark-time cursor
  and staleness branches are removed; `isBookmarkStream` still skips the mute filter (#1804) and keeps deleted posts
  for their placeholders. The posts feed drops collections on read, as before.
- **Count**: `BookmarkController.getCount()` counts the rows whose cached post is not a collection (a post not
  cached yet counts); `useBookmarksCollectionSummary` reads it with `useLiveQuery`, so it is local and live.
  `LocalBookmarkService.persist` no longer touches `user_counts`.
- **Followed Collections** walks `timeline:bookmarks:all` for the hydration side effect and keeps its live query
  (`bookmarks` × `post_details.kind === 'collection'`). A slice may hydrate only posts, so the walk goes on by
  itself while the window is not full and the stream has more, and "Show more" stays while the live query holds
  more collections than the window. Discover keeps reading the local table.
- **Nexus**: `LocalStreamPostsService.persistPosts` no longer writes `bookmarks`; `postStreamApi.bookmarks`, the
  `StreamSource.BOOKMARKS` branch of `NexusPostStreamService.fetch` and the unused `v0/post/{a}/{p}/bookmarks` endpoint
  are deleted. `StreamSource.BOOKMARKS` stays as the local stream id segment; `NexusPost.bookmark` and
  `NexusUserCounts.bookmarks` stay in the types, documented as 0.x ghosts that are never read.
- `recentUnbookmarks` and `src/config/bookmarks.ts` (`BOOKMARK_REMOVAL_PROTECTION_MS`) are deleted: nothing from
  Nexus writes the table any more.

## Consequences

### Positive ✅

- An un-bookmark sticks: no Nexus response can restore it, migrated ghosts included.
- One source for the bookmark state, the count and both bookmark surfaces; the count is exact and live.
- A listing never fights a local write, and two writes to one bookmark never fight each other, in this tab or
  another: the sync locks order them.

### Negative ❌

- **Reductions (D7, reported, not rebuilt)**: the Nexus notification "a post you bookmarked was deleted or edited"
  (`PostChangedSource.Bookmark`) stops for v1 bookmarks (the enum and renderer stay; Nexus may still emit it for 0.x
  ghosts), and "a collection you follow was updated" stops. A local recomputation would be a new feature.
- Cross-device bookmark changes appear at the next sign-in or local database reset (the bootstrap and resync
  LISTs), not live and not on a plain reload, which restores the session without bootstrapping. A bookmarks event
  stream is a follow-up, and a private stream has the same session-lease exposure as the mutes one (ADR-0014,
  pubky/pubky-homeserver#798): it waits until the SDK bounds that lease or the team accepts the exposure.
- The first bootstrap on a device costs one GET per bookmark; later ones only GET new filenames.
- The 0.x copy of an un-bookmarked post stays on the homeserver and in Nexus until Nexus stops indexing
  `/pub/pubky.app/bookmarks/`; it is invisible in the app.
- Followed Collections hydrates through the stream of all bookmarks, posts included: to fill a page with
  collections it may walk (and hydrate through `by_ids`) many bookmarked posts first, up to every bookmark when
  the account follows fewer collections than a page.
- Following a collection is a private bookmark: its creator never learns of it (no creator-side surface existed).

### Neutral ⚠️

- A failed LIST fails the bootstrap, like the mute and feed fetches beside it; a failed GET does not.
- Where Web Locks are unavailable (an insecure origin) the sync lock is a queue in each tab: a write in another tab
  during this tab's listing can be undone locally until the next listing. With Web Locks the lock spans every tab.
- Orphan `timeline:bookmarks:collection` rows from older builds are harmless (`DB_VERSION` 4 recreates them away).

## Alternatives Considered

### Keep ingesting Nexus bookmark fields until an epoch flag

Ingest `post.bookmark` only for accounts not yet migrated. Rejected: the gate migrates every account first, and the
ghosts would still resurrect un-bookmarks for migrated ones.

### No bookmark time: order by post time

Skips the GETs, but visibly reorders the bookmarks feed and Followed Collections (D17). Rejected.

### Recompute the lost notifications locally

Compare hydrated post details against the bookmarks. A new feature (D4) with its own freshness problem. Rejected.

## Implementation Notes

- `src/core/pipes/bookmark/bookmark.normalizer.ts` (`to`, `fromListing`, `fromStored`)
- `src/core/application/bookmark/bookmark.ts` (`persist`, `fetchBookmarks`, `getCount`),
  `src/core/services/local/bookmark/bookmark.ts` (`persist`, `reconcile`, `countPosts`),
  `src/core/utils/sync-lock.ts` (`withSyncLock`, shared with `FeedApplication`)
- `src/core/application/stream/posts/post.ts` (`getBookmarkStreamSlice`, the bookmark guards in
  `fetchStreamFromNexus` and `prepareStreamForInitialLoad`)
- `src/hooks/useBookmarksCollectionSummary`, `src/components/organisms/Collections/FollowedCollections`

## Related Decisions

- Depends on: [ADR-0026: Social v1 migration gate](./0026-social-v1-migration-gate.md),
  [ADR-0001: Local-first writes](./0001-local-first-writes.md),
  [ADR-0003: Streams as caches](./0003-streams-as-caches.md)
- Amends: [ADR-0009: Application cross-domain orchestration](./0009-application-cross-domain-orchestration.md)
  (the two root nodes call the leaf `BookmarkApplication.fetchBookmarks`)
- Related: [ADR-0014: Muting system](./0014-muting-system.md) (the private mutes LIST this mirrors)
