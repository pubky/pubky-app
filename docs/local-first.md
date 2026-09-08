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

### Pattern: Fetch in useEffect, Read in useLiveQuery

```typescript
// Real: src/hooks/usePostDetails/usePostDetails.tsx
function usePostDetails(compositeId: string | null | undefined) {
  useEffect(() => {
    if (!compositeId) return;
    PostController.getOrFetchDetails({ compositeId }).catch((error) => {
      Logger.error('[usePostDetails] Failed to fetch post details:', { compositeId, error });
    });
  }, [compositeId]);

  const postDetails = useLiveQuery(
    async () => {
      if (!compositeId) return null;
      return await PostController.getDetails({ compositeId });
    },
    [compositeId],
    undefined,
  );

  return { postDetails, isLoading: postDetails === undefined };
}
```

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

## Quick Checklist

When adding controller methods:

- [ ] Does the name follow `fetch*/get*/getMany*/getOrFetch*/getMany*OrFetch/subscribe*/commit*` pattern?
- [ ] Do write operations write to IndexedDB first?
- [ ] Is UI updated immediately (optimistic)?
- [ ] Does background sync handle failures gracefully?
- [ ] Is `useLiveQuery` used only for local reads?

## Tag previews, pagination, and freshness

Tag hooks observe IndexedDB through `TagCacheController`. Mount calls `getOrFetch` to fill a missing collection or revalidate a different/unknown authenticated viewer; a persisted empty collection is a cache hit. Locally created collections carry `cache.initialized = false` until their first server response. Existing records without the optional metadata remain readable without a database reset or version change.

The tag collection stores the server cursor independently of displayed tags. Optimistic additions, removals and zero-tagger UI placeholders must not change the next server offset. Pagination works from batch previews (normally five tags), deduplicates in-flight loads, and records a short/empty page as exhausted. Post pages remain three tags and profile pages twenty. Expanded tagger lists wait for the initial local mutation observation before fetching authenticated membership; a failed local read permits the server fallback.

Batch hydration cannot replace an expanded window with a shorter preview. It retains that window until `TtlApplication` refreshes the loaded prefix through the tag endpoint, in requests of at most 100 tags. Replacement removes deleted server labels. A failed expanded-window request does not fail the successful entity batch or repeat healthy entities. Failed refreshes retain visible data and persist a 30-second `cache.retryAt` cooldown. Each viewport tick separately retries eligible stale tag windows; tag age does not expire the entity TTL. Successful accepted data clears the cooldown, as does a new notification invalidation. Loading another page does not renew the age of earlier pages.

Post and profile writes persist temporary mutation intent in the same IndexedDB transaction as the tag change. Both preview and paginated persistence reconcile that intent against delayed Nexus responses. Expired settled mutation entries are pruned on subsequent local writes. Pending identities survive pagination and local writes that retain old pages, but an accepted replacement retires expired identities with the old window. Conditional rollback cannot modify that replacement. This removes abandoned metadata as collections refresh, without scanning untouched collections. The existing five-minute mutation protection period is preserved; it is not a guarantee of immediate Nexus indexing. Post counters change by a delta, never by recounting a partial preview. Batch persistence writes tags and their counters in one transaction. Same-viewer snapshots reconcile pending deltas; when a truncated or viewerless preview cannot acknowledge an edit, existing tag counters stay within the range allowed by fresh server totals and active additions/removals. This protects optimistic changes without letting old counters suppress pagination. Viewerless previews do not replace authenticated relationships or protected local labels. Request revisions prevent an older page from replacing a newer server window. Controller session guards reject page/TTL responses after account replacement.

Tag notifications invalidate affected collections before fetching their entity batch. Invalidation creates an uninitialized revision even for a missing collection, so an older response cannot populate it first. A successfully accepted, complete batch preview needs no additional tag GET; incomplete or omitted targets refresh their loaded window. Forced refresh waits for any identical in-flight transport request to settle before starting a fresh request, and bypasses the short transport cache. They do not depend on remounting a card.

Stream hydration and TTL post refresh persist valid attachment metadata before publishing post details and their TTL. Failed storage leaves the batch stale for retry; malformed metadata entries are skipped so valid peers still refresh.

TTL refresh covers visible Visual feed tiles, profile headers, and the Tagged panel (including its mobile/empty state). Public data can refresh without authentication; unrelated authenticated coordinators keep their existing rules. Both post and user subscriptions are reference counted and remain registered across route changes while their owning components remain visible. The manager retains ownership of the TTL instance across logout; its auth listener clears session work while mounted viewport consumers retain their references. See [ADR 0019](adr/0019-local-first-tag-cache.md), which supersedes those lifecycle decisions from ADR 0012.

Batch tag writes capture cache revisions before the network request and compare them within the write transaction. Superseded previews cannot overwrite a newer page or renew its freshness. Refreshes and next-page requests retry from the latest cursor/revision after a competing write. A next-page request waits for an ongoing refresh before requesting its page. Retries are bounded to three attempts total and report a conflict if contention continues; newer accepted data remains untouched. Notification hydration and writes retain the session captured by their controller.

Reply streams hydrate missing posts before publishing new reply IDs to live queries. This prevents cards mounting during grouped hydration from issuing individual post/tag requests. Cached and optimistic replies remain observable immediately.

Bootstrap indexing retries own a single temporary user subscription, released when Nexus returns that user. Viewport references remain independent; an omitted user keeps its retry. Both subscription maps are the sole source of membership, with separate work queues.
