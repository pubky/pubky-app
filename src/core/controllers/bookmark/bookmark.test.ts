import { buildUri, decodeObject, parseUri } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { BookmarkApplication } from '@/application/bookmark/bookmark';
import { NEXUS_STREAM_MAX_LIMIT } from '@/config/nexus';
import { db } from '@/database/franky/franky';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { BookmarkModel } from '@/models/bookmark/bookmark';
import type { Pubky } from '@/models/models.types';
import { buildCompositeId, parseCompositeId } from '@/models/models.utils';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import { PostNormalizer } from '@/pipes/post/post.normalizer';
import type { NexusPost } from '@/services/nexus/nexus.types';
import { NexusPostStreamService } from '@/services/nexus/stream/posts/postStream';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';
import { useAuthStore } from '@/stores/auth/auth.store';
import { mockNexusPostWire } from '@/test-utils/nexus';
import { mockSession } from '@/test-utils/pubky';
import { BookmarkController } from './bookmark';
import type { TBookmarkEventParams } from './bookmark.types';

// Test data
const testData = {
  userPubky: fakeOwner(1) as Pubky,
  authorPubky: fakeOwner(2) as Pubky,
  postId: '0035V9A20WSE4',
  get compositePostId() {
    return buildCompositeId({ pubky: this.authorPubky, id: this.postId });
  },
};

// Helper functions
const createBookmarkParams = (): TBookmarkEventParams => ({
  userId: testData.userPubky,
  postId: testData.compositePostId,
});

