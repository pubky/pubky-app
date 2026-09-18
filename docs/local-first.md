# Local-First Patterns

Rules for implementing local-first patterns. Based on ADR-0001, ADR-0011.

## Consistency Model

The write model is local-first, ensuring immediate responsiveness for the user.

- UI reflects local state immediately; eventual consistency with the homeserver and nexus.
- Reconciliation occurs via periodic retries or explicit repair flows.
- Rollback (compensation) is optional and applied only when strict consistency is required.

## Write Flow

All write operations must follow this pattern:

```
1. Write to IndexedDB (Dexie) first
2. Update UI immediately
3. Sync to homeserver in background
4. Reconcile conflicts asynchronously
```

## Controller Method Naming

Controller method names encode IO behavior and delivery guarantees:

### Read Operations

| Prefix            | Source            | Network | Description                                                  |
| ----------------- | ----------------- | ------- | ------------------------------------------------------------ |
| `fetch*`          | Nexus API         | Yes     | Network only, no cache                                       |
| `get*`            | IndexedDB         | No      | Local cache only                                             |
| `getMany*`        | IndexedDB         | No      | Bulk reads, returns `Map<Pubky, T>`                          |
| `getOrFetch*`     | IndexedDB → Nexus | Maybe   | Local first, fallback to network                             |
| `getMany*OrFetch` | IndexedDB → Nexus | Maybe   | Bulk local first, fetch missing (e.g., `getManyTagsOrFetch`) |
| `subscribe*`      | Live stream       | Yes     | Long-lived subscription, not a one-shot fetch                |

### Write Operations

| Prefix                            | Pattern     | Description                            |
| --------------------------------- | ----------- | -------------------------------------- |
| `commit[Create\|Update\|Delete]*` | Local-first | Write to IndexedDB, sync to homeserver |

## Examples

### Read Methods

```typescript
// Real method names from the codebase
TagCacheController.getOrFetchNext({ kind: 'post', id: compositeId, viewerId }); // Next server page
PostController.getDetails({ compositeId }); // Always local
PostController.getOrFetchDetails({ compositeId, viewerId }); // Local first, fallback
UserController.getManyDetails({ userIds }); // Bulk local
UserController.getManyTagsOrFetch({ userIds }); // Bulk with fallback
MuteController.subscribeMuteDirectoryEventStream(pubky, cursor); // Live stream subscription

// Bad naming
PostController.loadDetails(id); // Unclear source
PostController.retrieveDetails(id); // Unclear source
```

### Write Methods

```typescript
// Real method names from the codebase
PostController.commitCreate({ authorId, content, isArticle, tags, attachments });
PostController.commitEdit({ compositePostId, content, attachments }); // attachments optional: { original, kept, added }
PostController.commitDelete({ compositePostId });
BookmarkController.commitCreate({ postId, userId });

// Bad naming
PostController.createPost(post); // Missing "commit" prefix
PostController.savePost(post); // Unclear operation type
PostController.removePost(id); // Should be commitDelete
```

## Implementation Pattern

### Write Operation Flow

```typescript
// Real flow: src/core/controllers/post/post.ts → src/core/application/post/post.ts
class PostController {
  static async commitCreate({ authorId, content, isArticle, tags, attachments }: TCreatePostParams) {
    // 1. Normalize file attachments via pipes
    const fileAttachments = attachments ? await this.normalizeFileAttachments({ attachments, pubky: authorId }) : [];

    // 2. Validate/normalize post via pipes (pubky-app-specs)
    const { post, meta } = await PostNormalizer.to({ content, kind: postKind, attachments: fileAttachments }, authorId);

    // 3. Normalize tags via pipes
    const tagList = tags ? tags.map((tag) => TagNormalizer.from({ taggerId: authorId, ... })) : [];

    // 4. Delegate to application (local write + homeserver sync)
    await PostApplication.commitCreate({ compositePostId, post, postUrl: meta.url, fileAttachments, tags: tagList });
  }
}

class PostApplication {
  static async commitCreate({ postUrl, compositePostId, post, fileAttachments, tags }: TCreatePostInput) {
    // 1. Upload files first (dependency)
    if (fileAttachments?.length > 0) await FileApplication.commitCreate({ fileAttachments });

    // 2. Write to IndexedDB
    await LocalPostService.create({ compositePostId, post });

    // 3. Sync to homeserver
    await HomeserverService.request({ method: HttpMethod.PUT, url: postUrl, bodyJson: post.toJson() });

    // 4. Create tags
    if (tags?.length > 0) await TagApplication.commitCreate({ tagList: tags });
  }
}
```

## useLiveQuery Rules (ADR-0011)

