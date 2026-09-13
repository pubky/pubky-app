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

The rationale and trade-offs are recorded in [ADR 0019](adr/0019-local-first-tag-cache.md).

### Loading and pagination

Hooks read tags locally with `TagCacheController.get` inside `useLiveQuery`. Mount calls `getOrFetch` separately to initialize missing data or revalidate a changed viewer. An initialized empty list is a cache hit; locally created collections remain uninitialized until a server response is accepted. Cache metadata is optional for compatibility with existing records.

Use `getOrFetchNext` for pagination. The persisted server cursor is independent of displayed tags and optimistic edits. Post pages contain three tags and profile pages twenty; a short/empty response marks pagination exhausted. Refresh and pagination are serialized per entity/viewer. Competing writes trigger a retry from the latest revision, with at most three attempts.

### Refresh

Batch previews must not truncate expanded lists. Refresh replaces the loaded server portion atomically, using requests of at most 100 tags, so deleted labels disappear. Loading another page does not renew the age of earlier pages.

The TTL coordinator checks tag age independently of post/profile age. Failed tag refreshes retain visible data and set a 30-second `cache.retryAt` cooldown. Subsequent ticks retry stale tags without repeating successful entity batches. Accepted data and new notification invalidation clear the cooldown; explicit pagination remains available.

Tag notifications are grouped by entity and invalidate its collection before forced batch hydration. Skip invalidation only when the accepted list for the current viewer is known to come from requests started after the event. A complete accepted preview needs no extra tag GET; otherwise refresh the loaded list. Forced requests bypass the transport cache and wait for an identical in-flight request to settle.

### Writes and session changes

Persist local mutation intent with tag changes in one IndexedDB transaction. Reconcile it against both batch and page responses for the five-minute protection period. Tags and counters must remain consistent; counters cannot be derived from a partial preview. Pending operation identities guard rollback, and replacing a loaded list retires its expired identities. Cache revisions reject superseded responses. Controller session guards reject results from a replaced account/session, and viewerless previews must not overwrite authenticated relationships.

### Public views and viewport subscriptions

TTL refresh covers visible public posts and profiles, including their tags, for both signed-in and signed-out visitors. Signed-out visitors could already load these pages; this change adds periodic TTL refresh for those visits.

Use `useTtlSubscription` for visible posts and users, including Visual tiles, profile headers, and empty Tagged panels. Each subscription must be released when its owner leaves the viewport or unmounts. Posts and users are reference counted; a tracked post also holds one author reference. Route changes do not clear these references globally.

`CoordinatorsManager` owns TTL start/stop. Account changes clear queued work and temporary bootstrap references while preserving viewport ownership. A hidden browser page pauses TTL ticks. Other coordinators retain their own authentication rules.
