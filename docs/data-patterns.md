# Data Patterns

Rules for data handling patterns. Based on ADR-0002, ADR-0003, ADR-0005, ADR-0006.

## Composite Post IDs (ADR-0002)

Posts use composite key format: `author:postId`

### Format

```typescript
// Composite IDs are plain strings — no branded type
const id = 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy:0035QZPT4QG00';
//           ^author (z-base32 key)^                             :^postId (13 Crockford chars)^

const COMPOSITE_ID_DELIMITER = ':' as const;
```

A post's composite id is form-agnostic: a v1 post is a directory of versions (`/pub/social/v1/posts/{id}/{editId}.json`, ADR-0027), and `buildCompositeIdFromPubkyUri` takes the segment after `posts` from a versionless reference, a version path and the 0.x spelling (`/pub/pubky.app/posts/{id}`) alike, so one post has one key whichever form a Nexus response or a 0.x reference spells. The reverse direction is `postReferenceSpellings(pubky, id)` (`src/core/pipes/post/post.reference.ts`): every lookup by URI matches both spellings, and every new reference is written in the v1 one (`docs/local-first.md`).

A file's composite id is `owner:hash`: v1 media lives at `files/{hash}.{ext}`, and `buildCompositeIdFromPubkyUri` strips the extension for the `files` domain (a 0.x file id has no dot). Every file-keyed table (`file_details`, the local files store) is keyed that way, so a v1 upload and a 0.x row never share a key.

### Utilities

```typescript
// Real: src/core/models/models.utils.ts
function buildCompositeId({ pubky, id }: CompositeIdResult): string {
  return `${pubky}${COMPOSITE_ID_DELIMITER}${id}`;
}

function parseCompositeId(compositeId: string): { pubky: Pubky; id: string } {
  const sep = compositeId.indexOf(COMPOSITE_ID_DELIMITER);
  const pubky = compositeId.substring(0, sep);
  const id = compositeId.substring(sep + 1);
  return { pubky, id };
}

// Also: build from pubky:// URI
function buildCompositeIdFromPubkyUri({ uri, domain }: CompositeIdParams): string | null;
```

### Why Composite IDs?

- Globally unique (author + timestamp)
- Stable for joins between Dexie tables
- Prevents collisions after migrations
- Retains chronological ordering

## Streams as Caches (ADR-0003)

Streams are cached sequences in Dexie with ordering metadata.

### Stream Structure

```typescript
// Real: src/core/models/shared/stream/stream.type.ts
type BaseStreamModelSchema<TId, TItem> = {
  id: TId; // Stream identifier (enum value like "all:latest:all")
  stream: TItem[]; // Array of items (composite post IDs, pubkeys, or hot tags)
};

// Example: PostStreamModelSchema = BaseStreamModelSchema<PostStreamId, string> & { tailCursor?: number }
// Example: UserStreamModelSchema = BaseStreamModelSchema<UserStreamId, string>
// Example: TagStreamModelSchema  = BaseStreamModelSchema<TagStreamTypes, NexusHotTag>
```

Post stream rows also carry `tailCursor`: the Nexus `last_post_score` of the deepest page fetched into the
stream, which every cache→Nexus seam resumes from. It is a plain row field (not an index), so it needs no
`DB_VERSION` bump. Never derive a stream cursor from a post's `indexed_at` — Nexus bumps it on edit/delete
without moving the post in the stream (`docs/local-first.md`, _Stream Pagination Cursors_).

### Stream Operations

```typescript
// Reading from stream (fast, local)
// Real: src/core/services/local/stream/posts/posts.ts
const posts = await LocalStreamPostsService.read(streamId);

// Fetching or reading a stream slice
// Real: src/core/controllers/stream/posts/posts.ts
await StreamPostsController.getOrFetchStreamSlice({ streamId, viewerId, cursor, limit });

// Getting the head position of a stream
const head = await StreamPostsController.getStreamHead({ streamId });
```

### Stream Staleness

```typescript
// TTL-based staleness check (no stream_ttl table — streams use post/user TTL)
// Real: src/core/application/ttl/ttl.ts
const stalePostIds = await TtlApplication.findStalePostsByIds({ postIds, ttlMs: getTtlPostMs() });
```

## TTL Management (ADR-0005)

Per-entity TTL tracking for cache freshness.

### TTL Tables

```typescript
// Real: src/core/models/shared/ttl/ttl.schema.ts
// Both user_ttl and post_ttl share this schema (no stream_ttl table)
interface TtlModelSchema<Id> {
  id: Id; // Pubky (for users) or composite post ID (for posts)
  lastUpdatedAt: number; // Timestamp of last refresh — staleness = now - lastUpdatedAt > ttlMs
}
```

### TTL Operations

```typescript
// Real: src/core/application/ttl/ttl.ts
// Find which entities are stale (lastUpdatedAt older than ttlMs)
const stalePostIds = await TtlApplication.findStalePostsByIds({ postIds, ttlMs });
const staleUserIds = await TtlApplication.findStaleUsersByIds({ userIds, ttlMs });

// Force refresh stale entities from Nexus
await TtlApplication.forceRefreshPostsByIds({ postIds: stalePostIds, viewerId });
await TtlApplication.forceRefreshUsersByIds({ userIds: staleUserIds, viewerId });
```

### TTL on Writes

```typescript
// Local services update TTL automatically when persisting data
// Real: src/core/services/local/post/post.ts
// LocalPostService.create() internally updates post_ttl.lastUpdatedAt

// Forgetting TTL update = stale cache that won't refresh
```

### TTL Constants

```typescript
// Real: src/libs/runtime-config/runtime-config.schema.ts (runtime-configurable via
// PUBKY_RUNTIME_TTL_*; read through getters like getTtlPostMs() from @/config/sync)
ttlPostMs: 300_000,  // 5 minutes (posts)
ttlUserMs: 600_000,  // 10 minutes (users)
ttlBatchIntervalMs: 5_000, // 5 seconds between batches
```

### Viewport TTL subscriptions (UI)

`useLocalFirstQuery` (and therefore `usePostDetails` / `useUserProfile`) never re-fetches a row that is already in IndexedDB. A cached row on screen is refreshed by a `TtlCoordinator` subscription (ADR-0012). The usual path is a viewport subscription via `useTtlSubscription`; `useIsFollowing` also holds a user reference for as long as the Follow control is mounted (not viewport-gated). The coordinator overwrites the row and bumps its TTL, and the live query re-renders every consumer.

Post and user subscriptions are both reference counted, so nested surfaces that track the same entity cannot unsubscribe each other. Each surface still subscribes once per entity it renders; an embed whose enclosing surface already subscribes the same id skips its own subscription, since a second one would only add a redundant `IntersectionObserver`:

| Surface                             | Subscribes                                           | Notes                                                                                                               |
| ----------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `PostMain`                          | its post id; also the original for flattened reposts | Feed / thread / single-post cards; collection-share originals remain owned by `PostPreviewCard`                     |
| `PostPreviewCard`                   | the original post id                                 | Repost + link embeds, share/repost dialogs                                                                          |
| `CollectionCard` (`landing`)        | the collection id                                    | Profile Collections tab, `/collections` sections, search                                                            |
| `CollectionCard` (`embed`)          | —                                                    | Always inside `PostPreviewCard` or `PostMain` → `PostContentBase`, which subscribe                                  |
| `CollectionHero`                    | the collection id                                    | The single-collection page's subscriber for its envelope                                                            |
| `PostSavePicker` ("Also in" rows)   | each other-user collection id                        | The save picker's list of collections that curate the post; the post reference also holds the curator               |
| `ProfilePageHeader`, `UserListItem` | the user pubky                                       | Profile header and user lists                                                                                       |
| `useIsFollowing`                    | the follow target                                    | Not viewport-gated: data hook without a DOM node; relationship rows are viewer-relative and only TTL refreshes them |