When using Dexie's `useLiveQuery`:

### DO

```typescript
// Pure, read-only, local-only
const posts = useLiveQuery(() => LocalPostService.getByStream(streamId), [streamId]);
```

### DON'T

```typescript
// Never call TanStack Query or network code inside useLiveQuery
const posts = useLiveQuery(async () => {
  const local = await LocalPostService.get(id);
  if (!local) {
    await queryClient.fetchQuery(...); // Breaks Dexie PSD
  }
  return local;
}, [id]);
```

### Pattern: `useLocalFirstQuery` (fetch once when missing, read live)

Hooks that need "local first, fetch when missing" use `useLocalFirstQuery` from `@/hooks/useLocalFirstQuery/useLocalFirstQuery` (the implementation of ADR-0011). Do not hand-roll a `useEffect` + `useLiveQuery` pair.

```typescript
// Real: src/hooks/usePostDetails/usePostDetails.tsx
export function usePostDetails(compositeId: string | null | undefined, options?: UsePostDetailsOptions) {
  const enabled = isLocalFirstQueryEnabled(compositeId, options?.enabled);

  const { data, isLoading } = useLocalFirstQuery<EnrichedPostDetails>({
    queryFn: () => PostController.getDetails({ compositeId: compositeId! }), // pure local read, runs inside useLiveQuery
    fetchFn: () => PostController.fetch({ compositeId: compositeId! }), // network read that persists to Dexie
    deps: [compositeId, enabled],
    enabled,
  });

  return { postDetails: data, isLoading };
}
```

- `queryFn` is a `get*` controller read and runs inside `useLiveQuery`: pure, local, no network.
- `fetchFn` is a `fetch*` controller call that fetches from Nexus and persists to Dexie; the live query then re-renders on its own.
- `fetchFn` runs **only when local data is `null`**. A cache hit is never refreshed by this hook (TTL does that).
- Never call a network client, TanStack Query or retry logic inside `useLiveQuery`: it breaks Dexie's PSD.

`rg -l useLocalFirstQuery src/hooks --glob '!*.test.*'` lists the consumers. Some older hooks still hand-roll the `useEffect` + `useLiveQuery` pair; that is debt to migrate when touched, not a pattern to copy.

### Read pitfalls

Two bug classes account for most regressions on read paths. Check them before touching a hook that reads local data or anything that writes TTL rows.

`useLocalFirstQuery` is deliberately simple; its surprises are documented by its call sites and past issues:

