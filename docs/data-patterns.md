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

The collection envelope (`name`, `description`, `cover_image`, `items`, `layout`) is one cached post row, so a single refresh updates the title, cover, and item count everywhere at once. For every viewer, including the owner and guests, the single-collection feed renders the complete local `items` membership in envelope order. `TimelineFeed` reads it and `TimelineFeedContent` projects it over the collection's pagination with `useCollectionStreamMembership`; `useStreamPagination` stays a plain Nexus paginator, and the projection is separate from the raw Nexus page IDs and offsets. An unresolved local read is distinct from a resolved empty collection. A lagging or refreshed Nexus stream cannot erase locally saved items or reintroduce removed members; the trade-off is that an item Nexus indexed before this device's envelope learned of it (added on another device) appears once the envelope refreshes, through the TTL coordinator or a pull-to-refresh, which refetches the envelope with the stream. For the owner, that refetch is skipped during the indexing retry window (`ttlRetryDelayMs`) after a local collection write: Nexus can still serve the pre-save envelope with a newer `indexed_at`, and persisting it would undo the save. Collection creates, edits and compensating rollbacks stamp the optional `post_details.localUpdatedAt` alongside TTL; Nexus persistence retains this timestamp without extending it. Ordinary cache reads only freshen TTL and never suppress an explicit refresh. Here `localUpdatedAt` records the last local write, not an unacknowledged edit: the window is a heuristic, not a guarantee, and a save Nexus indexes later remains exposed to refresh. A skipped request does not schedule a delayed retry; a later pull or the TTL coordinator refreshes the envelope. When the envelope drops an item whose row the stream already served, that row also leaves the raw page so the next skip offset follows Nexus's shorter list.

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

// Application also normalizes data before persisting
// Real: src/core/application/profile/profile.ts
class ProfileApplication {
  private static async commitChanges({ pubky, changes }) {
    const published = UserNormalizer.fromPublished(await HomeserverService.getFreshJson(userUriBuilder(pubky)));
    const { user, meta } = UserNormalizer.to(UserNormalizer.merge(published, changes), pubky);
    await HomeserverService.request({ method: HttpMethod.PUT, url: meta.url, bodyJson: user.toJson() });
    await LocalProfileService.updateDetails(user, pubky);
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

- **Composer form** references an author-owned file URI: `![alt](pubky://{author}/pub/social/v1/files/{hash}.{ext})`. A file inserted this session is staged, not uploaded: `useInlineMediaUpload` keeps it in memory under a placeholder media URI built from random bytes (`buildFile`), so nothing reaches public storage before the publish (#2687, #2684). A create hands the staged files to `PostController.commitCreate` with the cover as its own `coverImage` (one upload batch, rolled back on failure); an edit uploads them through `uploadStaged` right before `commitEdit`, which takes URIs only, so a save that fails after that upload leaves them for the session's discard sweep (a composer closed during the save keeps them instead, since the client cannot tell a refused write from an unacknowledged one; a page closed in between loses the sweep; making the edit batch controller-owned like the create is the follow-up, #2878). A file kept from the published article keeps its real URI, v1 or 0.x.
- **Published form** references a slot: `![alt](attachment:{n})`, where `n` indexes `post.attachments = [...inline first-appearance, ...unreferenced originals]` (spec cap 10) and the cover rides in the envelope as `cover_image` (a media URI or `null`). `serializeArticleBody` / `deserializeArticleBody` in `src/libs/post/articleInlineMedia.ts` convert between the two (`slotOffset` 0 for a published article, 1 for a locked one whose cover keeps slot 0) and block publishing hand-typed refs, blob URIs, author file URIs in raw HTML or reference-style definitions, and over-cap bodies. The envelope's `title` and `body` are the composer's; `ARTICLE_MAX_CHARACTER_LENGTH` is the data model's body cap, counted in code points.
- **Cover resolution** (`resolveArticleCover`, `src/libs/post/articleCover.ts`, ADR-0023 as amended): rule A, an envelope cover is the cover and the slots are `attachments`; rule A′, a migrated 0.x article (envelope cover, body references none at 0) reads its slots as `['', ...attachments]` so `attachment:1` still finds the first inline file; rule B, no envelope cover means the 0.x slot-0 rule: `attachments[0]` is the cover unless the body references `attachment:0`. Every consumer goes through it (`usePostArticle`, `usePostAttachmentsMedia`, `useVisualFeedTiles`, `postCoverPreload`, `PostArticleDetail`, the edit composer, the OG text); a first edit of a 0.x article moves its slot-0 cover into the envelope. The cover stays image-only. The local files store keeps a same-session cover apart from the inline entries (`articleCovers[postId]`, `setArticleCover`), so `posts[postId]` stays index-aligned with the slots.
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

**App files.** Settings and `last_read` are read v1 → 0.x → create: the v1 file when it exists, else the 0.x file,
else defaults (settings) or a cursor at the current time (`last_read`). The first `SettingsApplication.initializeSettings`
and the first `BootstrapApplication.initialize` after the gate write the v1 file from the 0.x one (fenced; the
absent check runs again on every retry pass, so a v1 file another client wrote meanwhile is kept). The copy is
forward only: once the v1 file exists the 0.x one is never read again, and it is never deleted (D15). Every write
goes to the v1 URL (`SettingsNormalizer.buildUrl`, `LastReadNormalizer.buildUrl`).

**Account delete and export** (`ProfileApplication.commitDelete` / `downloadData`) walk all five trees:
`listPrefix(pubky, 'legacy')`, `listPrefix(pubky, 'public')`, the whole `/priv/social/` (the v1 tree, the flag and
the Locks reader directories) and `/priv/app.pubky/v1/`. The export names every file by its path under the account.
The deletion removes every other file first, deepest first, then the profiles in the order `deletionPaths({ kind:
'user' })` gives: the 0.x `profile.json`, then the v1 one. `/pub/app.locks/` and `/priv/app.locks/content/` are
Lock Server contracts under a read-only grant and are left alone.

## Data Model Reference

All tables defined in `src/core/database/franky/franky.ts`.

### Schema changes

`franky.ts` declares a single `this.version(DB_VERSION).stores({...})`; there is no incremental migration chain. `DB_VERSION` is `Env.NEXT_PUBLIC_DB_VERSION` (`src/config/database.ts`). When the stored version differs, the client deletes and recreates the local database (`recreateDatabase`), which is user-visible local data loss until the next sync. Bumping `DB_VERSION` or changing a table's index map is therefore a deliberate, reviewed change with its own callout in the PR, never a side effect of a feature. See `docs/adr/0019-dexie-recreate-on-version-mismatch.md` (supersedes ADR-0007).

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
post_relationships — Author, parent, repost relationships
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
bookmarks          — Bookmarked post references
hot_tags           — Trending tag snapshots
feeds              — Custom feed definitions
moderation         — Content moderation state
locks              — Cached lock descriptors and readable post metadata
```

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
