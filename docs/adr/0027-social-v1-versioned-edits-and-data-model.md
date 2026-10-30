# ADR 0027: Social v1 Versioned Edits and Data Model

## Status

Accepted — 2026-10-30

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
kinds stay `short`/`long` locally and on Nexus, item notes and alt text are preserved but not shown, no drafts, slugs
or private posts.

## Decision

- **Create** builds the first version with `PostNormalizer.to` → `buildPost` and PUTs `built.body` at `built.url`
  through `HomeserverService.putBlob`. The Dexie row holds the versionless reference (`buildUri(author, 'post', id)`)
  as its `uri`; a parent or embed is rebuilt from its composite id, never copied from a cached row's `uri`, which
  Nexus may still spell the 0.x way.
- **Edit stays local-first with a fenced head re-read.** `PostApplication.commitEdit` projects the edit onto the
  cached row (`PostNormalizer.toLocalEdit`, pure), then inside `HomeserverService.createWriteFence()` +
  `retryHomeserverWriteAfterReread` it LISTs `posts/{id}/`, picks the head (`pickHeadVersion`), GETs and decodes it,
  applies the edit (`PostNormalizer.toEdit`: spreads the head, so the lock, kept attachments' alt text, the article
  cover, item notes and `$unknown` survive), `editPost`s the next version and PUTs it. A refusal the policy retries
  runs the read again; the row converges to what was PUT; a failure restores the row and sweeps the uploads. An
  empty LIST (a post the migration skipped) is `NOT_FOUND`. Two tabs editing at once each write a version; the
  higher edit id is the head and Nexus follows event order.
- **Delete** tombstones the row, then runs `deletionPaths({ kind: 'post', id, listings })` over a LIST of both roots
  plus the 0.x copy when the grant covers `/pub/pubky.app/:rw` and a GET finds it, one sequential
  `deleteIdempotent` per path (0.x first, oldest version first, public before private). A 0.x copy the grant cannot
  delete is logged (`legacyRefused`). Media is collected afterwards unless another cached post references it.
- **Dual spellings.** A post URI is never compared against one spelling: lookups reduce it to a composite id or match
  both `postReferenceSpellings` (replies, collection membership and counts, validators, the Locks announcement).
- **Media** is hashed (`hashMedia` + `buildFile`), PUT once, and rowed as `owner:hash` with the upload's
  `content_type`, `size` and `name`. The homeserver is asked `exists` before the PUT, so a rollback never deletes a
  file another post already references; the per-tab timestamp-id guard is gone. The CDN URL keeps its path with the
  hash as the id (D6; v1 rendering waits for Nexus N5).
- **Articles** write the cover in `cover_image`; `attachments` hold inline media only and `attachment:{n}` indexes
  them directly. One reader, `resolveArticleCover`, serves the three stored shapes (ADR-0023 amendment).
- **Collections** write `{ uri, note }` items through `toNewInput` / `toStored` + `encodeContent`; notes are kept.
- **Locks** write the guarded primary as a v1 `Post` from a pipe (`GuardedPostBuilder`, `encodeObject` by kind) and
  read both the v1 and the 0.x shape; a locked article keeps its cover in slot 0 with `cover_image: null`.
- **Kinds** cross the vocabulary in one place (`toLocalPostKind` / `toStoredPostKind`); `storedKind` fails closed.
- **Limits** come from the package: the article body cap is `articleBodyMaxLength` for the body alone, in code
  points, which `getCharacterCount` already counts.

## Consequences

### Positive ✅

- Local-first semantics are unchanged for the user: the edit shows at once, offline fails exactly as before.
- Members this client does not know or show survive every edit, so other 1.x clients lose nothing.
- Content-addressed media dedupes identical uploads and needs no id guard.

### Negative ❌

- An edit costs a LIST and a GET before the PUT; a post with only a 0.x copy cannot be edited until migrated.
- The media reference check is local knowledge: a file referenced only by posts this device never cached can be
  collected (the same blind spot the blob reference check had).

### Neutral ⚠️

- `post_details.content` holds the envelope the package spells; readers stay tolerant of the 0.x spelling.
- No `DB_VERSION` bump from this slice: value shapes change inside existing columns, no index does.

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
- `src/core/application/post/post.ts` (`commitCreate`, `commitEdit`, `commitDelete`, `readHead`),
  `src/core/application/file/file.ts`, `src/core/services/local/{post,file}`
- `src/libs/post/articleCover.ts` and its consumers; `docs/data-patterns.md`, `docs/local-first.md`, `docs/locks.md`
- Gate: `write-call-sites.gate.test.ts` lists `PostApplication.commitCreate` and `commitDelete` as unfenced writes.

## Related Decisions

- Amends: [ADR-0023: Article Inline Media as Attachment Slots](./0023-article-inline-media-attachment-slots.md)
- Depends on: [ADR-0001: Local-first writes](./0001-local-first-writes.md),
  [ADR-0004: Layering and dependency rules](./0004-layering-and-dependency-rules.md)
- Related: [ADR-0022: Locks — creator-side publishing](./0022-locks-creator-publishing.md)
