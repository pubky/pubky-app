import { BOOKMARK_REMOVAL_PROTECTION_MS } from '@/config/bookmarks';

/**
 * In-memory record of the bookmarks each viewer removed locally, kept for
 * `BOOKMARK_REMOVAL_PROTECTION_MS`.
 *
 * Nexus indexes a bookmark removal a second or two after the homeserver
 * accepts it, and a post view fetched in that window still carries the removed
 * `bookmark`. `LocalStreamPostsService.persistPosts` only ever adds bookmarks
 * from Nexus, so such a response would restore the bookmark for good: the
 * collection drops out of Discover and back into Followed (#2237). Removals are
 * marked here and `persistPosts` skips them; a local bookmark create clears the
 * mark. A removal only protects the viewer who made it, like the local tag
 * mutations in `LocalTagCacheService`, so another account signing in to the
 * same tab keeps its own bookmarks.
 *
 * Deliberately in-memory, like `postStreamDirtyRegistry`: it only has to
 * outlive Nexus's indexing lag, not a page reload. It is per tab.
 */
export class RecentUnbookmarks {
  private removedAt = new Map<string, number>();

  private static key(viewerId: string, postId: string): string {
    return `${viewerId}|${postId}`;
  }

  /** Records that `viewerId` removed the bookmark on `postId` locally, dropping expired records. */
  markRemoved(viewerId: string, postId: string): void {
    const now = Date.now();
    for (const [key, removedAt] of this.removedAt) {
      if (now - removedAt >= BOOKMARK_REMOVAL_PROTECTION_MS) this.removedAt.delete(key);
    }
    this.removedAt.set(RecentUnbookmarks.key(viewerId, postId), now);
  }

  /** Forgets a removal, e.g. because the viewer bookmarked the post again. */
  clear(viewerId: string, postId: string): void {
    this.removedAt.delete(RecentUnbookmarks.key(viewerId, postId));
  }

  /**
   * True while a local removal by `viewerId` must win over a `bookmark` Nexus
   * reported for that viewer. Viewerless responses carry no bookmark to guard.
   */
  isProtected(viewerId: string | null | undefined, postId: string): boolean {
    if (!viewerId) return false;
    const key = RecentUnbookmarks.key(viewerId, postId);
    const removedAt = this.removedAt.get(key);
    if (removedAt === undefined) return false;
    if (Date.now() - removedAt < BOOKMARK_REMOVAL_PROTECTION_MS) return true;
    this.removedAt.delete(key);
    return false;
  }

  /** Test-only: restores the pristine state. */
  reset(): void {
    this.removedAt.clear();
  }
}

export const recentUnbookmarks = new RecentUnbookmarks();