The collection envelope (`name`, `description`, `cover_image`, `items`, `layout`) is one cached post row, so a single refresh updates the title, cover, and item count everywhere at once. A collection write is a change (`TCollectionEdit`: add, remove, reorder, details) applied to the stored head under the post's write lock, never the item list the controller read before it, so an edit queued behind another edit of the same collection keeps that edit, a details edit never carries items, and a change the head already holds writes no version (ADR-0027). For every viewer, including the owner and guests, the single-collection feed renders the complete local `items` membership in envelope order. `TimelineFeed` reads it and `TimelineFeedContent` projects it over the collection's pagination with `useCollectionStreamMembership`; `useStreamPagination` stays a plain Nexus paginator, and the projection is separate from the raw Nexus page IDs and offsets. An unresolved local read is distinct from a resolved empty collection. A lagging or refreshed Nexus stream cannot erase locally saved items or reintroduce removed members; the trade-off is that an item Nexus indexed before this device's envelope learned of it (added on another device) appears once the envelope refreshes, through the TTL coordinator or a pull-to-refresh, which refetches the envelope with the stream. For the owner, that refetch is skipped during the indexing retry window (`ttlRetryDelayMs`) after a local collection write: Nexus can still serve the pre-save envelope with a newer `indexed_at`, and persisting it would undo the save. Collection creates, edits and compensating rollbacks stamp the optional `post_details.localUpdatedAt` alongside TTL; Nexus persistence retains this timestamp without extending it. Ordinary cache reads only freshen TTL and never suppress an explicit refresh. Here `localUpdatedAt` records the last local write, not an unacknowledged edit: the window is a heuristic, not a guarantee, and a save Nexus indexes later remains exposed to refresh. A skipped request does not schedule a delayed retry; a later pull or the TTL coordinator refreshes the envelope. When the envelope drops an item whose row the stream already served, that row also leaves the raw page so the next skip offset follows Nexus's shorter list.

Cached members render immediately. Uncached members wait for the existing stream's batch hydration before mounting their cards. Until the stream settles, the feed stays in its loading-more state (the list and card layouts show the loading row below the visible cards) and scroll-to-load stays disarmed, so no page request races the initial or eager loads; a pure local read checks member details, relationships, author details and repost originals before exposing a cached card. Once the stream settles, or the eager-load cap stops it, remaining unindexed or unavailable members use the normal card fallback. A failed hydration does not release the members it could not load: a stream page whose batch hydration fails (post details, their attachment metadata or authors) is reported as a failed page, like author-scoped search, with its cursor not consumed, and the feed shows its error instead of a column of unavailable placeholders for posts that may exist, including beside the owner's Add Content cell, where the error takes the empty state's place (the shared timeline renderers do the same for Bookmarks). A hydration cut short by a viewer session change is no outage: that page is discarded and requested again. Already displayed cards stay mounted during refresh or membership reads, subject to current membership and removal suppression.

Transient collection interaction state is scoped to the collection; `CollectionTimelineFeed` remounts the feed when the collection or viewer changes. The save picker retains its card while open or while its membership update is pending, then releases it on close/completion/unmount; releasing is what removes a card the current collection no longer lists. A completed save or rollback keeps that collection pending until a fresh local read resolves with current membership, including intervening writes from other pickers; the picker's other collections stay interactive meanwhile, and a restored card also waits for the feed's local read before releasing retention. Pending removals remain hidden until committed or rolled back, and a committed removal also ends the card's retention; automatic membership updates never invoke the explicit prepend action that clears removal suppression. Successful explicit inserts may bridge the interval before the live envelope read catches up; only the optimistic insert that follows a confirmed save (Add Content, the FAB) does this. The generic insert, which the composer calls before its collection save, leaves a non-member to membership, so a post whose save fails never appears. Muting filters the projected display without permanently removing membership, so unmuting restores eligible items; while the stream hydrates, a projection whose ready members are all muted keeps the feed loading rather than empty. Deleted/unavailable post placeholders still belong to the collection until their membership is removed.

## Pipes Normalization (ADR-0006)

Pipes normalize external data to domain shapes.

### Pipe Responsibilities

```typescript
// Pipes DO:
// - Transform external shapes → domain shapes
// - Validate input data
// - Enforce pubky-social-specs (the package is the only validator)
// - Return normalized objects

// Pipes DON'T:
// - Perform IO (network, database)
// - Have side effects
// - Access stores
```

### Pipe Structure

```typescript
// Real: src/core/pipes/post/post.normalizer.ts
export class PostNormalizer {
  // Create a new post: `buildPost` validates, encodes and names the object (`url`, `body`, `object`).
  // The kind is the data model's (`note`, `image`, …, `article`); the local row keeps `short`/`long`.
  static to(post: PostValidatorData, specsPubky: Pubky): BuiltPost {
    return this.build(() => buildPost(specsPubky, { kind: post.kind, content: post.content, ... }), 'buildPost');
  }

  // Edit an existing post: spread the decoded head version, apply the change, and let `editPost`
  // name the next version. The application reads the head (`listAll` → `pickHeadVersion` →
  // `getBytes` → `decodeObject`) inside a write fence; the pipe only transforms it.
  static toEdit({ owner, head, edit }: TToEditParams): BuiltPost {
    return this.build(() => editPost(owner, head.url, { ...head.post, ...changes }), 'editPost');
  }

  // The Dexie projection of the same edit, written before the homeserver round trip
  static toLocalEdit({ row, edit }: TToLocalEditParams): TLocalPostEdit { ... }

  // `ValidationError` / `ArgumentError` become `Err.validation(INVALID_INPUT, …)` with the
  // package's `code`, `field` and `limit` in the context, and nothing else is caught.
  private static build<T>(builder: () => T, operation: string): T { ... }
}
```

### Where to Use Pipes

```typescript
// Controllers call pipes before delegating to application
// Real: src/core/controllers/post/post.ts
class PostController {
  static async commitCreate({ authorId, content, isArticle, tags, attachments, coverImage }: TCreatePostParams) {
    // Each file is hashed (`hashMedia`) and named by `buildFile`: the same bytes name one file
    const fileAttachments = await Promise.all(attachments.map((file) => FileApplication.toFileAttachment({ file, pubky: authorId })));
    const post = PostNormalizer.to({ content, kind: postKind, attachments: fileAttachments, coverImage: coverAttachment }, authorId);
    const tagList = tags?.map((tag) => TagNormalizer.from({ taggerId: authorId, ... }));
    await PostApplication.commitCreate({ compositePostId, post, fileAttachments, tags: tagList });
  }
}

// Application also normalizes data before persisting: a stored-object edit is a fenced
// read-modify-write of the published bytes, never a rebuild from the local row
// Real: src/core/application/profile/profile.ts
class ProfileApplication {
  private static async commitChanges({ pubky, changes }) {
    await this.withProfileLock(pubky, async () => {
      const url = buildUri(pubky, 'user');
      const fence = HomeserverService.createWriteFence();
      const user = await retryHomeserverWriteAfterReread(fence, async () => {
        const stored = await HomeserverService.getFreshBytes(url); // every retry pass reads again
        const next = this.applyToStored({ url, stored, changes }); // decodeObject → applyChanges (a spread: `$unknown` survives) → encodeObject
        await HomeserverService.putBlob({ url, blob: next.body, fence });
        return next.user;
      });
      await LocalProfileService.updateDetails(user, pubky); // once, after the write landed
    });
  }
}
```

