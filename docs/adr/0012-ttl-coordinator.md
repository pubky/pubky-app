# ADR 0012: TTL Coordinator

## Status

Accepted — 2026-01-01

## Context

ADR-0005 establishes a per-entity TTL strategy. The app has TTL tables (`post_ttl`, `user_ttl`), but there is no mechanism to **proactively refresh stale data** that users are actively viewing. This ADR defines TTL rows using a `lastUpdatedAt` timestamp (when the entity was last refreshed) so staleness can be computed as `now - lastUpdatedAt > TTL_MS`. Current behavior:

- **StreamCoordinator** polls for **new** posts in a stream
- **No coordinator** refreshes **existing visible posts** when their TTL expires
- Users see stale engagement counts (likes, reposts) and outdated profile data

Without viewport-aware TTL management:

- Cached data becomes stale while users view it
- No smart refresh strategy: either never refresh, refresh everything blindly, or refresh on every view (wasteful)
- No batching of refresh requests (N visible posts = N network requests)

### Requirements

1. **Viewport-aware**: Only refresh data the user is actively viewing
2. **TTL-based**: Check freshness against TTL tables, refresh when stale
3. **Batched requests**: Group multiple refresh requests to reduce network overhead
4. **Dual entity support**: Handle both posts and users (with different TTL durations)
5. **Explicit user tracking**: User TTL tracking is managed explicitly (e.g. profile pages), and is not coupled to post tracking

## Decision

Create a **TTL Coordinator** (`src/core/coordinators/ttl/`) that manages data freshness based on viewport visibility. The coordinator maintains separate subscription tracking for posts and users, with type-aware TTL durations and batched refresh requests.

### Architecture

```
UI (stream viewport)
       │
       ▼ direct calls: TtlCoordinator.subscribePost(), TtlCoordinator.unsubscribePost()
┌─────────────────────────────────────────────────────────────────────┐
│                        TTL COORDINATOR                              │
│                                                                     │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐  │
│  │     POST SUBSCRIPTIONS      │  │     USER SUBSCRIPTIONS      │  │
│  │                             │  │                             │  │
│  │  TTL: configurable          │  │  TTL: configurable          │  │
│  │  Batch interval: config     │  │  Batch interval: config     │  │
│  │  Max batch: configurable    │  │  Max batch: configurable    │  │
│  │                             │  │                             │  │
│  │  subscribedPosts: Set       │  │  subscribedUsers: Set       │  │
│  │  postBatchQueue: Set        │  │  userBatchQueue: Set        │  │
│  │                             │  │  userRefCount: Map          │  │
│  └─────────────────────────────┘  └─────────────────────────────┘  │
│                    │                            │                   │
│                    ▼                            ▼                   │
│           Nexus: batch posts            Nexus: batch users          │
│                    │                            │                   │
│                    ▼                            ▼                   │
│           Update IndexedDB +            Update IndexedDB +          │
│           post_ttl table                user_ttl table              │
└─────────────────────────────────────────────────────────────────────┘
```

### Configuration

All values are configurable via environment variables in `src/config/`. The values below are **examples**:

| Config                | Example Value | Rationale                                        |
| --------------------- | ------------- | ------------------------------------------------ |
| `POST_TTL_MS`         | ~5 minutes    | Engagement counts change frequently              |
| `USER_TTL_MS`         | ~10 minutes   | Profile data changes less often                  |
| `BATCH_INTERVAL_MS`   | ~5 seconds    | Balance between freshness and network efficiency |
| `POST_MAX_BATCH_SIZE` | ~20           | Reasonable batch size for Nexus API              |
| `USER_MAX_BATCH_SIZE` | ~20           | Reasonable batch size for Nexus API              |

### TTL Tables Schema

```typescript
// post_ttl table
{
  id: CompositePostId,      // "authorPubky:postId"
  lastUpdatedAt: number     // timestamp when data was last fetched
}

// user_ttl table
{
  id: Pubky,                // user public key
  lastUpdatedAt: number     // timestamp when data was last fetched
}
```

Staleness check:

```typescript
const isStale = !record || Date.now() - record.lastUpdatedAt > TTL_MS;
```

### API

The UI calls the TTL Coordinator directly (like existing coordinators managed by `CoordinatorsManager`). This provides a typed contract and keeps the control flow easy to trace.

**Methods (UI → Coordinator):**

```typescript
subscribePost({ compositePostId }: { compositePostId: CompositePostId }): void
unsubscribePost({ compositePostId }: { compositePostId: CompositePostId }): void

subscribeUser({ pubky }: { pubky: Pubky }): void
unsubscribeUser({ pubky }: { pubky: Pubky }): void
```

**Internal behavior:**

- `CoordinatorsManager` (UI) informs coordinators of route changes via `setRoute(pathname)`
- TTL Coordinator clears subscriptions on route changes by calling `reset()` (triggered from `setRoute`)

**Coordinator Lifecycle:**

