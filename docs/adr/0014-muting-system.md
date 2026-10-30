# ADR 0014: Muting System

## Status

Accepted — 2026-01-12  
Updated — 2026-05-06 (homeserver event-stream cross-session mute sync; Nexus mute APIs removed from client)  
Updated — 2026-10-30 (social v1: mutes are private at `/priv/social/v1/mutes/{mutee}.json`; an unmute deletes both copies; the event stream is session-bound; no union with the 0.x directory)

## Context

Users need the ability to hide content from specific accounts without unfollowing or blocking them. Muting should:

- Take effect immediately in the UI (local-first)
- Persist across sessions and sync to the homeserver
- Filter posts from muted users across all feed types
- Be easily reversible without the muted user knowing

## Decision

Implement a **user-based muting system** with three storage layers and integration with post stream filtering.

### Scope

Only **users** can be muted. The system does not currently support muting:

- Words or phrases
- Threads
- Hashtags
- Post content patterns

### Data Model

Mute state is stored in the `user_relationships` table alongside follow state:

```typescript
interface UserRelationshipsModelSchema {
  id: Pubky; // The related user's ID
  following: boolean;
  followed_by: boolean;
  muted: boolean; // Mute flag
}
```

### Storage Layers

1. **IndexedDB (Dexie)** — Source of truth for relationship state
   - Table: `user_relationships`
   - Indexed on: `id`, `following`, `followed_by`, `muted`

2. **User Stream Cache** — Fast access for filtering
   - Stream ID: `UserStreamTypes.MUTED`
   - Contains: Array of muted user Pubkeys
   - Updated on mute/unmute operations

3. **Settings Store (Zustand)** — UI state management
   - Persisted to local storage via Zustand middleware
   - Synced during bootstrap

### Mute Operations

```typescript
// Create mute
LocalMuteService.create({ muter, mutee });
// 1. Upsert UserRelationshipsModel with muted: true
// 2. Add mutee to MUTED stream

// Delete mute
LocalMuteService.delete({ muter, mutee });
// 1. Update UserRelationshipsModel with muted: false
// 2. Remove mutee from MUTED stream
```

### Homeserver Sync

Mutes sync to the homeserver for cross-device persistence, as `pubky-social-specs` stores them (social v1, 2026-10-30):

- **URL Pattern**: `pubky://{muter}/priv/social/v1/mutes/{mutee}.json` (`MuteNormalizer.to` → `buildMute`), under the owner's **private** root: only a session of the owner can read, list or delete it, and no indexer (Nexus) ever sees it. The 0.x copy at `pubky://{muter}/pub/pubky.app/mutes/{mutee}` was public; the app never writes it again, and the migration gate (ADR-0026) copies it into the private tree once.
- **Sequence**: Local database first (atomicity), then homeserver (durability). A mute PUTs the built bytes (`HomeserverService.putBlob`). An unmute deletes **both copies**, the 0.x one first (`MuteNormalizer.toDeleteUrls` → `deletionPaths({ kind: 'mute' })`), each through `HomeserverService.deleteIdempotent`, so a copy that was never there (a mute made after the migration) is not an error. The grant keeps `/pub/pubky.app/:rw` for this.
- **Reads**: `MuteApplication.fetchMutedUsers` LISTs `/priv/social/v1/mutes/` **only** and reads the muted key from each `{mutee}.json` name (`parseUri(url).kind === 'mute'`; any other file in the directory is skipped). There is no union with the 0.x directory: the gate guarantees every 0.x mute was copied, an unmute deletes both copies, and the one writer left on the 0.x directory, a stale 0.x tab, is closed by the forced service-worker takeover (ADR-0021 amendment). A second LIST per bootstrap and per event would buy nothing.