describe('BookmarkController', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ currentUserPubky: null, session: null });
    vi.spyOn(BookmarkApplication, 'persist').mockResolvedValue(true);
  });

  describe('getAll', () => {
    it('delegates to BookmarkApplication.getAll and returns its result', async () => {
      const sortedIds = ['authorA:p1', 'authorB:p2'];
      const getAllSpy = vi.spyOn(BookmarkApplication, 'getAll').mockResolvedValue(sortedIds);

      const result = await BookmarkController.getAll();

      expect(getAllSpy).toHaveBeenCalledTimes(1);
      expect(result).toEqual(sortedIds);
    });

    it('propagates errors from the application layer', async () => {
      vi.spyOn(BookmarkApplication, 'getAll').mockRejectedValue(new Error('boom'));

      await expect(BookmarkController.getAll()).rejects.toThrow('boom');
    });
  });

  describe('getAllWithPostDetails', () => {
    it('delegates to BookmarkApplication.getAllWithPostDetails and returns its rows', async () => {
      const rows = [{ id: 'authorA:p1', created_at: 2, details: undefined }];
      const spy = vi.spyOn(BookmarkApplication, 'getAllWithPostDetails').mockResolvedValue(rows);

      await expect(BookmarkController.getAllWithPostDetails()).resolves.toBe(rows);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCount', () => {
    it('delegates to BookmarkApplication.getCount', async () => {
      vi.spyOn(BookmarkApplication, 'getCount').mockResolvedValue(7);

      await expect(BookmarkController.getCount()).resolves.toBe(7);
    });
  });

  // Through the real application, local services and Dexie database; only the Nexus boundary
  // (`by_ids` for posts and for their authors) is stubbed.
  describe('missing posts', () => {
    /** Thirteen-character Crockford post ids, distinct per index. */
    const postAt = (index: number) =>
      buildCompositeId({ pubky: testData.authorPubky, id: `0035V9A2${String(index).padStart(4, '0')}0` });
    /** Bookmarks the posts, the first one newest. */
    const bookmarkAll = (ids: string[]) =>
      BookmarkModel.table.bulkPut(ids.map((id, index) => ({ id, created_at: 10_000 - index })));
    /** A bookmarked post as `by_ids` answers it, past the read boundary. */
    const served = (id: string, kind: 'note' | 'collection' = 'note'): NexusPost =>
      PostNormalizer.fromNexus(mockNexusPostWire({ id: parseCompositeId(id).id, author: testData.authorPubky, kind }));
    const cached = (id: string) => ({
      id,
      content: 'x',
      indexed_at: 1,
      kind: 'short',
      uri: buildUri(testData.authorPubky, 'post', parseCompositeId(id).id),
      attachments: null,
    });
    const answer = () => Promise.withResolvers<NexusPost[]>();
    const requestedIds = (call: number) => byIds.mock.calls[call][0].post_ids;
    const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
    const signIn = (pubky: Pubky = testData.userPubky) =>
      useAuthStore.setState({ currentUserPubky: pubky, session: mockSession() });

    const BOOKMARKED = Array.from({ length: 120 }, (_, index) => postAt(index + 1));
    /** The batches the pass asks for: three while Nexus caps a request at fifty ids. */
    const BATCHES = Array.from({ length: Math.ceil(BOOKMARKED.length / NEXUS_STREAM_MAX_LIMIT) }, (_, index) =>
      BOOKMARKED.slice(index * NEXUS_STREAM_MAX_LIMIT, (index + 1) * NEXUS_STREAM_MAX_LIMIT),
    );

    let byIds: MockInstance<typeof NexusPostStreamService.fetchByIds>;

    beforeEach(async () => {
      await db.initialize();
      await Promise.all([BookmarkModel.table.clear(), PostDetailsModel.table.clear()]);
      byIds = vi.spyOn(NexusPostStreamService, 'fetchByIds').mockResolvedValue([]);
      vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue([]);
      signIn();
    });

    describe('getMissingPostIds', () => {
      it('names the bookmarked posts without cached details, newest bookmark first', async () => {
        await bookmarkAll([postAt(1), postAt(2), postAt(3)]);
        await PostDetailsModel.upsert(cached(postAt(2)));

        await expect(BookmarkController.getMissingPostIds()).resolves.toEqual([postAt(1), postAt(3)]);
      });

      it('is empty without bookmarks and once every bookmarked post is cached', async () => {
        await expect(BookmarkController.getMissingPostIds()).resolves.toEqual([]);

        await bookmarkAll([postAt(1)]);
        await PostDetailsModel.upsert(cached(postAt(1)));

        await expect(BookmarkController.getMissingPostIds()).resolves.toEqual([]);
      });
    });

    describe('fetchMissingPosts', () => {
      it('asks Nexus for nothing when every bookmarked post is cached', async () => {
        await bookmarkAll([postAt(1), postAt(2)]);
        await PostDetailsModel.table.bulkPut([cached(postAt(1)), cached(postAt(2))]);

        await BookmarkController.fetchMissingPosts();

        expect(byIds).not.toHaveBeenCalled();
      });

      it('fetches 120 uncached posts in batches of the Nexus limit, one after another, in bookmark order', async () => {
        await bookmarkAll(BOOKMARKED);
        const answers = BATCHES.map(answer);
        answers.forEach(({ promise }) => byIds.mockReturnValueOnce(promise));

        const pass = BookmarkController.fetchMissingPosts();

        for (const [index, batch] of BATCHES.entries()) {
          await vi.waitFor(() => expect(byIds).toHaveBeenCalledTimes(index + 1));
          expect(requestedIds(index)).toEqual(batch);
          expect(byIds.mock.calls[index][0].viewer_id).toBe(testData.userPubky);
          // The next batch waits for this one.
          await tick();
          expect(byIds).toHaveBeenCalledTimes(index + 1);
          answers[index].resolve(batch.map((id) => served(id)));
        }
        await pass;

        expect(byIds).toHaveBeenCalledTimes(BATCHES.length);
        expect(await PostDetailsModel.table.count()).toBe(120);
        await expect(BookmarkController.getMissingPostIds()).resolves.toEqual([]);
      });

      it('resolves when a batch fails, leaves the rest for the next call and asks again then', async () => {
        const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
        await bookmarkAll(BOOKMARKED);
        byIds
          .mockResolvedValueOnce(BATCHES[0].map((id) => served(id)))
          .mockRejectedValueOnce(new Error('nexus is down'));

        await expect(BookmarkController.fetchMissingPosts()).resolves.toBeUndefined();

        // An outage is waited out once, not once per batch left.
        expect(byIds).toHaveBeenCalledTimes(2);
        expect(warn).toHaveBeenCalledWith('Failed to fetch missing posts from Nexus', expect.anything());
        // What was not fetched stays uncached, so its bookmarks keep counting as posts.
        const left = BOOKMARKED.slice(BATCHES[0].length);
        await expect(BookmarkController.getMissingPostIds()).resolves.toEqual(left);

        byIds.mockImplementation(async ({ post_ids }) => post_ids.map((id) => served(id)));
        await BookmarkController.fetchMissingPosts();

        expect(requestedIds(2)).toEqual(BATCHES[1]);
        await expect(BookmarkController.getMissingPostIds()).resolves.toEqual([]);
      });

      it('leaves a post Nexus does not serve uncached, resolves, and asks again on the next call', async () => {
        await bookmarkAll([postAt(1), postAt(2)]);
        byIds.mockResolvedValue([served(postAt(2), 'collection')]);

        await BookmarkController.fetchMissingPosts();

        await expect(BookmarkController.getMissingPostIds()).resolves.toEqual([postAt(1)]);
        await expect(BookmarkController.getCount()).resolves.toBe(1);

        // The settled pass is not kept: a later call reads again and fetches what is still missing.
        await BookmarkController.fetchMissingPosts();

        expect(byIds).toHaveBeenCalledTimes(2);
        expect(requestedIds(1)).toEqual([postAt(1)]);
      });

      it('shares the pass in flight between callers of one session', async () => {
        await bookmarkAll([postAt(1), postAt(2)]);
        const pending = answer();
        byIds.mockReturnValue(pending.promise);

        const first = BookmarkController.fetchMissingPosts();
        const second = BookmarkController.fetchMissingPosts();
        await vi.waitFor(() => expect(byIds).toHaveBeenCalledTimes(1));
        await tick();

        expect(second).toBe(first);
        expect(byIds).toHaveBeenCalledTimes(1);

        pending.resolve([served(postAt(1)), served(postAt(2))]);
        await Promise.all([first, second]);
        expect(byIds).toHaveBeenCalledTimes(1);
      });

      it('stops and writes nothing once its viewer session is gone', async () => {
        await bookmarkAll(BOOKMARKED);
        const pending = answer();
        byIds.mockReturnValueOnce(pending.promise);

        const pass = BookmarkController.fetchMissingPosts();
        await vi.waitFor(() => expect(byIds).toHaveBeenCalledTimes(1));

        // The viewer signs out and another account signs in while the first batch is out.
        signIn(fakeOwner(3) as Pubky);
        pending.resolve(BATCHES[0].map((id) => served(id)));
        await pass;

        expect(await PostDetailsModel.table.count()).toBe(0);
        expect(byIds).toHaveBeenCalledTimes(1);
      });

      it('starts a pass of its own for a new session instead of joining the previous one', async () => {
        await bookmarkAll([postAt(1)]);
        const stale = answer();
        const fresh = answer();
        byIds.mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise);

        const previous = BookmarkController.fetchMissingPosts();
        await vi.waitFor(() => expect(byIds).toHaveBeenCalledTimes(1));
        // Same account, new session: the database was cleared in between, so the old pass hydrates nothing.
        signIn();
        const current = BookmarkController.fetchMissingPosts();

        expect(current).not.toBe(previous);
        await vi.waitFor(() => expect(byIds).toHaveBeenCalledTimes(2));

        stale.resolve([served(postAt(1))]);
        await previous;
        expect(await PostDetailsModel.table.count()).toBe(0);
        // The previous pass settling does not release the current one.
        expect(BookmarkController.fetchMissingPosts()).toBe(current);

        fresh.resolve([served(postAt(1))]);
        await current;
        expect(await PostDetailsModel.table.count()).toBe(1);
      });

      it('reads and fetches nothing for a guest', async () => {
        await bookmarkAll([postAt(1)]);
        useAuthStore.setState({ currentUserPubky: null, session: null });
        const read = vi.spyOn(BookmarkApplication, 'getAllWithPostDetails');

        await BookmarkController.fetchMissingPosts();

        expect(read).not.toHaveBeenCalled();
        expect(byIds).not.toHaveBeenCalled();
      });
    });
  });

  describe('commitCreate', () => {
    it('PUTs the private v1 bookmark of the post', async () => {
      const persistSpy = vi.mocked(BookmarkApplication.persist);

      await BookmarkController.commitCreate(createBookmarkParams());

      const [method, input] = persistSpy.mock.calls[0];
      expect(method).toBe(HttpMethod.PUT);
      expect(input.postId).toBe(testData.compositePostId);
      // The application keys the sync lock on the user; it never parses the user out of the URL.
      expect(input.userId).toBe(testData.userPubky);
      expect(input.isCurrent).toEqual(expect.any(Function));
      expect(input.bookmarkUrl).toContain(`pubky://${testData.userPubky}/priv/social/v1/bookmarks/`);
      const parsed = parseUri(input.bookmarkUrl);
      expect(parsed.kind === 'bookmark' && parsed.target).toBe(buildUri(testData.authorPubky, 'post', testData.postId));
      expect(decodeObject(input.bookmarkUrl, input.bookmarkBody!, 'bookmark').target).toBeNull();
    });

    it('hands the application a session guard that expires on logout and same-account re-login', async () => {
      useAuthStore.setState({ currentUserPubky: testData.userPubky, session: mockSession() });

      await BookmarkController.commitCreate(createBookmarkParams());

      // Checked by the application once the sync lock is acquired: a write that waited may start after a logout.
      const isCurrent = vi.mocked(BookmarkApplication.persist).mock.calls[0][1].isCurrent!;
      expect(isCurrent()).toBe(true);
      useAuthStore.setState({ currentUserPubky: null, session: null });
      expect(isCurrent()).toBe(false);
      useAuthStore.setState({ currentUserPubky: testData.userPubky, session: mockSession() });
      expect(isCurrent()).toBe(false);
    });

    it('reports whether the write ran, so a skip for a signed-out viewer reaches the hooks', async () => {
      await expect(BookmarkController.commitCreate(createBookmarkParams())).resolves.toBe(true);
      vi.mocked(BookmarkApplication.persist).mockResolvedValueOnce(false);
      await expect(BookmarkController.commitCreate(createBookmarkParams())).resolves.toBe(false);
      vi.mocked(BookmarkApplication.persist).mockResolvedValueOnce(false);
      await expect(BookmarkController.commitDelete(createBookmarkParams())).resolves.toBe(false);
    });

    it('refuses a post id the data model cannot reference, before any write', async () => {
      const error = await BookmarkController.commitCreate({
        userId: testData.userPubky,
        postId: `${testData.authorPubky}:abc123xyz`,
      }).catch((reason: unknown) => reason);

      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ValidationErrorCode.INVALID_INPUT);
      expect(BookmarkApplication.persist).not.toHaveBeenCalled();
    });
  });

  describe('commitDelete', () => {
    it('deletes the file the create wrote', async () => {
      const persistSpy = vi.mocked(BookmarkApplication.persist);

      await BookmarkController.commitCreate(createBookmarkParams());
      await BookmarkController.commitDelete(createBookmarkParams());

      const created = persistSpy.mock.calls[0][1];
      expect(persistSpy).toHaveBeenLastCalledWith(HttpMethod.DELETE, {
        postId: testData.compositePostId,
        userId: testData.userPubky,
        bookmarkUrl: created.bookmarkUrl,
        isCurrent: expect.any(Function),
      });
    });
  });
});
