import { listPrefix } from 'pubky-social-specs';
import type { TBookmarkFetchOptions, TBookmarkPersistInput } from '@/application/bookmark/bookmark.types';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import type { BookmarkedPostDetails } from '@/models/bookmark/bookmark.schema';
import type { Pubky } from '@/models/models.types';
import { BookmarkNormalizer } from '@/pipes/bookmark/bookmark.normalizer';
import type { TBookmarkListing } from '@/pipes/bookmark/bookmark.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalBookmarkService } from '@/services/local/bookmark/bookmark';
import { awaitBounded } from '@/utils/bounded-read';
import { withSyncLock } from '@/utils/sync-lock';

/**
 * The user's bookmark sync lock (`withSyncLock`), shared by every tab: `persist` holds it `shared`
 * across the row write and the PUT or DELETE, so writes to different bookmarks overlap each other;
 * `fetchBookmarks` holds it `exclusive` from the listing through the GETs to the reconcile. So no
 * write lands between the listing and the reconcile, in this tab or another, and a bookmark being
 * written in any tab (its row stored, its PUT not yet landed) is either listed or written after the
 * fetch, never undone by it.
 */
const bookmarkSyncLock = (pubky: Pubky) => `pubky-bookmarks-sync:${pubky}`;

/**
 * One bookmark's write lock, held `exclusive` inside the user lock by `persist`: writes to the same
 * bookmark run one after another, in this tab or another, retries and their back-off included
 * (`deleteIdempotent` backs off outside the per-path write queue), so an older write's retry never
 * lands on top of a newer write. Always taken after the user lock, and `fetchBookmarks` takes the
 * user lock alone, so the two cannot deadlock.
 */
const bookmarkWriteLock = (pubky: Pubky, postId: string) => `pubky-bookmark-write:${pubky}:${postId}`;

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
   * listing at bootstrap (`fetchBookmarks`) and kept current by the bookmark
   * writes (`persist`) of every tab.
   *
   * @returns Composite post IDs (`authorId:postId`), newest-bookmarked
   *   first.
   */
  static async getAll(): Promise<string[]> {
    return LocalBookmarkService.getAllBookmarksSorted();
  }

  /**
   * Every bookmark, newest first, with the cached details of its post (`undefined` while the post
   * is not cached). Local-only read, in one Dexie transaction so a live query observes both tables.
   */
  static async getAllWithPostDetails(): Promise<BookmarkedPostDetails[]> {
    return LocalBookmarkService.readAllWithPostDetails();
  }

  /**
   * How many posts are bookmarked locally, bookmarked collections excluded. Local-only read.
   */
  static async getCount(): Promise<number> {
    return LocalBookmarkService.countPosts();
  }

  /**
   * Writes the bookmark locally, then PUTs or DELETEs its file, holding `bookmarkSyncLock` `shared` and
   * `bookmarkWriteLock` `exclusive`. Resolves true once the write ran, false when it was skipped because
   * the account changed while it waited for the locks or ran (`TBookmarkPersistInput.isCurrent`): nothing
   * landed for the account that is current now, so the caller announces nothing. A row written before the
   * change is cleared by the logout or account switch that changed the viewer; after a same-account session
   * replacement it stays until the next listing reconciles it.
   */
  static async persist(action: HttpMethod, params: TBookmarkPersistInput): Promise<boolean> {
    const { postId, userId, bookmarkUrl, bookmarkBody } = params;

    // Checked before the local write: a PUT without its bytes must never fall through to a delete.
    if (action === HttpMethod.PUT && !bookmarkBody) {
      throw Err.validation(ValidationErrorCode.MISSING_FIELD, 'A bookmark PUT needs the bytes to store', {
        service: ErrorService.Local,
        operation: 'persistBookmark',
        context: { postId, bookmarkUrl },
      });
    }

    return withSyncLock(bookmarkSyncLock(userId), 'shared', () =>
      withSyncLock(bookmarkWriteLock(userId, postId), 'exclusive', () => this.persistUnderLock(action, params)),
    );
  }

  private static async persistUnderLock(
    action: HttpMethod,
    { postId, bookmarkUrl, bookmarkBody, isCurrent }: TBookmarkPersistInput,
  ): Promise<boolean> {
    // Viewer guard before each write (`TBookmarkPersistInput.isCurrent`); a stale viewer writes nothing
    // further and does not throw (see `persist`).
    const stale = () => {
      if (!isCurrent || isCurrent()) return false;
      Logger.debug('Skipping a bookmark write: the account changed while it waited for the sync lock', { postId });
      return true;
    };

    if (stale()) return false;
    await LocalBookmarkService.persist(action, { postId });
    if (stale()) return false;
    if (action === HttpMethod.PUT) {
      await HomeserverService.putBlob({ url: bookmarkUrl, blob: bookmarkBody! });
    } else {
      // Only the v1 file goes: the 0.x copy, if the account had one, cannot be named (ADR-0028).
      // A missing file is the state a delete wants.
      await HomeserverService.deleteIdempotent(bookmarkUrl);
    }
    return true;
  }

  /**
   * Replaces the local bookmarks with the homeserver's: LISTs the private bookmarks directory,
   * reads the bookmark time of every file not already stored locally (the listing carries none,
   * and the bookmarks feed is ordered by it), then reconciles the `bookmarks` table and the
   * bookmarks stream in one transaction. A bookmark whose read fails is kept as made now. Files
   * that bookmark no post (a web page, a profile, a post version) are skipped with a warning.
   * The whole run holds `bookmarkSyncLock` `exclusive`; the wait for the LIST and for each GET batch is
   * bounded by `HOMESERVER_SYNC_READ_TIMEOUT_MS` (`awaitBounded`), after which the run fails like a failed LIST.
   *
   * @returns The stored bookmark ids, newest first (empty when the account changed meanwhile).
   */
  static async fetchBookmarks(pubky: Pubky, { isCurrent }: TBookmarkFetchOptions = {}): Promise<string[]> {
    return withSyncLock(bookmarkSyncLock(pubky), 'exclusive', () => this.fetchBookmarksUnderLock(pubky, isCurrent));
  }

  private static async fetchBookmarksUnderLock(pubky: Pubky, isCurrent?: () => boolean): Promise<string[]> {
    const baseDirectory = `${listPrefix(pubky, 'private')}bookmarks/`;
    // The lock is held across every read of this run: a timeout rejects here or at a GET batch below, before the
    // reconcile, so nothing an abandoned read answers late is ever applied.
    const urls = await awaitBounded(HomeserverService.listAll({ baseDirectory }), {
      operation: 'fetchBookmarks',
      context: { baseDirectory },
    });
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
      // The batch is bounded as a whole: a GET that fails is kept as made now (below), which for a GET that
      // merely stalled would store a wrong time for good, so a timeout fails the run like a failed LIST instead.
      const results = await awaitBounded(
        Promise.allSettled(
          batch.map(async ({ url }) => BookmarkNormalizer.fromStored(url, await HomeserverService.getBytes(url))),
        ),
        { operation: 'fetchBookmarks', context: { urls: batch.map(({ url }) => url) } },
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
      isCurrent,
    });
    return ids ?? [];
  }
}