- `fetchFn` runs only when local data is `null`. A stale counter that "never updates" is usually this, not the component (#2384).
- A tombstone is still local data: soft-deleted rows (`content = [DELETED]`) keep the cache non-null, so the network arm never fires and the UI renders the tombstone forever (#1988). Decide what "missing" means for the entity you render.
- Every hook instance owns its own effect. Mounting the same query twice (list plus expanded row, or a nested card) duplicates every request; hoist the query and pass data down (#1987).
- `isLoading` is true while a cache-miss fetch is in flight, and `.finally()` clears it whether `fetchFn` resolves or rejects. A Nexus 404 therefore settles at `data === null`; it does not leave a skeleton without an exit, and the hook exposes no error value. `usePostMissing` turns that settled `null` into `postMissing`. Branch on the settled value, not on `isLoading` and `data` alone.
- `isMissing = postDetails === null` is the established "not found" shape (#2081, #1986); keep that meaning.

TTL refresh races are the second class (TTL rules: `docs/data-patterns.md`, _TTL Management_):

- A background refresh that lands after a local write reverts the user's action (#1781) or flickers the tag UI (#1452, #1276). A local write must mark every affected row fresh (`*_ttl.lastUpdatedAt`) so the coordinator skips it; a stale Nexus response must never overwrite a fresher local write. `persistUsers` skips the relationship row for any user whose `user_ttl.lastUpdatedAt >= fetchStartedAt`, and `LocalFollowService.create`/`delete` stamp the followee TTL so a follow that lands mid-request wins (#1803).
- TTL refresh also applies to public content for signed-out visitors (#2486). "Logged out" does not mean "no background refresh".
- Do not force freshness by clearing stream caches: invalidate the affected scope through the dirty registry (see _Deferred Stream Invalidation_ below) and let the TTL/viewport policy refetch (ADR-0003, ADR-0005).

## Persistence Order

When writing related entities, persist dependencies first:

```typescript
// Correct order — dependencies before dependents
// Real pattern from PostStreamApplication.fetchMissingPostsFromNexus
await LocalUserService.upsertDetails(author); // 1. Author first
await LocalPostService.create({ compositePostId, post }); // 2. Then post
await LocalPostTagService.create({ taggerId, taggedId, label }); // 3. Then tags

// Wrong order (foreign key issues)
await LocalPostService.create({ compositePostId, post }); // Post references author
await LocalUserService.upsertDetails(author); // Author not yet in DB!
```

## Optimistic Updates

For immediate UI feedback, controllers manage store state while application handles persistence:

```typescript
// Controller normalizes input before delegating to application
// Real pattern: src/core/controllers/user/user.ts
class UserController {
  static async commitFollow(eventType, { follower, followee }) {
    const normalizedFollowee = stripPubkyPrefix(followee);
    const { meta, follow } = FollowNormalizer.to({ follower, followee: normalizedFollowee });

    await UserApplication.commitFollow({
      eventType,
      followUrl: meta.url,
      followJson: follow.toJson(),
      follower,
      followee: normalizedFollowee,
    });
  }
}

// Application handles local-first persistence
// Real pattern: src/core/application/user/user.ts
class UserApplication {
  static async commitFollow({ eventType, followUrl, followJson, follower, followee }) {
    // 1. Write to IndexedDB first
    await LocalFollowService.create({ follower, followee });
    // 2. Sync to homeserver
    await HomeserverService.request({ method: eventType, url: followUrl, bodyJson: followJson });
  }
}
```

## Deferred Stream Invalidation

Some cached post streams derive their membership from mutable local state: Following/Friends timelines and `wot` streams depend on the follow graph, and `wot_domain` (Tagged as) streams depend on the viewer's profile tags. When that state changes (follow/unfollow, profile-tag create/delete), the cached streams are stale — but deleting them immediately would force-refresh a mounted feed and yank the reader's scroll position (#2294).

Instead, invalidation is deferred through an in-memory dirty registry (`src/core/services/local/stream/posts/postStreamDirtyRegistry.ts`):

1. **Mutations mark scopes dirty.** `LocalFollowService` marks `follow_graph` on every follow/unfollow and `friends` on friendship transitions; `LocalUserTagService` marks `profile_tag` on profile-tag writes (#2302). No Dexie stream rows are touched.
2. **Streams classify their dependencies.** `getStreamDependencyScopes` in `src/core/models/stream/post/postStream.types.ts` maps a stream id to the scopes it depends on (`wot_domain` depths 1–2 depend on both the graph and profile tags).
3. **Reconciliation happens on the next initial load.** `PostStreamApplication.prepareStreamForInitialLoad` (run on feed mount and pull-to-refresh) checks the registry; a dirty stream has its main and unread cache rows dropped and rebuilds from Nexus.

The mounted feed's React state is never touched — the reader keeps their position, the "N new posts" pill keeps polling against the intact cache head, and fresh membership appears when they navigate back or pull to refresh. Being in-memory, a dirty flag does not survive a hard reload; that staleness window is bounded by the `getStreamCacheMaxAgeMs()` cache max-age check on initial load.

## Stream Pagination Cursors

Score-paginated post streams (timelines, profiles, bookmarks, reply threads) keep two resume positions per feed, both owned by `useStreamPagination` and threaded back on every round:

- **`lastPostId`** — the id of the last _raw_ post scanned (`lastRawPostId`, visible or filtered), the anchor for walking the local stream cache by id (`getStreamFromCache`).
- **`streamTail` / `nextCursor`** — the Nexus position to continue from once the cache is exhausted: a raw `skip` offset for skip-paginated streams, Nexus's own `last_post_score` for score streams.

Both advance by raw scanned data, never by the post-filter visible count (#2251, #2290): a fully-filtered round still moves the anchor and the cursor, otherwise a long muted / deleted / collection-only run spins in place.

**A score cursor comes only from Nexus.** Nexus keeps an edited or deleted post at its original stream position (its sorted-set score) while bumping `details.indexed_at`, and `last_post_score` is the score. A cursor derived from a post's local `indexed_at` therefore lands above posts that are already cached, the seam re-serves them, and with the raw anchor sitting on one of them the feed never advances (#2523, #1569). The rules that follow from this:

- `post_streams` rows persist the `last_post_score` of the deepest page fetched into them as `tailCursor` (`PostStreamModelSchema`); every cache→Nexus seam (`getCachedLastPostTimestamp`, the full-hit `nextCursor`, `partialCacheHit`, the exhausted-cache fallback) resumes from it. Rows without one (written before it was tracked, or seeded by bootstrap) seed once from the tail entry's timestamp — bookmark time for bookmark streams — and their first Nexus page persists the real cursor. That timestamp is the post's score only while the post is unedited, so the seam page is aligned on the row's own ids (`LocalStreamPostsService.keepIdsBelowRow`): only the ids listed after the last id the row holds are served or appended, since everything before is cached already or above the row (a head poll delivers those, and a bootstrap row can hold posts newer than the head a mounted walk started from). A page sharing no id with the row is taken as the normal seam page below the tail; no local timestamp can tell that apart from a page entirely above the row (an edited head reads as newer than it is), so a tail edited after a full page of newer posts arrived serves that page below the cached ids once, until the row is rebuilt (#2551 tracks the Nexus score field that would make this exact).
- A descending Nexus page is appended to the cached stream in stream order (`persistNewStreamChunk` with `tailCursor`), never re-sorted by `indexed_at`, so the raw anchor always sits at the tail. A page that adds no new id leaves the row untouched (at most recording a deeper cursor), and an unread merge prepends the unread row as it is: every head poll's page is newer than the previous one and already in Nexus order, so nothing is re-sorted by `indexed_at` (an edited unread post would otherwise float above newer ones). An id both rows hold takes the unread position (a locally created post the poll returned is at the head either way); an own post written after the poll sits below the polled posts until the next poll returns it, because placing it by `indexed_at` would also promote an edited row head above newer polled posts and hand its bumped timestamp to the next head poll (#2551). A bootstrap clears the unread row of the timeline it replaces: the head page it writes supersedes anything earlier polls collected. Cursor-less chunks (hydration-discovered replies, ascending reply pages) keep a row that has no cursor of its own newest-first by post timestamp, at creation and whenever they add ids, because `useReplyStream` reverses that row for chronological display; an ascending page is handed over reversed so ids still missing their details keep their relative order under that sort. A cursor-less row is also normalized by a cursor-less chunk that adds nothing, because earlier builds stored such rows in hydration order and only re-sorted them on a later write. A row with a Nexus cursor is never re-sorted, whatever chunk reaches it, and nothing rewrites its ids when a chunk adds none. A head poll that completes after a newer one (two tabs share the unread row) has its unique ids placed after the nearest preceding id the row already holds, so a late older page cannot land above newer posts; a page sharing no id with the row is taken as newer.
- After a Nexus page the raw anchor is the deepest of the page's ids and the previous anchor as positioned in the persisted row (`persistNewStreamChunk` returns the row), never the page's last id as such. A page that only repeated cached ids (the one-time seed of a cursor-less row lands above the tail) therefore leaves the anchor where it was, and a row another walker extended past this page cannot make the anchor jump over ids this walker never served.
- An anchor that left the row (its post deleted or un-bookmarked mid-scroll) is re-anchored on the deepest id the renderer has already shown (`visiblePostIds`, threaded down by `useStreamPagination`), and the walk restarts from the head when none is known. It never jumps to the row tail, which would skip every cached id in between. Every mutator that empties a row drops its cursor (the bookmark services and the model's `removeItems`), and a prepend that seeds an empty row does the same, so re-seeding a row starts from the top instead of resuming below ids it no longer holds.
- `PostStreamQueue` never synthesizes a cursor from a served post: a round served from the overflow buffer resumes by the buffered raw position, and a round whose page is empty without moving the cursor stops instead of re-issuing the same request.
- One `useStreamPagination` load keeps scanning while rounds come back with nothing new to show, up to `STREAM_LOAD_MAX_RAW_SCAN` raw posts (`rawScannedCount`, threaded up from the queue): the loading block stays mounted for the whole scan instead of blinking once per round, and the budget counts posts rather than rounds because a round through an unhydrated region can only inspect one page before the controller's post-hydration pass filters it, while a cached region yields up to twenty. A round counts as progress when it consumed raw posts or moved either resume position, so a page served from the queue's overflow buffer (cursor unchanged, no row tail) still advances the scan; a round that did none of these stops it. The hook commits its cursor, anchor and `hasMore` once after the scan, not per round. A load that spent its budget yields with `hasMore` still true.
- Auto-loading renderers (`TimelinePosts`, `TimelineGridPosts`, `VisualTimelinePosts`, `RepliesWithParent`) then budget consecutive loads that grow nothing (`TIMELINE_MAX_UNPRODUCTIVE_AUTO_LOADS`, via `useInfiniteScroll`'s `itemCount` / `maxUnproductiveLoads`; the Visual feed counts the tiles its pipeline tracks, packed, buffered or still probing, since text-only posts never become tiles, and its pending-resolution flags never gate the observer because a file Nexus no longer returns keeps them set for good) and hand over to a manual "Load more" (`TimelineLoadMore`) once it is spent, so a filtered region can never chain loads to the end of the stream. Any change of the rendered count re-arms auto-loading: growth after a manual load, a new stream's first page arriving in a renderer that is not re-keyed per stream, or a refresh that replaced the list with a shorter one.

## Quick Checklist

When adding controller methods:

- [ ] Does the name follow `fetch*/get*/getMany*/getOrFetch*/getMany*OrFetch/subscribe*/commit*` pattern?
- [ ] Do write operations write to IndexedDB first?
- [ ] Is UI updated immediately (optimistic)?
- [ ] Does background sync handle failures gracefully?
- [ ] Is `useLiveQuery` used only for local reads, and do local-first reads go through `useLocalFirstQuery`?
- [ ] Are cache hits, tombstones and a settled `null` handled on the read path?
- [ ] Does every stream cursor come from Nexus (`last_post_score` / raw offset), never from a post's `indexed_at`?

## Tag previews, pagination, and freshness

The rationale and trade-offs are recorded in [ADR 0020](adr/0020-local-first-tag-cache.md).

### Loading and pagination

Hooks read tags locally with `TagCacheController.get` inside `useLiveQuery`. Mount calls `getOrFetch` separately to initialize missing data or revalidate a changed viewer. This tag-specific path also fills existing uninitialized records and handles viewer changes, which the `null`-only fallback in `useLocalFirstQuery` does not cover.

An initialized empty list is a cache hit; locally created collections remain uninitialized until a server response is accepted. Such placeholders still need initialization, but any optimistic tags remain visible while it runs. Only an empty placeholder shows loading, and only until the fill settles. A newly created post seeds an initialized, complete window for its author, since it has no tags on Nexus yet. Cache metadata is optional for compatibility with existing records.

Use `getOrFetchNext` for pagination. The persisted server cursor is independent of displayed tags and optimistic edits. Post pages contain three tags and profile pages twenty; a short/empty response marks pagination exhausted. Refresh and pagination are serialized per entity/viewer. Competing writes trigger a retry from the latest revision, with at most three attempts.

### Refresh

Batch previews must not truncate expanded lists. Refresh replaces the loaded server portion atomically, using requests of at most 100 tags, so deleted labels disappear. Loading another page does not renew the age of earlier pages.

The TTL coordinator checks tag age independently of post/profile age. Failed tag refreshes retain visible data and set a 30-second `cache.retryAt` cooldown. Subsequent ticks retry stale tags without repeating successful entity batches; entities still waiting for their entity batch are left out of that pass because the batch response carries their preview, and per-entity tag requests run with bounded concurrency (`TAG_REFRESH_MAX_CONCURRENCY`). Ids a batch response omits (deleted, or not yet indexed) get a delayed TTL row and retry after the configured retry delay instead of every tick. Accepted data and new notification invalidation clear the cooldown; explicit pagination remains available.

Tag notifications are grouped by entity and invalidate its collection before forced batch hydration. Skip invalidation only when the accepted list for the current viewer comes from requests started more than one tag TTL after the event: the snapshot carries a client timestamp and the event a server one, so a smaller margin could hide a real event behind clock skew. After hydration, a complete accepted preview, or one at least a refresh page long, needs no extra tag GET; a shorter preview refreshes the loaded list. Forced requests bypass the transport cache and wait for an identical in-flight request to settle.

### Writes and session changes

Persist local mutation intent with tag changes in one IndexedDB transaction. Reconcile it against both batch and page responses for the five-minute protection period. Tags and counters must remain consistent; counters cannot be derived from a partial preview. Pending operation identities guard rollback, and replacing a loaded list retires its expired identities. Cache revisions reject superseded responses. Controller session guards reject results from a replaced account/session, and viewerless previews must not overwrite authenticated relationships.

### Public views and viewport subscriptions

TTL refresh covers visible public posts and profiles, including their tags, for both signed-in and signed-out visitors. Signed-out visitors could already load these pages; this change adds periodic TTL refresh for those visits.

Use `useTtlSubscription` for visible posts and users, including Visual tiles, profile headers, and empty Tagged panels. Each subscription must be released when its owner leaves the viewport or unmounts. Posts and users are reference counted; a tracked post also holds one author reference. Route changes do not clear these references globally.

`CoordinatorsManager` owns TTL start/stop. Account changes clear queued work and temporary bootstrap references while preserving viewport ownership; an account switch ticks immediately, while sign-out delays the first guest tick by one interval to avoid refetching a page the user is leaving (IndexedDB already orders the tick's reads behind the clear). A tick re-checks its session after every await, so a batch captured for one viewer is never sent or applied on behalf of the next. A hidden browser page pauses TTL ticks. Other coordinators retain their own authentication rules.