**Cross-session consistency (open sessions):** While the app is running, `MuteListSyncCoordinator` (started from `CoordinatorsManager`) subscribes to the homeserver **event stream** via `@synonymdev/pubky` (`eventStreamForUser`, path prefix `/priv/social/v1/mutes/` from `src/config/mute-sync.ts`, live mode). A `/priv/` prefix is served only to a session of the tree's owner, so `HomeserverService.subscribeUserEventStreamForPath` attaches the signed-in session and fails as `Err.auth(SESSION_EXPIRED)` without one (`UNAUTHORIZED` for another owner's tree) before any request; the coordinator treats that like any other stream failure (reconnect with backoff, one outage report after the threshold). PUT/DEL events debounce to `MuteController.fetchMutedUsers`, which re-lists the private `mutes/` directory on the homeserver and refreshes the Dexie `UserStreamTypes.MUTED` stream. This keeps mute lists aligned across devices **without** Nexus mute APIs — mute lists are not indexed for the client there, and a private object never will be. The coordinator tears down and reopens that stream when navigating across disabled auth/onboarding routes and the rest of the app (and when auth or tab visibility policy changes), not on every in-app pathname change among allowed routes.

Bootstrap and migration still call `MuteApplication.fetchMutedUsers` for initial hydration (see ADR-0009), which also covers a `/priv/` event the homeserver did not deliver.

### Post Filtering

Posts from muted users are filtered using the `MuteFilter` class:

```typescript
class MuteFilter {
  static filterPosts(postIds: string[], mutedUserIds: Set<Pubky>): string[] {
    return postIds.filter((postId) => {
      const { pubky: authorId } = parseCompositeId(postId);
      return !mutedUserIds.has(authorId);
    });
  }
}
```

### Deleted Post Filtering

Deleted posts (content === `DELETED`) are also filtered from streams. This filtering:

1. **Chains with mute filtering**: Mute filter runs first (sync), then deleted filter (async)
2. **Fails open**: Posts without cached details are kept (avoids hiding valid posts)
3. **Applies in two flows**:
   - **Pagination (Flow 1)**: Filtered inside `PostStreamQueue.collect()` via async `FilterFn`
   - **"See new posts" (Flow 2)**: Filtered in `LocalStreamPostsService.mergeUnreadStreamWithPostStream()`

```typescript
// Deleted post filter (async - requires DB lookup)
// Located in PostDetailsModel.filterDeleted() for reuse across flows
const validPosts = await PostDetailsModel.filterDeleted(postIds);
```

Integration with post streams (combined filtering):

```typescript
// In PostStreamApplication.getOrFetchStreamSlice()
const mutedUserIds = await LocalStreamUsersService.findById(MUTED);
const { posts } = await postStreamQueue.collect(streamId, {
  filter: async (posts) => {
    // Sync: mute filter (O(1) Set lookup)
    const afterMuteFilter = MuteFilter.filterPosts(posts, mutedUserIds);
    // Async: deleted filter (DB read)
    return PostDetailsModel.filterDeleted(afterMuteFilter);
  },
  // ...
});
```

### UI Usage

**Muting a user** can be triggered from:

- User profile page (mute button/menu option)
- Post context menu (three-dot menu → "Mute user")

```typescript
import { HttpMethod } from '@/libs/http/http.types';
import { MuteController } from '@/controllers/mute/mute';

await MuteController.commitMute(HttpMethod.PUT, { muter: currentUserId, mutee: targetUserId });

await MuteController.commitMute(HttpMethod.DELETE, { muter: currentUserId, mutee: targetUserId });

const mutedUsers = await MuteController.fetchMutedUsers(currentUserId);
```

**Checking mute status** for UI display (e.g., showing "Muted" badge):

```typescript
import { UserController } from '@/controllers/user/user';

const relationship = await UserController.getRelationships({ userId: targetUserId });
const isMuted = relationship?.muted ?? false;
```

**Managing muted users** via settings:

- Navigate to `/settings/muted-users`
- Displays `MutedUsersList` component showing all muted users
- Each entry has an unmute action

```typescript
// Access muted users list from settings store
import { useSettingsStore } from '@/stores/settings/settings.store';

const mutedUsers = useSettingsStore((state) => state.muted);
```

