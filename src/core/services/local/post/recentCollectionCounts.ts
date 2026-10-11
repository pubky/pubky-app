import { COLLECTIONS_COUNT_PROTECTION_MS } from '@/config/collections';
import { getCacheGeneration } from '@/database/franky/franky.helpers';

export type CollectionCountWrite = { writtenAt: number; cacheGeneration: number };

/**
 * In-memory record of the posts a local collection write touched, kept for
 * `COLLECTIONS_COUNT_PROTECTION_MS`.
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
 * `persistPosts` keeps the local value for marked posts; everything else in
 * the response still lands. Two registries share this shape:
 *
 * - `recentCollectionCounts`: the posts a collection gained or dropped; their
 *   local `collections` count is kept.
 * - `recentCollectionEnvelopes`: the collections the viewer wrote; their local
 *   details are kept, so a copy fetched before the edit is indexed can neither
 *   uncheck the picker nor hand the next edit a pre-edit membership baseline,
 *   which would count the same membership a second time.
 *
 * Deliberately in-memory, like `recentUnbookmarks`: it only has to outlive
 * Nexus's indexing lag, not a page reload. It is per tab and keyed by post
 * alone, since neither value is viewer-relative. A mark is bound to the cache
 * generation it was made in: a sign-in or sign-out clears the rows it stood
 * for, and the copy the next session downloads is the only one there is.
 */
// exported for unit tests (recentCollectionCounts.test.ts)
export class RecentCollectionWrites {
  private writes = new Map<string, CollectionCountWrite>();

  /**
   * Records a local write on `postId`, dropping expired records. Returns the mark it
   * replaced (or `undefined`), for `restore` should the write it announces not commit.
   */
  markWritten(postId: string): CollectionCountWrite | undefined {
    const now = Date.now();
    for (const [key, write] of this.writes) {
      if (now - write.writtenAt >= COLLECTIONS_COUNT_PROTECTION_MS) this.writes.delete(key);
    }
    const previous = this.writes.get(postId);
    this.writes.set(postId, { writtenAt: now, cacheGeneration: getCacheGeneration() });
    return previous;
  }

  /**
   * Puts back what `markWritten` replaced: the write it announced was rolled back, so the
   * row still holds the value an earlier write (if any) protects, and only that one.
   */
  restore(postId: string, previous: CollectionCountWrite | undefined): void {
    if (previous === undefined) {
      this.writes.delete(postId);
      return;
    }
    this.writes.set(postId, previous);
  }

  /**
   * True while the local value of `postId` must win over the one a Nexus response
   * carries. A response persisted inside the window either predates the write or
   * may predate Nexus indexing it. After the window every response is accepted
   * whatever its request's start time: the window is the allowance the app gives
   * Nexus for indexing, measured on this clock at persist time, not a confirmation
   * that the response saw the indexed write.
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

  /** Forgets a mark, e.g. because hydration found no local value behind it. */
  clear(postId: string): void {
    this.writes.delete(postId);
  }

  /** Test-only: restores the pristine state. */
  reset(): void {
    this.writes.clear();
  }
}

/** Posts whose local `collections` count a collection write moved. */
export const recentCollectionCounts = new RecentCollectionWrites();
/** Collections the viewer wrote locally, whose envelope is the next edit's baseline. */
export const recentCollectionEnvelopes = new RecentCollectionWrites();
