import { listPrefix } from 'pubky-social-specs';
import type { TBookmarkFetchOptions, TBookmarkPersistInput } from '@/application/bookmark/bookmark.types';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { BookmarkNormalizer } from '@/pipes/bookmark/bookmark.normalizer';
import type { TBookmarkListing } from '@/pipes/bookmark/bookmark.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalBookmarkService } from '@/services/local/bookmark/bookmark';

/**
 * Bookmark application service.
 *
 * Bookmarks are private objects under `/priv/social/v1/bookmarks/`, which Nexus never sees: the
 * local `bookmarks` table is their source of truth, hydrated from the homeserver listing by
 * `fetchBookmarks` (ADR-0028).
 *
 * **Local-first write pattern:**
 * Both `create` and `delete` methods update IndexedDB before syncing the
 * homeserver.
 *
 * **Failure Handling:**
 * Local failures stop the operation before network sync. Homeserver failures
 * are rethrown with the local write left in place — there is no compensating
 * rollback or retry queue. Callers that surface bookmark state must re-read
 * local state after a failure (`useBookmark.toggle` and `useRemoveDeletedPost`
 * reconcile via `BookmarkController.exists`).
 */
export class BookmarkApplication {
  private static readonly FETCH_BOOKMARKS_BATCH_SIZE = 10;

  /**
   * Check if a post is bookmarked
   * @param postId - Composite post ID (authorId:postId)
   * @returns boolean indicating if the post is bookmarked
   */
  static async exists(postId: string): Promise<boolean> {
    return LocalBookmarkService.exists(postId);
  }

  /**
   * Get all locally-known bookmarked composite post IDs for the current
   * user, sorted by `created_at` descending (most recently bookmarked
   * first).
   *
   * Local-only read — the bookmarks table is hydrated from the homeserver
   * listing at bootstrap (`fetchBookmarks`) and kept current by this tab's
   * own bookmark writes.
   *
   * @returns Composite post IDs (`authorId:postId`), newest-bookmarked
   *   first.
   */
  static async getAll(): Promise<string[]> {
    return LocalBookmarkService.getAllBookmarksSorted();
  }

  /**
   * How many posts are bookmarked locally, bookmarked collections excluded. Local-only read.
   */
  static async getCount(): Promise<number> {
    return LocalBookmarkService.countPosts();
  }

  static async persist(action: HttpMethod, params: TBookmarkPersistInput) {
    const { postId, bookmarkUrl, bookmarkBody } = params;

    // Checked before the local write: a PUT without its bytes must never fall through to a delete.
    if (action === HttpMethod.PUT && !bookmarkBody) {
      throw Err.validation(ValidationErrorCode.MISSING_FIELD, 'A bookmark PUT needs the bytes to store', {
        service: ErrorService.Local,
        operation: 'persistBookmark',
        context: { postId, bookmarkUrl },
      });
    }

    await LocalBookmarkService.persist(action, { postId });
    if (action === HttpMethod.PUT) {
      await HomeserverService.putBlob({ url: bookmarkUrl, blob: bookmarkBody! });
    } else {
      // Only the v1 file goes: the 0.x copy, if the account had one, cannot be named (ADR-0028).
      // A missing file is the state a delete wants.
      await HomeserverService.deleteIdempotent(bookmarkUrl);
    }
  }

  /**
   * Replaces the local bookmarks with the homeserver's: LISTs the private bookmarks directory,
   * reads the bookmark time of every file not already stored locally (the listing carries none,
   * and the bookmarks feed is ordered by it), then reconciles the `bookmarks` table and the
   * bookmarks stream in one transaction. A bookmark whose read fails is kept as made now. Files
   * that bookmark no post (a web page, a profile, a post version) are skipped with a warning.
   *
   * @returns The stored bookmark ids, newest first (empty when the account changed meanwhile).
   */
  static async fetchBookmarks(pubky: Pubky, { isCurrent }: TBookmarkFetchOptions = {}): Promise<string[]> {
    // Taken before the listing: a local write after it is newer than anything the listing says.
    const since = LocalBookmarkService.captureWriteSequence();
    const urls = await HomeserverService.listAll({ baseDirectory: `${listPrefix(pubky, 'private')}bookmarks/` });
    if (isCurrent && !isCurrent()) return [];

    const listings = urls.flatMap((url) => {
      const listing = BookmarkNormalizer.fromListing(url);
      if (!listing) Logger.warn('Skipping a file in the bookmarks directory that bookmarks no post', { url });
      return listing ? [listing] : [];
    });

    const known = new Map((await LocalBookmarkService.readAll()).map((row) => [row.id, row.created_at]));
    const createdAt = new Map<string, number>();
    const unread: TBookmarkListing[] = [];
    for (const listing of listings) {
      const knownAt = listing.postId === null ? undefined : known.get(listing.postId);
      if (listing.postId !== null && knownAt !== undefined) createdAt.set(listing.postId, knownAt);
      else unread.push(listing);
    }

    for (let index = 0; index < unread.length; index += this.FETCH_BOOKMARKS_BATCH_SIZE) {
      const batch = unread.slice(index, index + this.FETCH_BOOKMARKS_BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async ({ url }) => BookmarkNormalizer.fromStored(url, await HomeserverService.getBytes(url))),
      );

      results.forEach((result, batchIndex) => {
        const { url, postId } = batch[batchIndex];
        if (result.status === 'fulfilled') {
          if (result.value.postId === null) {
            Logger.warn('Skipping a stored bookmark that bookmarks no post', { url });
            return;
          }
          createdAt.set(result.value.postId, result.value.createdAt);
          return;
        }
        if (postId === null) {
          Logger.warn('Skipping a bookmark whose target could not be read', { url, error: result.reason });
          return;
        }
        // The filename names the post: keep the bookmark, at the top of the feed.
        Logger.warn('Keeping a bookmark whose time could not be read as made now', { url, error: result.reason });
        createdAt.set(postId, Date.now());
      });
    }

    const ids = await LocalBookmarkService.reconcile({
      bookmarks: [...createdAt].map(([id, created_at]) => ({ id, created_at })),
      since,
      isCurrent,
    });
    return ids ?? [];
  }
}