```typescript
class TtlCoordinator {
  start(): void; // Start batch tick
  stop(): void; // Stop listening + clear state
  setRoute(route: string): void; // Called by CoordinatorsManager; triggers reset() when route changes

  // UI entry points (viewport-driven)
  subscribePost(params: { compositePostId: CompositePostId }): void;
  unsubscribePost(params: { compositePostId: CompositePostId }): void;
  subscribeUser(params: { pubky: Pubky }): void;
  unsubscribeUser(params: { pubky: Pubky }): void;
}
```

### Subscription Flow

```
subscribePost(compositePostId)
    │
    ├──► Add postId to subscribedPosts
    │    └──► Check post_ttl table
    │         ├── Not found → Add to postBatchQueue (cache miss)
    │         ├── Stale (now - lastUpdatedAt > config.POST_TTL_MS) → Add to postBatchQueue
    │         └── Valid → Will be checked on next batch tick

subscribeUser(pubky)
    │
    └──► Add pubky to subscribedUsers (increment refCount)
         └──► Check user_ttl table
              ├── Not found → Add to userBatchQueue (cache miss)
              ├── Stale (now - lastUpdatedAt > config.USER_TTL_MS) → Add to userBatchQueue
              └── Valid → Will be checked on next batch tick
```

### Batch Flow (every BATCH_INTERVAL_MS)

```
onBatchTick()
    │
    ├──► Check all subscribedPosts against post_ttl table
    │    └──► Add stale posts to postBatchQueue
    │
    ├──► Check all subscribedUsers against user_ttl table
    │    └──► Add stale users to userBatchQueue
    │
    ├──► If postBatchQueue.size > 0
    │    └──► Take up to config.POST_MAX_BATCH_SIZE posts
    │         └──► Fetch posts from Nexus (batch request; post view)
    │              - Use `postStreamApi.postsByIds` (POST) → returns `NexusPost[]`
    │              └──► Persist to IndexedDB
    │              └──► Update post_ttl.lastUpdatedAt = now
    │
    └──► If userBatchQueue.size > 0
         └──► Take up to config.USER_MAX_BATCH_SIZE users
              └──► Fetch users from Nexus (batch request; user view)
                   - Use `userStreamApi.usersByIds` (POST) → returns `NexusUser[]`
                   └──► Persist to IndexedDB
                   └──► Update user_ttl.lastUpdatedAt = now

    Note: Batched requests are per-entity type (posts and users are fetched separately),
          so a tick can make up to 2 batch requests (one for posts, one for users).
          Posts are never mixed with users in the same request (per-domain batching).
```

### Refresh Strategy: `forceFetch*` (stale-but-present cache)

Local-first `getOrFetch*` methods often short-circuit when data already exists locally. For TTL refresh we need a **force refresh** path that fetches from Nexus even if the entity is present in IndexedDB.

**Methods (implemented):**

- Posts: `TtlController.forceRefreshPostsByIds({ postIds, viewerId })`
- Users: `TtlController.forceRefreshUsersByIds({ userIds, viewerId? })`

These methods should fetch **views** (not partial fragments):

- **Post view**: `NexusPost` (details + counts + relationships + tags + bookmark)
- **User view**: `NexusUser` (details + counts + relationship + tags)

Implementation note: `forceFetch*` should reuse the same per-domain batch endpoints used by the coordinator tick (e.g. call `postsByIds` / `usersByIds` with a single ID), so there is only one refresh implementation path.

The TTL Coordinator uses these methods when `(now - lastUpdatedAt) > TTL_MS` to refresh visible entities and then sets `lastUpdatedAt = now`.

### Lifecycle Gating (auth + page visibility)

The TTL Coordinator must be lifecycle-aware like other coordinators:

- Only run refresh ticks when the user is authenticated (derive `viewerId` from auth store)
- If unauthenticated, skip ticks and do not enqueue refresh work
- Pause refresh when the page is hidden (unless explicitly configured otherwise)
- On logout: stop ticking and `reset()` subscriptions

### Idempotency & Refcount Invariants

Viewport signals can be noisy; the coordinator must be safe under repeated calls:

- `subscribePost` is idempotent for the same `compositePostId` (does not double-increment author refcount)
- `unsubscribePost` is safe if called multiple times or for unknown IDs (no negative refcounts)
- `subscribeUser`/`unsubscribeUser` follow the same rule: refcounts never drop below 0
- Removing a post also removes it from `postBatchQueue` (and similarly for users when refcount reaches 0)

### Error Handling Notes

- Network errors should **not** stop the coordinator; log (once per batch) and continue
- On failure, do **not** update `lastUpdatedAt` (so the row remains stale)
- Add a small per-id cooldown (e.g. `cooldownMs`) to avoid retrying the same failing IDs every tick
  - During cooldown: IDs remain subscribed but are not re-queued until cooldown expires

### Unsubscription Flow

