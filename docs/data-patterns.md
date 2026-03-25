# Data Patterns

Rules for data handling patterns. Based on ADR-0002, ADR-0003, ADR-0005, ADR-0006.

## Composite Post IDs (ADR-0002)

Posts use composite key format: `author:postId`

### Format

```typescript
// Composite IDs are plain strings — no branded type
const id = 'pk1abc123xyz:0000000123';
//           ^author^   :^postId^

const COMPOSITE_ID_DELIMITER = ':' as const;
```

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

// Example: PostStreamModelSchema = BaseStreamModelSchema<PostStreamId, string>
// Example: UserStreamModelSchema = BaseStreamModelSchema<UserStreamId, string>
// Example: TagStreamModelSchema  = BaseStreamModelSchema<TagStreamTypes, NexusHotTag>
```

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
const stalePostIds = await TtlApplication.findStalePostsByIds({ postIds, ttlMs: Env.NEXT_PUBLIC_TTL_POST_MS });
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
// Real: src/libs/env/env.ts (configurable via environment variables)
NEXT_PUBLIC_TTL_POST_MS: 300_000,  // 5 minutes (posts)
NEXT_PUBLIC_TTL_USER_MS: 600_000,  // 10 minutes (users)
NEXT_PUBLIC_TTL_BATCH_INTERVAL_MS: 5_000, // 5 seconds between batches
```

## Pipes Normalization (ADR-0006)

Pipes normalize external data to domain shapes.

### Pipe Responsibilities

```typescript
// Pipes DO:
// - Transform external shapes → domain shapes
// - Validate input data
// - Enforce pubky-app-specs
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
  // Create a new post via pubky-app-specs builder
  static async to(post: PostValidatorData, specsPubky: Pubky): Promise<PostResult> {
    try {
      const builder = PubkySpecsSingleton.get(specsPubky);
      return builder.createPost(post.content, post.kind, post.parentUri ?? null, embedObject, attachments);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error as string, {
        service: ErrorService.PubkyAppSpecs,
        operation: 'createPost',
        context: { post, specsPubky },
      });
    }
  }

  // Edit an existing post
  static async toEdit({ compositePostId, content, currentUserPubky }): Promise<PostResult> {
    const builder = PubkySpecsSingleton.get(authorId);
    return builder.editPost(originalPost, postId, content);
  }
}
```

### Where to Use Pipes

```typescript
// Controllers call pipes before delegating to application
// Real: src/core/controllers/post/post.ts
class PostController {
  static async commitCreate({ authorId, content, isArticle, tags, attachments }: TCreatePostParams) {
    const fileAttachments = attachments ? await FileNormalizer.toFileAttachment({ file, pubky: authorId }) : [];
    const { post, meta } = await PostNormalizer.to({ content, kind: postKind, ... }, authorId);
    const tagList = tags?.map((tag) => TagNormalizer.from({ taggerId: authorId, ... }));
    await PostApplication.commitCreate({ compositePostId, post, postUrl: meta.url, fileAttachments, tags: tagList });
  }
}

// Application also normalizes data before persisting
// Real: src/core/application/profile/profile.ts
class ProfileApplication {
  static async commitUpdate({ pubky, name, bio, image, links }) {
    const { user, meta } = UserNormalizer.to({ name, bio, image, links, status }, pubky);
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

## Data Model Reference

All tables defined in `src/core/database/franky/franky.ts`.

### User Tables

```
user_details       — Profile data (name, bio, image, links, status)
user_counts        — Follower/following/post counts
user_relationships — Follow/mute relationships
user_connections   — User connection data
user_tags          — Tag collections per user
user_ttl           — Cache staleness (id, lastUpdatedAt)
notifications      — Notification records
```

### Post Tables

```
post_details       — Post content, kind, attachments, timestamps
post_counts        — Reply/repost/tag counts
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
file_details       — File attachment metadata
bookmarks          — Bookmarked post references
hot_tags           — Trending tag snapshots
feeds              — Custom feed definitions
moderation         — Content moderation state
```

## Quick Checklist

When working with data:

- [ ] Using composite IDs for posts (`author:postId`)?
- [ ] Stream entries have ordering metadata?
- [ ] TTL updated on every write?
- [ ] External data normalized through pipes?
- [ ] Pipes are pure (no IO)?
