import { BookmarkApplication } from '@/application/bookmark/bookmark';
import { PostStreamApplication } from '@/application/stream/posts/post';
import type { TBookmarkEventParams } from '@/controllers/bookmark/bookmark.types';
import { captureViewerSession } from '@/controllers/tag/tag-cache.utils';
import { HttpMethod } from '@/libs/http/http.types';
import type { BookmarkedPostDetails } from '@/models/bookmark/bookmark.schema';
import { parseCompositeId } from '@/models/models.utils';
import { BookmarkNormalizer } from '@/pipes/bookmark/bookmark.normalizer';
import { useAuthStore } from '@/stores/auth/auth.store';

export class BookmarkController {
  private constructor() {}

  /** The `fetchMissingPosts` pass in flight, with the viewer session it runs for. */
  private static missingPostsPass: { isCurrent: () => boolean; request: Promise<void> } | null = null;

  /** How often one `fetchMissingPosts` call runs again because the account's session was replaced under it. */
  private static readonly MISSING_POSTS_SESSION_RERUNS = 2;

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
   * them, so every bookmark is classified and `getCount` is exact. The application sends them in
   * sequential `by_ids` batches (`PostStreamApplication.fetchMissingPostsInBatches`), each followed
   * by its requests for 0.x file details, missing authors and repost originals; with nothing
   * missing it is one local read and no request.
   *
   * Resolves whatever Nexus answered, and rejects only when the local read of the missing ids fails.
   * A post Nexus does not serve stays uncached, where it keeps counting as a post, as the Bookmarks
   * list shows it, and the next pass asks for it again. A batch that fails (logged by the
   * application) ends the pass, so an outage costs the wait of one batch, not of every batch, and
   * the next call asks again for its posts and the ones after them. One case does not settle:
   * TanStack pauses a retry whose back-off ends while the tab is hidden and resumes it only through
   * a mounted query client, and no Nexus client is mounted, so the pass and the callers that joined
   * it wait until the page is loaded again.
   *
   * Callers of one viewer session share the pass in flight. A pass whose session ends stops and
   * stores no post or user row under the next one; when the same account goes on under another
   * session (the restore on a hard page load, which starts from the stored pubky and no session),
   * the pass runs again under that session before it resolves, so its callers still get the posts.
   */
  static fetchMissingPosts(): Promise<void> {
    return this.startMissingPostsPass(this.MISSING_POSTS_SESSION_RERUNS);
  }

  private static startMissingPostsPass(rerunsLeft: number): Promise<void> {
    const pending = this.missingPostsPass;
    if (pending?.isCurrent()) return pending.request;

    // Bookmarks are the signed-in viewer's: a guest has none to hydrate.
    const viewerId = useAuthStore.getState().currentUserPubky;
    if (!viewerId) return Promise.resolve();

    const isCurrent = captureViewerSession();
    // The controller orchestrates the two domains: `BookmarkApplication` calls no other Application (ADR-0009).
    const request = this.getMissingPostIds()
      .then((cacheMissPostIds) =>
        PostStreamApplication.fetchMissingPostsInBatches({ cacheMissPostIds, viewerId, isCurrent }),
      )
      .then(() => {
        // The same account under another session: a hard page load starts with the stored pubky and no session,
        // and the restore replaces it while the pass is out, so the answers were dropped. Its callers still wait
        // for the posts: run again (or join the pass already running) under the session that is current now.
        // A session that was lost, not replaced, leaves nothing to run under.
        const { currentUserPubky, session } = useAuthStore.getState();
        const sessionReplaced = !isCurrent() && currentUserPubky === viewerId && session !== null;
        if (sessionReplaced && rerunsLeft > 0) return this.startMissingPostsPass(rerunsLeft - 1);
      })
      .finally(() => {
        if (this.missingPostsPass?.request === request) this.missingPostsPass = null;
      });
    this.missingPostsPass = { isCurrent, request };
    return request;
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