```
unsubscribePost(compositePostId)
    │
    ├──► Remove postId from subscribedPosts
    │    └──► Remove from postBatchQueue if present

unsubscribeUser(pubky)
    │
    ├──► Decrement userRefCount[pubky]
    └──► If refCount === 0
         ├──► Remove from subscribedUsers
         └──► Remove from userBatchQueue if present
```

### Reset Flow

Route change triggers reset via `setRoute()` (called by `CoordinatorsManager`):

```
reset()
    │
    ├──► Clear subscribedPosts set
    ├──► Clear subscribedUsers set
    ├──► Clear userRefCount map
    ├──► Clear postBatchQueue
    └──► Clear userBatchQueue

    Note: In-flight batch requests complete (data still useful for cache)
          but results won't be re-queued since subscriptions are cleared
```

## Edge Cases

### 1. Same User, Multiple Subscribers (Profiles / UI Surfaces)

Multiple UI surfaces may subscribe to the same user (e.g. profile header + profile sidebar). Use reference counting (or another subscriber-tracking strategy) to avoid premature unsubscription.

### 2. Batch In Progress When Unsubscribe Happens

- Let the fetch complete (data is still useful for cache warming)
- Item won't be re-queued on next tick since it's no longer subscribed

### 3. Route Change During Batch Request

- `reset()` clears all subscriptions immediately
- In-flight batch request completes normally
- Fetched data is persisted (useful for cache)
- Items won't be re-queued (subscriptions were cleared)

## Alternatives Considered

### Alternative: Per-Item TTL Timers

**Description**: Each subscribed item has its own timer that fires exactly when its TTL expires. Timer is created on subscribe, cancelled on unsubscribe, and restarted after refresh.

**Pros**:

- Precise TTL expiration (fires exactly when stale)
- No unnecessary checks on valid items

**Cons**:

- High complexity: create, cancel, track timers per item
- Many edge cases: orphaned timers, race conditions, timer cleanup
- Memory overhead: timer references for each subscribed item
- Bookkeeping burden: subscribe/unsubscribe must manage timer lifecycle

**Why not chosen**: The complexity cost outweighs the precision benefit. A single batch tick with TTL checks achieves the same goal with far less code and fewer failure modes.

## Consequences

### Positive ✅

- **Viewport-aware refresh**: Only refreshes data the user is viewing, not entire cache
- **Batched efficiency**: Groups requests reducing network overhead (N items → ceil(N/batchSize) requests)
- **Configurable TTLs**: Different freshness requirements for posts vs users
- **Clean lifecycle**: Auto-reset on route change clears subscriptions cleanly
- **Reference counting**: Handles shared authors correctly without redundant fetches
- **Typed integration**: Direct coordinator calls match existing patterns and are easy to refactor safely

### Negative ❌

- **Complexity**: More moving parts than simple polling (queues, ref counting, batch tick)
- **Memory overhead**: Maintains subscription sets in memory
- **TTL table writes**: Every refresh updates TTL table (additional DB writes)

### Neutral ⚠️

- **Requires UI integration**: Components must call subscribe/unsubscribe based on viewport
- **Depends on existing infrastructure**: Reuses Nexus batch endpoints and IndexedDB patterns
- **Coordinator lifecycle**: Must be managed by CoordinatorsManager like other coordinators

## Implementation Notes

### File Structure

```
src/core/coordinators/
├── ttl/
│   ├── ttl.ts              # TtlCoordinator class
│   ├── ttl.types.ts        # Types and interfaces
│   └── ttl.test.ts         # Unit tests
├── base/
│   └── ...                 # Shared coordinator utilities
```

### Integration Points

1. **TTL Tables (already present)**: Dexie tables `post_ttl` and `user_ttl` in `src/core/database/` (this ADR expects schema `{ id, lastUpdatedAt }`). These tables currently exist but are unused; TTL Coordinator will be their first consumer.
2. **UI Components**: Stream/feed components call the coordinator subscribe/unsubscribe methods based on viewport intersection
3. **Route Changes**: `CoordinatorsManager` calls `setRoute(pathname)`; TTL Coordinator resets subscriptions on change
4. **CoordinatorsManager**: Manages lifecycle (`start`/`stop` + `setRoute`) alongside other coordinators

### Viewport Detection

UI components call the coordinator directly based on Intersection Observer:

```typescript
// Pseudocode for feed item component
import { TtlCoordinator } from '@/coordinators/ttl/ttl';

useEffect(() => {
  const ttl = TtlCoordinator.getInstance();
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      ttl.subscribePost({ compositePostId });
    } else {
      ttl.unsubscribePost({ compositePostId });
    }
  });
  observer.observe(elementRef.current);
  return () => {
    observer.disconnect();
    ttl.unsubscribePost({ compositePostId });
  };
}, [compositePostId]);
```

## Related Decisions

- **ADR-0005: TTL Strategy** — Establishes per-entity TTL tracking pattern
- **ADR-0008: Coordinators Layer** — Defines coordinator architecture and patterns
- **ADR-0001: Local-First Writes** — TTL Coordinator maintains local-first UX with background refresh
