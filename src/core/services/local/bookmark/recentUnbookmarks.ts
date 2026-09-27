/**
 * How long a local unbookmark wins over the `bookmark` Nexus keeps reporting
 * until it indexes the removal. Same window as local tag writes
 * (`TAG_MUTATION_TTL_MS`); the measured indexing lag is about two seconds.
 */
export const BOOKMARK_REMOVAL_PROTECTION_MS = 300_000;

/**
 * In-memory record of the bookmarks the viewer removed locally, kept for
 * `BOOKMARK_REMOVAL_PROTECTION_MS`.
 *
 * Nexus indexes a bookmark removal a second or two after the homeserver
 * accepts it, and a post view fetched in that window still carries the removed
 * `bookmark`. `LocalStreamPostsService.persistPosts` only ever adds bookmarks
 * from Nexus, so such a response would restore the bookmark for good: the
 * collection drops out of Discover and back into Followed (#2237). Removals are
 * marked here and `persistPosts` skips them; a local bookmark create clears the
 * mark.
 *
 * Deliberately in-memory, like `postStreamDirtyRegistry`: it only has to
 * outlive Nexus's indexing lag, not a page reload. It is per tab, and not
 * scoped to the viewer: after an account switch a removal can hold back the
 * next viewer's bookmark on the same post for the rest of its window.
 */
export class RecentUnbookmarks {
  private removedAt = new Map<string, number>();

  /** Records that the viewer removed the bookmark on `postId` locally, dropping expired records. */
  markRemoved(postId: string): void {
    const now = Date.now();
    for (const [id, removedAt] of this.removedAt) {
      if (now - removedAt >= BOOKMARK_REMOVAL_PROTECTION_MS) this.removedAt.delete(id);
    }
    this.removedAt.set(postId, now);
  }

  /** Forgets a removal, e.g. because the viewer bookmarked the post again. */
  clear(postId: string): void {
    this.removedAt.delete(postId);
  }

  /** True while a local removal of `postId` must win over a `bookmark` reported by Nexus. */
  isProtected(postId: string): boolean {
    const removedAt = this.removedAt.get(postId);
    if (removedAt === undefined) return false;
    if (Date.now() - removedAt < BOOKMARK_REMOVAL_PROTECTION_MS) return true;
    this.removedAt.delete(postId);
    return false;
  }

  /** Test-only: restores the pristine state. */
  reset(): void {
    this.removedAt.clear();
  }
}

export const recentUnbookmarks = new RecentUnbookmarks();
