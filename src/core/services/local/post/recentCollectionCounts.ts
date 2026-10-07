import { COLLECTIONS_COUNT_PROTECTION_MS } from '@/config/collections';
import { getCacheGeneration } from '@/database/franky/franky.helpers';

type CollectionCountWrite = { writtenAt: number; cacheGeneration: number };

/**
 * In-memory record of the posts whose `collections` count the viewer changed
 * locally, kept for `COLLECTIONS_COUNT_PROTECTION_MS`.
 *
 * Saving a post to one of the viewer's collections (or removing it) bumps the
 * post's local `post_counts.collections` right away, while Nexus only reflects
 * the edit once it has indexed the collection's new envelope. Any post view
 * fetched before then still carries the old total, and
 * `LocalStreamPostsService.persistPosts` would write it back over the bump:
 * a refresh whose request started before the write, a notification hydration
 * that started after it but before indexing, or a response that merely
 * overlapped another. A TTL stamp cannot tell those apart because ordinary
 * persists renew it too, so the local writes are marked here and
 * `persistPosts` keeps the local count for marked posts; every other count in
 * the response still lands.
 *
 * Deliberately in-memory, like `recentUnbookmarks`: it only has to outlive
 * Nexus's indexing lag, not a page reload. It is per tab and keyed by post
 * alone, since the count is not viewer-relative. A mark is bound to the cache
 * generation it was made in: a sign-in or sign-out clears the rows it stood
 * for, and the count the next session downloads is the only one there is.
 */
export class RecentCollectionCounts {
  private writes = new Map<string, CollectionCountWrite>();

  /** Records a local `collections` change on `postId`, dropping expired records. */
  markWritten(postId: string): void {
    const now = Date.now();
    for (const [key, write] of this.writes) {
      if (now - write.writtenAt >= COLLECTIONS_COUNT_PROTECTION_MS) this.writes.delete(key);
    }
    this.writes.set(postId, { writtenAt: now, cacheGeneration: getCacheGeneration() });
  }

  /**
   * True while the local `collections` count of `postId` must win over the one a
   * Nexus response carries. A response persisted inside the window either predates
   * the write or may predate Nexus indexing it; one persisted after the window
   * started after the write by at least the window and is trusted.
   */
  isProtected(postId: string): boolean {
    const write = this.writes.get(postId);
    if (write === undefined) return false;
    const current =
      write.cacheGeneration === getCacheGeneration() && Date.now() - write.writtenAt < COLLECTIONS_COUNT_PROTECTION_MS;
    if (current) return true;
    this.writes.delete(postId);
    return false;
  }

  /** Test-only: restores the pristine state. */
  reset(): void {
    this.writes.clear();
  }
}

export const recentCollectionCounts = new RecentCollectionCounts();
