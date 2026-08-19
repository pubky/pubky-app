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
PostController.fetchTags({ compositeId, skip, limit }); // Always network
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
PostController.commitEdit({ compositePostId, content });
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
// Controller reads store state before delegating to application
// Real pattern: src/core/controllers/user/user.ts
class UserController {
  static async commitFollow(eventType, { follower, followee }) {
    const normalizedFollowee = stripPubkyPrefix(followee);
    const { meta, follow } = FollowNormalizer.to({ follower, followee: normalizedFollowee });
    const activeStreamId = this.getActiveStreamId(); // Controller reads from store

    await UserApplication.commitFollow({
      eventType,
      followUrl: meta.url,
      followJson: follow.toJson(),
      follower,
      followee: normalizedFollowee,
      activeStreamId,
    });
  }
}

// Application handles local-first persistence
// Real pattern: src/core/application/user/user.ts
class UserApplication {
  static async commitFollow({ eventType, followUrl, followJson, follower, followee, activeStreamId }) {
    // 1. Write to IndexedDB first
    await LocalFollowService.create({ follower, followee, activeStreamId });
    // 2. Sync to homeserver
    await HomeserverService.request({ method: eventType, url: followUrl, bodyJson: followJson });
  }
}
```

## Quick Checklist

When adding controller methods:

- [ ] Does the name follow `fetch*/get*/getMany*/getOrFetch*/getMany*OrFetch/subscribe*/commit*` pattern?
- [ ] Do write operations write to IndexedDB first?
- [ ] Is UI updated immediately (optimistic)?
- [ ] Does background sync handle failures gracefully?
- [ ] Is `useLiveQuery` used only for local reads?
