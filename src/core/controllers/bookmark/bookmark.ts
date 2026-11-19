import { BookmarkApplication } from '@/application/bookmark/bookmark';
import { PostStreamApplication } from '@/application/stream/posts/post';
import { NEXUS_STREAM_MAX_LIMIT } from '@/config/nexus';
import type { TBookmarkEventParams } from '@/controllers/bookmark/bookmark.types';
import { captureViewerSession } from '@/controllers/tag/tag-cache.utils';
import { HttpMethod } from '@/libs/http/http.types';
import type { BookmarkedPostDetails } from '@/models/bookmark/bookmark.schema';
import type { Pubky } from '@/models/models.types';
import { parseCompositeId } from '@/models/models.utils';
import { BookmarkNormalizer } from '@/pipes/bookmark/bookmark.normalizer';
import { useAuthStore } from '@/stores/auth/auth.store';

export class BookmarkController {
  private constructor() {}

  /** The `fetchMissingPosts` pass in flight, with the viewer session it runs for. */
  private static missingPostsPass: { isCurrent: () => boolean; request: Promise<void> } | null = null;

  /**
   * Check if a post is bookmarked
   * @param postId - Composite post ID (authorId:postId)
   * @returns boolean indicating if the post is bookmarked
   */
  static async exists(postId: string): Promise<boolean> {
    return BookmarkApplication.exists(postId);
  }

  /**
   * Get all locally-known bookmarked composite post IDs for the current user.
   *
   * Local-only read — the bookmarks table is hydrated from the homeserver
   * listing at bootstrap, so it names every bookmark; the posts behind them
   * are hydrated by walking the bookmarks stream (`timeline:bookmarks:all`).
   *
   * Designed for use inside `useLiveQuery` so callers can react to follow /
   * unfollow events anywhere in the app.
   *
   * @returns Array of composite post IDs (`authorId:postId`).
   */
  static async getAll(): Promise<string[]> {
    return BookmarkApplication.getAll();
  }

  /**
   * Every bookmark of the current user, newest first, with the cached details of its post
   * (`undefined` while the post is not cached). Local-only read, designed for `useLiveQuery`: the
   * surfaces that tell bookmarked collections from bookmarked posts (Followed Collections, the
   * Discover overlay) read both tables through it in one Dexie transaction, so the live query
   * follows the details as the bookmarks stream walk hydrates them.
   */
  static async getAllWithPostDetails(): Promise<BookmarkedPostDetails[]> {
    return BookmarkApplication.getAllWithPostDetails();
  }

  /**
   * How many posts the current user bookmarked, bookmarked collections excluded. Local-only
   * read, designed for `useLiveQuery`. A bookmark whose post is not cached counts as a post, so
   * the number is exact only once `getMissingPostIds` is empty or `fetchMissingPosts` has settled
   * (`useBookmarksCollectionSummary` holds it until then).
   */
  static async getCount(): Promise<number> {
    return BookmarkApplication.getCount();
  }

  /**
   * The bookmarked posts whose details are not cached, newest bookmark first: the bookmarks that
   * cannot be told a post from a followed collection yet. Local-only read, designed for
   * `useLiveQuery`; one Dexie transaction, as `getAllWithPostDetails`.
   */
  static async getMissingPostIds(): Promise<string[]> {
    const bookmarked = await BookmarkApplication.getAllWithPostDetails();
    return bookmarked.filter(({ details }) => !details).map(({ id }) => id);
  }

  /**
   * Fetches the bookmarked posts that are not cached (`getMissingPostIds`) from Nexus and persists
   * them, so every bookmark is classified and `getCount` is exact. Sequential `by_ids` batches of
   * `NEXUS_STREAM_MAX_LIMIT`; with nothing missing it is one local read and no request.
   *
   * Always resolves, whatever came back: a post Nexus does not serve stays uncached, where it keeps
   * counting as a post, as the Bookmarks list shows it, and a batch that fails (logged by the
   * application) ends the pass, so an outage costs the wait of one batch, not of every batch; the
   * next call asks again for what is still missing. Callers of one viewer session share the pass
   * in flight. A pass that outlives its session stops and writes nothing for the next one.
   */
  static fetchMissingPosts(): Promise<void> {
    const pending = this.missingPostsPass;
    if (pending?.isCurrent()) return pending.request;

    // Bookmarks are the signed-in viewer's: a guest has none to hydrate.
    const viewerId = useAuthStore.getState().currentUserPubky;
    if (!viewerId) return Promise.resolve();

    const isCurrent = captureViewerSession();
    const request = this.fetchMissingPostsInBatches(viewerId, isCurrent).finally(() => {
      if (this.missingPostsPass?.request === request) this.missingPostsPass = null;
    });
    this.missingPostsPass = { isCurrent, request };
    return request;
  }

  private static async fetchMissingPostsInBatches(viewerId: Pubky, isCurrent: () => boolean): Promise<void> {
    const missingPostIds = await this.getMissingPostIds();
    for (let index = 0; index < missingPostIds.length; index += NEXUS_STREAM_MAX_LIMIT) {
      // The controller orchestrates the two domains: `BookmarkApplication` calls no other Application (ADR-0009).
      const hydrated = await PostStreamApplication.fetchMissingPostsFromNexus({
        cacheMissPostIds: missingPostIds.slice(index, index + NEXUS_STREAM_MAX_LIMIT),
        viewerId,
        isCurrent,
      });
      // False when the batch failed or the session changed: the batches left would fail or be dropped as well.
      if (!hydrated) return;
    }
  }

  /**
   * Create a bookmark
   * @param params - Parameters object
   * @param params.userId - ID of the user creating the bookmark (current user)
   * @param params.postId - Composite post ID (authorId:postId)
   * @returns Whether the write ran: false when it was skipped because the account changed while it waited
   *   for the sync lock or ran (`BookmarkApplication.persist`), so there is nothing to announce
   */
  static async commitCreate({ postId, userId }: TBookmarkEventParams): Promise<boolean> {
    const { url, body } = BookmarkNormalizer.to(parseCompositeId(postId), userId);

    return BookmarkApplication.persist(HttpMethod.PUT, {
      postId,
      userId,
      bookmarkUrl: url,
      bookmarkBody: body,
      isCurrent: captureViewerSession(),
    });
  }

  /**
   * Delete a bookmark
   * @param params - Parameters object
   * @param params.userId - ID of the user removing the bookmark (current user)
   * @param params.postId - Composite post ID (authorId:postId)
   * @returns Whether the delete ran: false when it was skipped because the account changed while it waited
   *   for the sync lock or ran (`BookmarkApplication.persist`), so there is nothing to announce
   */
  static async commitDelete({ postId, userId }: TBookmarkEventParams): Promise<boolean> {
    // The bookmark's path spells its target, so building it again names the file to delete.
    const { url } = BookmarkNormalizer.to(parseCompositeId(postId), userId);

    return BookmarkApplication.persist(HttpMethod.DELETE, {
      postId,
      userId,
      bookmarkUrl: url,
      isCurrent: captureViewerSession(),
    });
  }
}
