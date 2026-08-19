import { getStreamDependencyScopes, type StreamDependencyScope } from '@/models/stream/post/postStream.types';

/**
 * In-memory registry of post-stream dependency scopes invalidated by local
 * mutations (follow/unfollow, friendship transitions, profile-tag writes).
 *
 * Deliberately NOT a Dexie table or a Zustand store: mutations only mark a
 * scope dirty here, and each stream reconciles lazily on its next initial load
 * (`PostStreamApplication.prepareStreamForInitialLoad`), where the stale cache
 * rows are dropped and rebuilt from Nexus. Mounted feeds are never touched —
 * the reader keeps their scroll position and current membership until they
 * navigate back or pull to refresh (#2294, #2302).
 *
 * Being in-memory, dirtiness does not survive a hard page reload. That window
 * is bounded by the stream cache max-age staleness check, which discards
 * cached feed rows older than `getStreamCacheMaxAgeMs()` on initial load.
 */
export class PostStreamDirtyRegistry {
  private scopeRevisions: Record<StreamDependencyScope, number> = {
    follow_graph: 0,
    friends: 0,
    profile_tag: 0,
  };

  private reconciledRevisions = new Map<string, Partial<Record<StreamDependencyScope, number>>>();

  /** Marks every stream depending on `scope` as needing a rebuild on its next initial load. */
  markDirty(scope: StreamDependencyScope): void {
    this.scopeRevisions[scope] += 1;
  }

  /** True when any of the stream's dependency scopes changed since it was last reconciled. */
  isDirty(streamId: string): boolean {
    const scopes = getStreamDependencyScopes(streamId);
    if (scopes.size === 0) {
      return false;
    }

    const reconciled = this.reconciledRevisions.get(streamId);
    for (const scope of scopes) {
      if (this.scopeRevisions[scope] > (reconciled?.[scope] ?? 0)) {
        return true;
      }
    }
    return false;
  }

  /** Records that the stream's cache was rebuilt against the current scope revisions. */
  markReconciled(streamId: string): void {
    const scopes = getStreamDependencyScopes(streamId);
    if (scopes.size === 0) {
      return;
    }

    const snapshot: Partial<Record<StreamDependencyScope, number>> = {
      ...this.reconciledRevisions.get(streamId),
    };
    for (const scope of scopes) {
      snapshot[scope] = this.scopeRevisions[scope];
    }
    this.reconciledRevisions.set(streamId, snapshot);
  }

  /** Test-only: restores the pristine state. */
  reset(): void {
    this.scopeRevisions = { follow_graph: 0, friends: 0, profile_tag: 0 };
    this.reconciledRevisions.clear();
  }
}

export const postStreamDirtyRegistry = new PostStreamDirtyRegistry();