## Consequences

### Positive

- Immediate UI feedback (local-first muting)
- Consistent filtering across all feed types
- Muted users are unaware they've been muted
- Easily reversible via settings UI

### Negative

- Only user-level muting (no keyword/hashtag muting)
- Muted users' posts still fetched from API (filtered client-side)
- A mute is private, so Nexus can never derive a notification or a count from it
- Filter changes don't retroactively update already-rendered posts
- Deleted post filtering requires async DB lookups (slightly slower than sync mute filter)

### Neutral

- Requires PostStreamQueue for efficient filtered pagination
- Mute list loaded into memory for O(1) lookup during filtering
- Bootstrap (and DB migration resync) fetch mutes from the homeserver; **active sessions** also refresh via `MuteListSyncCoordinator` + homeserver event stream (see Homeserver Sync above)
- Deleted post filtering uses fail-open strategy (posts without cached details are shown)

## Alternatives Considered

### Server-side muting

**Description**: Send mute list to API and have server filter posts.

**Pros**: Less data transfer, simpler client filtering

**Cons**: Exposes social graph to server, slower to update

**Why not chosen**: Violates local-first principles; mute changes should be instant.

### Keyword/Content-based muting

**Description**: Allow muting specific words, phrases, or hashtags.

**Pros**: More granular control, can hide topics not accounts

**Cons**: Requires content parsing, more complex filter logic

**Why not chosen**: Out of scope for initial implementation; user muting covers primary use case.

### Blocking instead of muting

**Description**: Combine muting with blocking (prevent interactions).

**Pros**: Stronger boundary, single concept

**Cons**: Different use case, muting is softer/reversible

**Why not chosen**: Muting and blocking serve different purposes; kept separate.

## Implementation Notes

- Mute controller: `src/core/controllers/mute/mute.ts`
- Mute application: `src/core/application/mute/mute.ts`
- Homeserver event-stream helper: `HomeserverService.subscribeUserEventStreamForPath` in `src/core/services/homeserver/homeserver.ts`
- Debounce / path constants: `src/config/mute-sync.ts`
- Coordinator: `src/core/coordinators/mute-list-sync/mute-list-sync.ts` (`MuteListSyncCoordinator`; wired from `CoordinatorsManager`)
- Mute service: `src/core/services/local/mute/mute.ts`
- Mute normalizer: `src/core/pipes/mute/mute.normalizer.ts` (`to` → `buildMute`, `toDeleteUrls` → `deletionPaths`)
- Mute filter: `src/core/application/stream/posts/muting/mute-filter.ts`
- Deleted post filter: `src/core/models/post/details/postDetails.ts` (`PostDetailsModel.filterDeleted()` static method)
- Queue types: `src/core/application/stream/posts/muting/post-stream-queue.types.ts` (`FilterFn` async support)
- Relationships model: `src/core/models/user/relationships/userRelationships.ts`
- Settings store: `src/core/stores/settings/settings.store.ts`
- UI component: `src/components/organisms/Settings/MutedUsersList/MutedUsersList.tsx`
- Settings route: `/settings/muted-users`

## Related Decisions

- [ADR-0001: Local-First Writes](./0001-local-first-writes.md) — Muting follows local-first pattern
- [ADR-0003: Streams as Caches](./0003-streams-as-caches.md) — MUTED stream is a user stream cache
- [ADR-0008: Coordinators Layer](./0008-coordinators-layer.md) — `MuteListSyncCoordinator` follows the coordinators pattern
- [ADR-0013: Post Stream Queue](./0013-post-stream-queue.md) — Enables efficient filtered pagination
- ADR-0026 (social v1 migration gate, lands with the gate PR) — Guarantees the 0.x mutes were copied before the app reads the private tree
- [ADR-0021: Service worker scope and update policy](./0021-service-worker-scope-and-update-policy.md) — The forced takeover that closes the last 0.x writer of the public mute directory
