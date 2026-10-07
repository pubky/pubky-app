import { COLLECTIONS_COUNT_PROTECTION_MS } from '@/config/collections';

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
 * alone: the count is not viewer-relative, and a sign-in clears the rows the
 * marks would protect.
 */
export class RecentCollectionCounts {
  private writtenAt = new Map<string, number>();

  /** Records a local `collections` change on `postId`, dropping expired records. */
  markWritten(postId: string): void {
    const now = Date.now();
    for (const [key, writtenAt] of this.writtenAt) {
      if (now - writtenAt >= COLLECTIONS_COUNT_PROTECTION_MS) this.writtenAt.delete(key);
    }
    this.writtenAt.set(postId, now);
  }

  /**
   * True while the local `collections` count of `postId` must win over the one a
   * Nexus response carries. A response persisted inside the window either predates
   * the write or may predate Nexus indexing it; one persisted after the window
   * started after the write by at least the window and is trusted.
   */
  isProtected(postId: string): boolean {
    const writtenAt = this.writtenAt.get(postId);
    if (writtenAt === undefined) return false;
    if (Date.now() - writtenAt < COLLECTIONS_COUNT_PROTECTION_MS) return true;
    this.writtenAt.delete(postId);
    return false;
  }

  /** Test-only: restores the pristine state. */
  reset(): void {
    this.writtenAt.clear();
  }
}

export const recentCollectionCounts = new RecentCollectionCounts();