### Never Return Un-normalized Data

```typescript
// BAD: Returning raw external shape
return await HomeserverService.request<RawSettings>({ method: HttpMethod.GET, url });

// GOOD: Normalize through pipes
// Real: src/core/application/settings/settings.ts
const settingsJson = await HomeserverService.request<RawSettings>({ method: HttpMethod.GET, url });
return SettingsNormalizer.from(settingsJson);
```

## Article Inline Media (ADR-0023)

Article bodies (`kind: long`) embed images, videos, audio and PDFs with one markdown form. The media type is never in the body.

- **Composer form** references an author-owned file URI: `![alt](pubky://{author}/pub/social/v1/files/{hash}.{ext})`. A file inserted this session is staged, not uploaded: `useInlineMediaUpload` keeps it in memory under a placeholder media URI built from random bytes (`buildFile`), so nothing reaches public storage before the publish (#2687, #2684). A create hands the staged files to `PostController.commitCreate` with the cover as its own `coverImage` (one upload batch, left in place on failure, ADR-0027); an edit uploads them through `uploadStaged` right before `commitEdit`, which takes URIs only, so a save that fails after that upload leaves them for the session's discard sweep (a composer closed during the save keeps them instead, since the client cannot tell a refused write from an unacknowledged one; a page closed in between loses the sweep; making the edit batch controller-owned like the create is the follow-up, #2878). A file kept from the published article keeps its real URI, v1 or 0.x.
- **Published form** references a slot: `![alt](attachment:{n})`, where `n` indexes `post.attachments = [...inline first-appearance, ...unreferenced originals]` (spec cap 10) and the cover rides in the envelope as `cover_image` (a media URI or `null`). `serializeArticleBody` / `deserializeArticleBody` in `src/libs/post/articleInlineMedia.ts` convert between the two (`slotOffset` 0 for a published article, 1 for a locked one whose cover keeps slot 0) and block publishing hand-typed refs, blob URIs, author file URIs in raw HTML or reference-style definitions, and over-cap bodies. The envelope's `title` and `body` are the composer's; `ARTICLE_MAX_CHARACTER_LENGTH` is the data model's body cap, counted in code points.
- **Cover resolution** (`resolveArticleCover`, `src/libs/post/articleCover.ts`, ADR-0023 as amended): rule A, an envelope cover is the cover and the slots are `attachments` (this app's articles, and a 0.x article the pinned migrator, 1.0.0-rc.2, gave a cover: it promotes an unreferenced image at slot 0 and renumbers every `attachment:{n}` to `attachment:{n-1}`); rule A′, a 0.x article migrated by 1.0.0-rc.1, which promoted slot 0 without renumbering (envelope cover, body references none at 0), reads its slots as `['', ...attachments]` so `attachment:1` still finds the first inline file, and stays because the migrator never rewrites a copy; rule B, no envelope cover means the 0.x slot-0 rule: `attachments[0]` is the cover unless the body references `attachment:0`, and only when its file is an image, which its file row says (`slotZeroContentType`, never the markdown; a v1 row is synthesized from the URI's extension). Until the row is read the slot is the `coverCandidate` and nothing paints as a cover, so a PDF or video there never flashes as one (`settleArticleSlotZero` turns the candidate into the cover or nothing once the row is known); the edit composer keeps slot 0 as the cover unless the row says otherwise, so a slow row never costs the article its cover. Nexus serves every migrated article in this shape. Every consumer goes through it (`usePostArticle`, `usePostAttachmentsMedia`, `useVisualFeedTiles`, `postCoverPreload`, `PostArticleDetail`, the edit composer, the OG text); a first edit of a 0.x article moves its slot-0 cover into the envelope. The cover stays image-only. The local files store keeps a same-session cover apart from the inline entries (`articleCovers[postId]`, `setArticleCover`), so `posts[postId]` stays index-aligned with the slots.
- **Type from metadata**: the reader resolves each inline slot through `useAttachmentsMetadata` and matches rows by `uri` (Dexie returns key order, never request order); a same-session publish uses the local files store entry's `type`; unlocked content uses the bytes the reader holds; an external `https:` URL is typed by its extension (`inferMediaKindFromUrl`). Unknown is rendered as an image.
- **Ownership invariant**: a ref resolves only when `attachments[n]` is a file URI owned by the author (`isAuthorFileUri`); otherwise an unavailable placeholder renders with no request.
- Inline slots never leak into post-media surfaces (lightbox, list thumbnails, Visual feed, OG text): those read the cover slot only.

## Homeserver Trees and App Files

The app reads and writes five trees of the signed-in account on its homeserver. Objects of the social data model
(`pubky-social-specs`) are built, decoded and encoded by the package; the two files the app owns outside that model
are plain JSON under the app's private namespace (`src/config/app-files.ts`).

| Tree                    | Holds                                                                                  | After the migration gate                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `/pub/social/v1/`       | `profile.json`, posts, follows, tags, files                                            | the public tree; `listPrefix(pubky, 'public')`                                                   |
| `/priv/social/v1/`      | bookmarks, mutes, feeds, private post versions, the migration flag `_migrated.json`    | the private tree; `listPrefix(pubky, 'private')`                                                 |
| `/priv/social/` (rest)  | the Locks reader directories `unlocked/` and `purchases/` (`docs/locks.md`)            | not social objects; covered by the same `/priv/social/:rw` grant                                 |
| `/priv/app.pubky/v1/`   | `settings.json` and the notification read cursor `last_read.json` (`APP_PRIVATE_PATH`) | app-private files, read by this app only                                                         |
| `/pub/pubky.app/` (0.x) | what a 0.x client wrote; the migrator copies the social objects, not the app files     | read only as a fallback (`listPrefix(pubky, 'legacy')`); never written; deleted with the account |

**Profile.** `ProfileController.commitCreate` builds the profile with `UserNormalizer.to` (`buildUser`) and PUTs
`built.body` with `putBlob`. An edit (`ProfileApplication.commitUpdate` / `commitUpdateStatus`) is a fenced
read-modify-write of the stored object: `getFreshBytes(buildUri(pubky, 'user'))` → `decodeObject` →
`UserNormalizer.applyChanges` (a spread, so `$unknown`, the members a newer client added, survive on the profile and, matched by URL, on every link the edit keeps) → `encodeObject`
(every profile rule re-checked) → `putBlob({ fence })`. A missing v1 profile is a deleted account (`GONE`); there is
no fallback to the 0.x profile, which only an un-migrated account has, and `AuthApplication.userIsSignedUp` probes
the v1 profile alone.

**Feeds.** A feed's id is the hash of its filter (`buildFeed` derives it from the filter alone, `FeedNormalizer`), so it
changes on every filter edit: a save writes the new file, swaps the local row and deletes the old file through
`deletionPaths`, and `/feed/<id>` deep links to the old id stop resolving (an accepted reduction). The migrator derives
the id of every 0.x feed it copies the same way, so a migrated feed's id changes once.

**App files.** Settings and `last_read` are read v1 → 0.x → create: the v1 file when it exists, else the 0.x file,
else defaults (settings) or a cursor at the current time (`last_read`). The first `SettingsApplication.initializeSettings`
and the first `BootstrapApplication.initialize` after the gate write the v1 file from the 0.x one, and neither copy
replaces a newer v1 file it finds on its re-read right before the PUT. The `last_read` copy (and a fresh cursor when
neither file exists) goes through the forward-only writer, `NotificationApplication.markAllAsRead`: it re-reads the v1
file on every pass, the first included (`guardFirstPass`), and never writes a timestamp at or below the stored one. The
settings copy, and the first write when no file exists, reads the v1 file again right before its PUT and writes only
while that file holds no settings; when it does, the local settings are compared with it instead (one more reconcile at
most). The homeserver has no conditional PUT, so one round trip between that re-read and the PUT remains open, the
same window mark-all-read's forward-only write has (ADR-0029); the `last_read` poll re-adopts the newest value. The copy is forward only: once the v1
file exists the 0.x one is never read again, and it is never deleted (D15). Every write goes to the v1 URL
(`SettingsNormalizer.buildUrl`, `LastReadNormalizer.buildUrl`).

**Media lifetime** (ADR-0027 as amended). A media file is content addressed and therefore shared: the avatar, posts
and covers of one owner can name the same `files/{hash}.{ext}`, and earlier post versions keep referencing what an
edit removed. Edits (attachments, an article's `cover_image`, a collection's cover) and avatar changes never delete
a file. A post delete passes its attachments and cover to `FileApplication.commitDelete`, which deletes a file only
when the local cache (other posts' attachments and content, the cached profile image), a fresh `profile.json` and a
fresh Nexus `by_ids` view of every post a LIST of the owner's public `posts/` names all leave it unreferenced; a
failed check, or a listed post Nexus does not serve, keeps it with a `Logger.warn`. A create or edit that
fails deletes nothing it uploaded: a pending post of the same bytes may use the file, and a retry reuses it (ADR-0027).
Orphans accumulate until server-side media GC (follow-up).

**Media reads.** A file row's key is `owner:id`, the id being a v1 hash or a 0.x id, and the URL builder takes the row's
`uri` as well: a v1 route needs the whole name (`{nexus}/v1/static/files/{owner}/{hash}.{ext}/{variant}`, a bare hash is a
400), a 0.x route the id (`{nexus}/static/files/{owner}/{id}/{variant}`). Nexus keeps no metadata for v1 files, so only
a file this device uploaded has a row; `FileApplication.getMetadata` answers any other v1 file with what its URI says
(`FileNormalizer.toV1FileDetails`: the type from the extension, the filename as its name, no size or dimensions), a real
row winning for the URI it describes, and `FileApplication.fetchFiles` never sends Nexus a v1 address. Because the key
drops the extension, the same bytes uploaded under two types leave one row (the later upload's), which answers only its
own URI; the other URI is answered from the URI, and consumers match a v1 attachment to its row by `uri`, a 0.x one
by id (its row stands however Nexus spelled the row's `uri`).

**Signup order (Nexus "A7").** Nexus ignores a new user's file uploads until their first v1 `profile.json` is indexed, and
for good: `useProfileForm`'s create path hashes the avatar first, PUTs the profile naming it, then uploads the bytes. An
upload that fails leaves a profile naming a file that is not there yet; the avatar falls back until the retry (the form's
"Try again!", which writes both again) or a later change. An existing user's avatar change uploads first, as before.

**Account delete and export** (`ProfileApplication.commitDelete` / `downloadData`) walk all five trees:
`listPrefix(pubky, 'legacy')`, `listPrefix(pubky, 'public')`, the whole `/priv/social/` (the v1 tree, the flag and
the Locks reader directories) and `/priv/app.pubky/v1/`. The export names every file by its path under the account.
The deletion removes every other file first, deepest first, then the profiles in the order `deletionPaths({ kind:
'user' })` gives: the 0.x `profile.json`, then the v1 one. `/pub/app.locks/` and `/priv/app.locks/content/` are
Lock Server contracts under a read-only grant and are left alone.

## Dexie event dispatch patch

`patches/dexie+4.4.7.patch` replaces the dependency's recursive default event chain with an iterative,
immutable listener list. Long-lived `liveQuery` subscriptions can otherwise exhaust the browser call
stack when Dexie broadcasts a mutation (#2225). Reverse subscription order, `false` short-circuiting,
callback context and the listener snapshot during dispatch stay unchanged; custom event chains are
untouched. This does not cap subscriptions or change database contents, indexes or versions.

The patch covers only `dist/dexie.js`. Generated dispatchers hold their immutable chain head under a
private symbol, avoiding WeakMap overhead when unsubscribe rebuilds the chain and avoiding collisions
with callback properties. Original line positions are preserved, so the stock source map remains exact
outside the replaced helper; mappings inside that helper are approximate. All root package exports use
this CommonJS distribution, including ES imports through `import-wrapper.mjs`. The unused ESM and
minified CDN distributions are not patched.
`patch-package --error-on-fail` applies the patch during `postinstall` and fails installation if it
cannot apply. The Docker dependency stage copies `patches/` before `npm ci` because postinstall
silently skips patching when that directory is absent.

After pulling changes to `patches/`, stop the dev server, run `npm ci`, and clear `.next/cache` before
restarting the app or building it, even when `package.json` and `package-lock.json` are unchanged.
Webpack's persistent cache can reuse the old dependency code when its package version is unchanged;
reinstalling dependencies alone does not invalidate it. Clean builds without a saved cache are unaffected.

On a Dexie upgrade, update the manifest and lockfile, then bypass postinstall for the unpatched check:

```bash
npm ci --ignore-scripts
npm test -- src/core/database/franky/dexie-events.contract.test.ts
```

If the stack-depth or large-listener regression still fails, regenerate the Dexie patch for the new
version; remove it only when the unpatched dependency passes the contract tests. This temporary install
skips all lifecycle scripts, so after regenerating or removing the patch, run `npm ci` normally and
rerun the contract tests to verify the final installation. Clear `.next/cache` before restarting the app.

## Data Model Reference

All tables defined in `src/core/database/franky/franky.ts`.

### Schema changes

`franky.ts` declares a single `this.version(DB_VERSION).stores({...})`; there is no incremental migration chain. `DB_VERSION` is `Env.NEXT_PUBLIC_DB_VERSION` (`src/config/database.ts`). When the stored version differs, the client deletes and recreates the local database (`recreateDatabase`), which is user-visible local data loss until the next sync. Bumping `DB_VERSION` or changing a table's index map is therefore a deliberate, reviewed change with its own callout in the PR, never a side effect of a feature. See `docs/adr/0019-dexie-recreate-on-version-mismatch.md` (supersedes ADR-0007).

Version history: 3 → 4 on 2026-10-30 for the social v1 port (`docs/migrations/social-v1.md`): the index map did not change, but value shapes inside existing columns did (feed enums became the data model's strings, file ids became `owner:hash`, post `uri` spellings changed, bookmarks became locally owned), and a recreate is the only way to prove that every client starts clean. The default lives in `src/libs/env/env.ts` and `.env.example`, and the Docker workflows pass the same value as a build arg, so a bump is the app change plus a CI-task PR. A second mismatch in one page lifetime (a tab of another build recreating the database underneath) is refused with `DatabaseErrorCode.VERSION_CONFLICT` and the recovery screen says "Close other Pubky tabs, then retry." (the loop-breaker, ADR-0019). The re-initialization after an unexpected close never calls `Dexie.exists()`, whose probe of a missing database creates and deletes a stub and so closes the other tab's connection; it keeps Dexie's auto-open off, reads the version with a versionless open, looks again while the database is missing, and once this page has recreated the database treats one that another tab's delete left missing or unreadable like another version; after a forced close (storage eviction), a missing database is created and an unreadable one recreated (ADR-0019 amendment). The re-check window (`DB_CLOSE_RECHECK_DELAYS_MS`, about 5 s) is a bound: a database still missing after it shows the conflict screen, and Retry recovers.

### Runtime connection recovery

`franky.recovery.ts` reconnects once after an eligible structured IndexedDB `UnknownError` or `AbortError` on an already-open connection (ADR-0030). A Dexie abort's available `inner` cause is classified instead of its outer name, excluding quota, constraint and schema failures. An abort with no available cause retains the bounded fallback; absence of a Sentry inner field does not establish why a transaction aborted. `ModelBase` uses recovery only for reads; `LocalTagCacheService` uses it around a complete local-only transaction after its failure has rolled back every write. The replay rereads rows and rechecks revision/session guards. Never wrap an individual write, an existing caller-owned transaction, or a callback with network/store side effects. Other failures propagate through the existing `Err.database` boundary; a failed reopen retains the operation error with the open failure as its cause.

Actual Dexie `BulkError` and `ModifyError` aggregates are eligible only when they contain at least one failure and every nested failure is connection-eligible. Mixed non-connection failures, empty aggregates and cyclic causes propagate without reconnecting. This covers a connection loss while a `bulkPut` request is pending, but still requires the whole local-only transaction to roll back before replay. Stream reads and custom model readers that bypass `ModelBase` remain outside the current recovery scope.

Concurrent failures on the same native connection share a reconnect. Every close not issued synchronously by recovery invalidates pending work, including explicit close, delete, version change, browser termination and failed reopening. Account cache cleanup also invalidates pending work and suspends new recovery until all overlapping clears finish; a later open cannot revive stale work. Recovery schedules exactly one `Dexie.asap` task inside a Dexie promise before closing, so admitted caller transactions can create their native transaction first. Inside that task it rechecks lifecycle ownership, then closes and initiates reopening synchronously. ADR-0030 permits this single task boundary (`setImmediate` or `setTimeout(0)` in the pinned Dexie version), not a retry timer loop, backoff or network request. Each caller's Dexie promise scope retains its `liveQuery` observations, covered by concurrent subscription regression tests. Recovery does not replace a reopened connection while a replay on it is unfinished, so a fresh failure there propagates without recovery. Only a recoverable connection error during replay blocks further reconnects from that reopened connection until an unrelated close or account cleanup resets recovery state. Quota, constraint and programming errors during replay leave that fence unchanged; otherwise eligible connection failures can recover once all pending replays settle. Recovery does not delete data, create a missing database or change the schema. Initial opening keeps its separate bounded initialization retry.

`DatabaseProvider` ignores only the synchronous close event owned by recovery; a successful reconnect keeps the mounted page and its state intact. An unrelated close still reinitializes the database, including while recovery is awaiting the new connection. If reconnect would create a missing database, a temporary `populate` handler aborts creation and is removed before normal initialization. The failed open emits an ordinary close, and the original operation is not replayed. Normal initialization then detects the missing database and reports `wasDbReset`, allowing the existing migration resync flow to run. That initialization is the after-close path of the mixed-build loop-breaker above (`allowRecreate: false`, no `Dexie.exists()`): once this page has recreated the database, a reopen that finds another version, or finds the database missing after another connection's `versionchange`, ends on `VERSION_CONFLICT` instead of a reset.

### User Tables

```
user_details       — Profile data (name, bio, image, links, status) + social_graph_status folded in from the Nexus user view
user_counts        — Follower/following/post counts
user_relationships — Follow/mute relationships (viewer-relative: only written when the fetch carried a `viewerId`)
user_connections   — User connection data
user_tags          — Tag collections per user
user_ttl           — Cache staleness (id, lastUpdatedAt)
notifications      — Notification records
```

### Post Tables

```
post_details       — Post content, kind, attachments, timestamps
post_counts        — Reply/repost/tag counts, plus `collections` (how many collections curate the post; bumped locally when the viewer's own collections change)
post_relationships — Author, parent, repost relationships (`replied` names a parent post only: the app writes `null` for an external resource parent, as Nexus serves it; `reposted` holds the post's `embed`: a post, or an http(s) link; `embedded` is the web link Nexus serves for a post's `embed`, normalized, and a web `embed` in `reposted` is read the same way, never as a repost; an edit that changes a note's web embed writes it to `embedded` and clears a web link from `reposted`)
post_tags          — Tag collections per post
post_ttl           — Cache staleness (id, lastUpdatedAt)
```

### Stream Tables

```
post_streams       — Post composite IDs in streams
unread_post_streams — Unread post stream tracking
user_streams       — User pubkys in streams
tag_streams        — Hot tags in streams
```

### Other Tables

```
file_details       — File attachment metadata, keyed `owner:hash` for v1 media (`owner:id` for 0.x rows)
bookmarks          — The owner's bookmarks (composite post id, `created_at` in ms): the source of truth for the private `/priv/social/v1/bookmarks/{base64url(target)}.json` objects Nexus never sees; hydrated by a LIST at bootstrap (one GET per new filename for its time), which also deletes rows the listing no longer names and rewrites the one local stream `timeline:bookmarks:all` (ADR-0028)
hot_tags           — Trending tag snapshots
feeds              — Custom feed definitions: the owner's private `/priv/social/v1/feeds/{id}.json` objects, id = hash of the filter (reach, layout, sort, content, tags, domain_tags), kinds as the data model spells them (`note`/`article`); hydrated by a LIST at bootstrap, which also deletes rows the listing no longer names
moderation         — Content moderation state
locks              — Cached lock descriptors and readable post metadata
```

## Tags, Follows and Mutes on the Homeserver

The three relationship objects are built by `pubky-social-specs` and written only through `HomeserverService`
(`putBlob` of `built.body`); the 0.x copy of each is never written again. Deletion differs per object because of
where the copies can be found (ADR-0014, ADR-0020):

| Object | Path (`pubky-social-specs`)                                                                                                                                                                                   | Write                                                                                                                                                     | Delete                                                                                                                                                                                                                                                       | Read                                                                                                                                                                                                                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tag    | `/pub/social/v1/tags/{hash}.json`; the hash covers the target and the stored label. Target: the post reference `buildUri(author, 'post', id)` or the profile URL `buildUri(user, 'user')`, never the bare key | `TagNormalizer.from` → `buildTag`; the stored label is trimmed and ASCII-lowercased (`canonicalizeTagLabel`, also the fold hashtags and the composer use) | The viewer's file is resolved, never rebuilt: the local `TagMutation.uri`, else Nexus `tag_uri`, both through `TagNormalizer.toOwnTagUri` and the session `canWrite` preflight, then one DELETE (#2832). No `deletionPaths`: the 0.x copy has a different id | Nexus (tags are public and indexed)                                                                                                                                                                                                                                                                    |
| Follow | `/pub/social/v1/follows/{followee}.json`                                                                                                                                                                      | `FollowNormalizer.to` → `buildFollow`                                                                                                                     | `FollowNormalizer.toDeleteUrls` → `deletionPaths({ kind: 'follow' })`: the 0.x copy first, then the v1 one, each through `deleteIdempotent` (a 404 is an already absent copy)                                                                                | Nexus; `UserApplication.ensureModerationFollow` probes `exists(buildUri(follower, 'follow', bot))` on the v1 path only (`privacy.moderationBot` in settings is the idempotency guard)                                                                                                                  |
| Mute   | `/priv/social/v1/mutes/{mutee}.json`, **private**: only the owner's session reads it, no indexer sees it                                                                                                      | `MuteNormalizer.to` → `buildMute`                                                                                                                         | `MuteNormalizer.toDeleteUrls` → `deletionPaths({ kind: 'mute' })`: the 0.x copy first, then the v1 one, each through `deleteIdempotent`                                                                                                                      | `MuteApplication.fetchMutedUsers` LISTs `/priv/social/v1/mutes/` only (`parseUri(url).kind === 'mute'`, no union with the 0.x directory); another session's changes arrive by the `MuteListSyncCoordinator` poll (start, visible, `online`, every 30 s), never a session-bound event stream (ADR-0014) |

**External resources (web links).** A social v1 Tag `uri`, Bookmark target and CollectionItem `uri` may be any scheme,
so an external resource card writes them against the link, without a local row (no Dexie table holds web links).
The link is the one `getResourceTarget` picks, the same whether a Pinakes answered or not: the link as the user
had it (a post's link, a pasted link), folded the way every writer stores it and without the query parameters
Pinakes drops as tracking; for an item without one (a search row of an identifier, its page), the identifier's page
as Pinakes publishes it; for an identifier with no page (`mbid:`, `imdb:`, barcodes, podcast keys), a web link of
the card (its own, the first one people wrote, its `open_in` page). The tracking parameters and the pages are
Pinakes' published lists (`data/spellings.json` in pubky/pinakes), built into the app as
`src/libs/post/linkRules.data.json`: regenerate it with `node scripts/pinakes-link-rules.mjs <commit>
<spelling_rules>` when Pinakes publishes a new version. The composer drops those parameters from a link once it is
pasted or a space ends it, as one undoable edit, and from a prefilled text (share target, "Post about this link");
"Add Post" drops them from the link it adds. An article's body is posted as written. Nexus keeps every spelling of
a link apart, so the card's `uri`, the link as written and the card's `refs` and `aliases` (at most 5) are read
along and shown as one; new writes go to the picked link, and a removal (tag, bookmark, collection item) goes to
every spelling holding it.

- Tag: `TagController.commitCreateResource` / `commitDeleteResource` → `buildTag(viewer, link, label)` →
  `putBlob`, or one DELETE of the viewer's own Nexus `tag_uri` (else the built file, whose id hashes link and
  label). Read once the card is first on screen: the links read around the same moment go in one optional
  `POST /v1/stream/resources/by_ids` (100 per request; Nexus must apply its `limit_tags` / `limit_taggers` query
  as on by-uri), which the client probes for once per page load; else, or when a batch fails,
  `GET /v1/resource/by-uri` per link, six at a time; both time out after 10 s (`NexusResourceService`, a 404 or a
  skipped link is "nobody tagged it"). A feed card reads the other spellings only in a `by_ids` batch, the
  resource page on any Nexus. An accepted write is applied to that shared Nexus answer, since Nexus indexes it
  with a delay, and every card of the link follows that answer (`subscribeResourceTags`).
- Bookmark: `BookmarkController.commitCreateResource` / `commitDeleteResource` → `buildBookmark(viewer, link)`;
  the viewer's state comes from one listing of their bookmarks per page load (`useResourceBookmarks`), read the
  first time a card's save picker opens and again after a bookmark changes (closed, the Save button shows the
  collections only). The bookmarks table, feed and count stay post-only (ADR-0028;
  `BookmarkNormalizer.fromListing` skips web targets).
- Collection item: `PostController.commitUpdateCollectionResource`, the same edit as a post item. A collection
  holds web links and Pubky objects only: a canonical link of another scheme (`isbn:`) gives way to the first
  spelling that is a web link.
- Reply: `PostController.commitCreate({ parentUri })` → the post's `parent` is the resource's URI as written,
  checked by `PostValidators.validateExternalParentUri` (a web link or `isbn:`/`doi:`/`osm:`/`geo:`/`urn:`), never
  with `parentPostId`. The footer's Reply button uses the same rule (`isExternalParentUri`,
  `src/libs/post/externalParent.ts`) and is disabled otherwise. Locally `replied` stays `null`; like Nexus, it is
  listed only in `author_replies` and counted as a reply (no timeline, author stream or post thread).

**Card images.** A Pinakes card's images, a link preview's and the visual timeline's YouTube thumbnails never load
from their host in the viewer's browser: every one goes through the app's `/api/image` (`getResourceImageUrl`,
`getCardPreviewImageUrl`, `getLinkImageUrl`, `getYouTubeThumbnailUrl`), as site icons go through `/api/favicon`.
`?uri=<card link>&src=<image>` reads that card from the app's Pinakes (`GET /v1/resources/by-uri`, read-only, never
`POST /v1/resolve`) and reads the image only when the card is settled (anything but `pending`: a `missing` card keeps
showing its last image, dimmed) and carries it: its own `image`, a latest episode's art (`episodes`), a settled group
member's `image` (`GET /v1/groups/{id}`, the image it may borrow), or, with `&episode=<title>`, the art of the show's
episodes by that title (`GET /v1/resources/{id}/episodes`). With `&og=1` a settled card with no image of its own shows
its own web link's preview image (`getCardPreviewLink`), so a card never names a page by itself. `?link=<link>&src=`
is for a link with no card (`ResourceLinkCard`, `GenericPreview`): it serves only that page's `og:image`, the page
`/api/og-metadata` reads anyway. `?xpost=<post ID>&src=` serves only a photo or video still on `pbs.twimg.com` that
the X post the app's server read (`/api/x-post`) carries. `?youtube=<video id>&variant=hq720|mqdefault` reads only
`https://i.ytimg.com/vi/<id>/<variant>.jpg`. Anything else is a 404 with no image read; Pinakes unset or not knowing
the card is a 404, a page or image host failing for now a 502. Images are JPEG, PNG, WebP or GIF by their bytes, at
most 4 MB, read within 8 s over at most three redirects, each hop address-checked (`fetchGuardedImage`, shared with
the icon route), an `https` image never followed to `http`; cards are kept five minutes (thirty seconds while unknown
or pending, read once more before a 404 for an image they lacked), link previews an hour, images a day, all in bounded
caches (`BoundedReadCache`) that keep a value until a new one replaces it. Pinakes reads and page reads each come
from a budget of their own, part of the Pinakes one kept for cards already known; after Pinakes answers 429 or 5xx (for
its `Retry-After`, else 30 s) it is not asked for a while, and a read not made now answers from the card, group or
episodes known before, expired or not, else 503. A link Pinakes refuses is a card it does not know; none of these
answers is reported. Images and pages are read at most 16 at once and 2 per site (`getFaviconSite`, every redirect
hop of an image for its own site; a page's redirects take none, its budget bounds them); `?link=` leaves part of the
page budget to cards' own links, a page not read now answers with its preview known before, and YouTube thumbnails
have a budget and a cache of their own. The budgets are per server instance and there is no limit per client here (a
forwarded address can be spoofed): a deployment limits `/api/image` per client at its edge, keyed by the address its
own proxy trusts. A card asks a failed route image once more, then shows its next image or its type tile, never the
image's own address. A card image that is a YouTube thumbnail (`getYouTubeThumbnailVideoId`; Pinakes names
`hqdefault`, which has bars above and below the video) shows the video's 16:9 `hq720`, else `mqdefault`, from
`?youtube=`, and the image as the card names it only when neither loads; a song's, album's or playlist's cover then
shows the thumbnail's middle square, where a label upload's cover sits.
A link straight to an image file (`GenericPreview`), with platform embeds up front off, is read by Pinakes on view
like a platform's link (`resolveOnView`): its card is an image's whose image is the file, served by `?uri=<link>&src=`
as any card's; with no card it shows as a finished link card (its name and site). Up front on, the file loads from
its host as before. A link straight to a video or
audio file shows, with platform embeds up front off, a card from the app's origin (its kind, site and file name) with
Play in its header; the press loads the file's player inside the card, started by it, and the same pill closes it.
What remains, route by route: `/api/image` reads any public raster image that a real, settled card or a real page's
preview names (anyone can have Pinakes read a page of theirs), within those caps; with `?xpost=` only a photo or video
still on `pbs.twimg.com` of an X post the app's server read; with `?youtube=` only `i.ytimg.com` thumbnails.
`/api/x-post` reads X's syndication answer for any well-formed post ID, and gives the browser that post's MP4 address
on `video.twimg.com`, loaded only on the press of its Play, with no Referer (a frame of its own). `/api/map` reads only the allow-listed paths of
`tiles.openfreemap.org`. A calendar occurrence's image other than its calendar's is not one the image route serves.

**Players and posts in a card.** With "Show platform embeds up front" off (Settings, Links & Media; the default),
a link with a Pinakes card looks as it does with them on, on every surface (a post's embed, the composer, Edit and
Repost, feeds and collections, the resource page, and a YouTube, Vimeo or X link that is only in a post's text), and
nothing is asked from the service before a press. Where a service's player would show up front (a link that is
itself on that service, unless Card (no player) ranks above it in Players), the app draws that player from the card's
data in its place (`useCardPlayer`'s `embed` → `ResourcePlayerFacade`): the player's height (a video's 16:9 box, an
audio player's own height), the cover or still through `/api/image`, the title, the card's summary line and the
service's mark, one button named "Play <title> on <service>". A press on it (click, tap, Enter, Space) loads the
service's player in its place with autoplay, as the page's player; there is no separate Play and no dialog: the press
is the consent. The header holds only the service switch (Card, then the services): picking a service loads its player
at once, started (the pick is the press), and Card shows the card and unloads the player. A player let go (other
media started, the dock closed it) gives way to its drawing again. A generic link, a podcast that plays in its card,
and a card whose Card ranks first show the card as before. A map or document frame that is the link's own, and the
post frame of a social post whose card has its text (`getResourcePost`), show the card first, the frame in the switch (a post with no text: see
below). A settled social post shows as a post from the card's own data at once (`getResourcePost`,
`ResourcePost`: author, handle, text, date, its image through `/api/image`), with nothing loaded from its site; when
it carries no video (`showsPostFromCard`) there is nothing to press. One with a video (a video frame or stream, a
`VideoObject` type, or an X video thumbnail as its card or link preview image: `hasPostVideo`) keeps a press: an X
post "Play on <site>", another site's post its frame in the switch. The press opens the site's post inside the card
and its video plays there, inside the post (a post's frame
takes no autoplay parameter); a press inside that frame counts as its start, so what played stops, and the frame
is loaded anew, stopped, when other media starts (`ResourcePlayerFrame`'s `holdsVideo`). A player the app's player
host lays over its card is reached from the card by a skip link (`PlayerSlot`'s "Go to the player", shown while focused, acting only when pressed). An X post whose card does not tell it (no card, or one without its text: unread,
pending, failed) is read by the app's own server (`/api/x-post?id=`, `XPostApplication`: X's
syndication host at the one address `react-tweet` reads, only the post's ID sent, as `PubkyApp/<version>`, nothing
of the viewer's, no redirect, 512 KB and 6 s; a 200 that is no JSON object is a failure, one that is no post none; posts kept an hour in a
bounded cache, a per-instance budget, X paused 30 s after a 429, 5xx or no answer) as soon as the link's card read has
answered (not waiting for a resolve, and also with Pinakes unset), and shows as a post the same way (`useXPostCard` →
`withXPost`; on the resource page too, a link with no card included), its image through `?xpost=`. A video in it shows
its still and Play: the press plays its MP4 (`video.twimg.com` only, at most 720p) in the app's own player inside the
post (`XPostVideo`: a same-origin frame whose document sends no Referer, as X's video host refuses another site's;
the page's own referrer policy is untouched; a page-wide Content-Security-Policy added later must allow
`media-src https://video.twimg.com` and the frame's inline style), read from `/api/x-post` only then when the card told the post itself
(`XPostPlayer`; the read starts as the viewer reaches for Play, pointer down or focus); one with no MP4 (a live
broadcast), or a video that errs or has no data within 8 s, loads X's post there instead. A post whose card has no post text (`getResourcePost` is `null`:
Pinakes could not read it, its name is the link's shape alone such as "Post on instagram.com", the host of its link or
its site, or the site refused the read, `facts.blocked`) but whose own link has a post frame (Pinakes' `embed` of kind `post`, any site: Instagram,
Mastodon, an X post the server could not read either) shows its card, and in it, under its text, the press where the
post will show (`ResourcePostPress`, drawn with the parts of the players' drawing: "Show post", the site's mark through
`/api/favicon` and the Play glyph, one button named "Show post from <site>"). The press loads the site's post in
its place inside the card at the card's width, which stays; Close above it gives the card back (the focus moves to
Close, back to the press, or to the card when the post could not be shown). There is no pill; the switch lists only
the card's other services, when it has any. An X post with no text but a video keeps "Play on <site>"; another
site's (an Instagram reel) has the press; a post with no frame is its plain card, with nothing to press. Instagram's
frame rests at its laid-out width plus 220 px (the shape of its captioned photo embed; 760 px until the width is
known) until it says its height by a message (`MEASURE`), which the frame takes from that frame's window and origin only (`readFrameHeight`); it is never wider
than 658 px (its oEmbed blockquote's `max-width`), left-aligned, and laid out at 326 px at least, scaled to a
narrower card (as Apple's players are, `getMinFrameWidth`). Any other post frame keeps its height from Pinakes, else
420 px. A card whose site refused Pinakes' read never reads its link's own preview (that page is a sign-in wall, its
image the site's logo), shows no description (Pinakes' "Blocked by the site."), and the resource page's Details say
so in one plain line ("instagram.com didn't share this post's details.", `getBlockedNote`) in place of a `blocked`
row.
A YouTube, Vimeo or X link Pinakes does not know (a post's embed or a link in its text) is sent to Pinakes once its
box is near the screen (`usePinakesCard`'s `resolveOnView`: `POST /v1/resolve` from the viewer's browser, so it counts
against the viewer's own Pinakes budget; once per link per page load, a refusal kept, never a `pubky://` or pubky.app
link; at most two asks at once, the others in turn; a `pending` answer is not polled by its ID, the link's on-screen
card read follows it). After a 429, a 5xx or no answer, no link is asked until its `Retry-After` has passed (a minute
without one, ten at most), and that link may be asked once more by a later view. A generic link only in a post's text
is sent the same way only when its own preview says nothing (no title and no image: `GenericLinkPreview`). The card's skeleton holds the place meanwhile (at most
`PINAKES_SLOW_READ_MS`); a link still without a card shows its own preview as a card (`NativeEmbedLinkCard` on
`ResourceLinkCard`: the page's title and site, a YouTube video's thumbnail from `?youtube=`, else the page's preview
image from `?link=`), the platform's Play (Show for a post) in its header, its embed loading inside the card on the
press.
With platform embeds up front on, the service's player or embed shows up front in place of the card's body.

**Places and events (maps, agenda, dates).** A place's or an event's card shows where it is with `ResourceLocation`
(`src/components/molecules/ResourceMap/`): a map of its `point` when that is on the map (`getMapPoint`), else, with
only an address, one line; an event that names neither (an online one, a venue known by name alone) gets no map and
no destination. "Open in Maps" (`ResourceMapsMenu`) is on every one of these surfaces: the map's corner, the line's
end, a selected pin's card; its `geo:` entry ("Default maps app") shows on Android only, where something opens it. Maps are MapLibre GL on OpenFreeMap's tiles (`@/config/maps`), with these rules:

- Nothing loads before a map is on screen (`ResourceMap`: no tile, and no library unless a search's Map button
  started it on hover or focus), and the map is removed when it leaves the screen or its card goes away, so a feed
  never holds one WebGL context per card. Until the style is read the box shows a loading skeleton; the pins go on
  then, before the tiles. Every request of a map (style, TileJSON, tiles, fonts, sprites) goes to the app's own
  `/api/map?p=<path>` (`toPrivateMapRequest` → `toMapRouteUrl`), without credentials or a referrer, so a map is
  drawn at once, also with platform embeds up front off, with nothing asked from another host. The route reads
  `tiles.openfreemap.org` only, and only the paths `toMapTileRequest` allows (the two styles, the planet's TileJSON
  and vector tiles to zoom 14 of a tile set that TileJSON named in the last two days; a set newer than every one
  seen has the TileJSON read again past the cache, at most once a minute, before it is refused, Natural Earth relief to zoom 6, the styles' Noto Sans font ranges, the sprites; any
  other path is a 400 with nothing read), no redirect, 2 MB and 8 s per file, each served as its pattern's type
  (a PNG only when its bytes are one) with nosniff, sandbox and same-origin headers, the app naming itself
  (`PubkyApp/<version>`). Files are kept a day (a style an hour, the TileJSON ten minutes, as long as browsers
  and the CDN are told to keep it) in a bounded cache (64 MB, 2048
  files), at most 24 reads at once, others waiting their turn up to 4 s (a cold map asks for 12-16 files, two maps
  20-30; MapLibre never asks again for a tile that failed), from a per-instance budget; a read whose body breaks
  off is a failure, not a missing file, and the host is not asked for 10 s after it failed. An address on another
  host, or with a query, goes to the route with no path (refused), never to that host. With platform embeds up front
  off, a card that draws its own map offers no map service's frame (Pinakes' OpenStreetMap `embed`, `useCardPlayer`): it would be a second map; a
  card with no map drawn (no point, a row) keeps it. Nothing of the resource or the viewer is put into a tile
  address or an "Open in Maps" link.
- The library, its stylesheet and its worker file are one lazily imported unit (`src/libs/maps/maplibre.runtime.ts`),
  kept out of the service worker's precache (`docs/pwa.md`, _Precache diet_).
- A card's map is inert until tapped; any map asks for two fingers or a modifier key, so the page's scroll never stops
  on it. Without WebGL, when the style or first tiles fail, or when a lost WebGL context does not come back
  (`MAP_CONTEXT_RESTORE_MS`; MapLibre restores one itself when it restarts its workers), the map says so and keeps
  "Open in Maps". The element MapLibre draws into is sized by its box (`size-full`), never by `absolute`: the
  library's stylesheet sets its `position` outside any layer and would leave it without a height.
- The resource page of a place lists Nearby (`ResourceController.fetchNearbyPlaces`: `near` + `radius`, nearest
  first, one more row asked than shown, never the place itself) as real cards; those cards and a selected pin's say
  where they are on a line (`ResourceLocationProvider` `row`) instead of drawing one more map each.
- A calendar's occurrences are search rows that share the calendar's `id`, `uri` and `refs`. They are told apart by
  `getResourceInstanceKey` (`uid`, `recurrence_id`, `start`) and never merged or read by their link (that read answers
  the calendar): the search hook keeps them with `cards: true`, `useEventInstances` reads details only for events that
  are no occurrence, and `ResourceInstanceCard` renders a row from its own card. A list of links (`uris`) cannot carry
  them, so the agenda (`SearchEventAgenda`) and the results map (`SearchResourceMap`) read `cards`.
- What `useEventInstances` reads is kept for the row as it was read (its whole contents, not its id alone) and only
  while the list has that row: a row that comes again with another start, point, name or status, or a list that comes
  again after another, is read again through the cards' cache, and an answer asked for an earlier row or list is
  dropped. What a row says itself is always the row's; details the cache holds from before the event changed (another
  name, read status, start, end or point than the row: `hasSameSummary`) are read again, once, unless they were read
  this very moment (`PinakesApplication.fetchEventInstances`).
- `GET /v1/resources/{id}/occurrences` takes RFC 3339 times only (`getOccurrencesWindowStart`; the search's `now` is a
  400 there), and every page of one list is asked with the first page's `from` (`useResourceOccurrences`). A next
  page Pinakes refuses (an expired cursor, a 400) starts the list over from a fresh first page, once. That page is
  asked past the cache (`fresh`, the app's own flag and never a request parameter): within the minute the window is
  the same, and the five-minute cache would answer the page whose cursor was refused.
- Times show in the event's own `tz`, else in UTC, always with the zone's name; days are grouped the same way
  (`getEventDayKey`), never in the viewer's zone. Only a card that says `all_day` shows as its day: a search row and a
  calendar occurrence say neither `tz` nor `all_day`, and nothing is inferred from their times (a span from one UTC
  midnight to the next can be a timed event). Pinakes sends no recurrence rule, so none is worded; "Repeats" shows
  only for an occurrence with a `recurrence_id`. Search has no status parameter: an event's lifecycle is shown from
  its `occurrence.status` or `event_status`, never filtered.
- The results map groups pins in the browser over the rows read so far (`clusterMapPoints`), at most
  `MAP_RESULTS_MAX` of them, and says how many rows it shows and how many have no location; it never searches the
  area in view. A press on a pin that selects scrolls its cards up into view, never so far that the pin goes under
  the page's header (`revealSelection`). Boxes and nearness take the short way round the world (`getPointsBounds`), so results either side of
  the antimeridian are fitted and grouped as the neighbours they are.
- Events or Places alone are a search (`isResourceFiltersSearch`): `/search?kind=event` lists the coming events as an
  agenda and `/search?kind=place` the places, either on a map with `view=map`, without a text or a tag. Any other
  kind alone still lists nothing.

## Quick Checklist

When working with data:

- [ ] Using composite IDs for posts (`author:postId`)?
- [ ] Stream entries have ordering metadata?
- [ ] TTL updated on every write?
- [ ] External data normalized through pipes?
- [ ] Pipes are pure (no IO)?
- [ ] Article body media referenced by `attachment:{n}` slot, type from file metadata?
- [ ] Homeserver paths from the data model (`buildUri`, `listPrefix`, `deletionPaths`) or `src/config/app-files.ts`, never spelled by hand?
- [ ] A stored-object edit spreads the decoded object so `$unknown` survives?
