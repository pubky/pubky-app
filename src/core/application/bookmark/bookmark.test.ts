import { buildBookmark, buildUri, decodeObject, listPrefix, parseUri } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/database/franky/franky';
import { AppError } from '@/libs/error/error';
import { ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { BookmarkModel } from '@/models/bookmark/bookmark';
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import { type PostStreamId, PostStreamTypes } from '@/models/stream/post/postStream.types';
import { PostStreamModel } from '@/models/stream/post/tables/postStream';
import { BookmarkNormalizer } from '@/pipes/bookmark/bookmark.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalBookmarkService } from '@/services/local/bookmark/bookmark';
import { stubMemoryHomeserver } from '@/test-utils/homeserver';
import { freezeSpecClock, restoreSpecClock } from '@/test-utils/spec-clock';
import { BookmarkApplication } from './bookmark';

const owner = fakeOwner(1) as Pubky;
const author = fakeOwner(2) as Pubky;
const BOOKMARKS_DIRECTORY = `${listPrefix(owner, 'private')}bookmarks/`;
const STREAM = PostStreamTypes.TIMELINE_BOOKMARKS_ALL as PostStreamId;
/** Thirteen-character Crockford post ids, distinct per index. */
const postIdAt = (index: number) => `0035V9A20W${String(index).padStart(2, '0')}0`;
const postAt = (index: number) => ({ pubky: author, id: postIdAt(index) });
const compositeAt = (index: number) => buildCompositeId(postAt(index));
const T0 = 1_793_000_000_000;

const homeserverFailure = (method: HttpMethod) =>
  new AppError({
    category: ErrorCategory.Server,
    code: ServerErrorCode.INTERNAL_ERROR,
    message: `Failed to ${method} homeserver: 500`,
    service: ErrorService.Homeserver,
    operation: method,
    context: { statusCode: HttpStatusCode.INTERNAL_SERVER_ERROR },
  });

describe('BookmarkApplication', () => {
  let homeserver: ReturnType<typeof stubMemoryHomeserver>;
  let warn: ReturnType<typeof vi.spyOn>;

  /** Stores the bookmark of post `index` on the homeserver as another device made it at `atMs`. */
  const storeRemote = async (index: number, atMs: number) => {
    freezeSpecClock(atMs);
    const bookmark = BookmarkNormalizer.to(postAt(index), owner);
    restoreSpecClock();
    await homeserver.session.storage.putBytes(bookmark.path, bookmark.body);
    return bookmark;
  };
  // Through the app's own listing, which reads a directory that is gone as empty.
  const storedPaths = async () =>
    (await HomeserverService.listAll({ baseDirectory: BOOKMARKS_DIRECTORY })).map((url) => parseUri(url).path);
  const streamIds = async () => (await PostStreamModel.findById(STREAM))?.stream ?? [];
  const seedDetails = (index: number, kind: string) =>
    PostDetailsModel.upsert({
      id: compositeAt(index),
      content: 'Hello',
      indexed_at: T0,
      kind,
      uri: buildUri(author, 'post', postIdAt(index)),
      attachments: null,
    } satisfies PostDetailsModelSchema);

  beforeEach(async () => {
    await db.initialize();
    await Promise.all([BookmarkModel.table.clear(), PostStreamModel.table.clear(), PostDetailsModel.table.clear()]);
    homeserver = stubMemoryHomeserver(owner);
    warn = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    restoreSpecClock();
    vi.restoreAllMocks();
  });

  describe('persist', () => {
    it('writes the row and the stream first, then PUTs the bookmark at its private v1 path', async () => {
      const { url, body } = BookmarkNormalizer.to(postAt(1), owner);
      const localWrite = vi.spyOn(LocalBookmarkService, 'persist');

      await BookmarkApplication.persist(HttpMethod.PUT, {
        postId: compositeAt(1),
        bookmarkUrl: url,
        bookmarkBody: body,
      });

      expect(await BookmarkModel.findById(compositeAt(1))).not.toBeNull();
      expect(await streamIds()).toEqual([compositeAt(1)]);
      expect(localWrite.mock.invocationCallOrder[0]).toBeLessThan(homeserver.spies.putBlob.mock.invocationCallOrder[0]);
      expect(homeserver.spies.putBlob).toHaveBeenCalledExactlyOnceWith({ url, blob: body });
      const stored = await homeserver.session.storage.getBytes(parseUri(url).path);
      expect(decodeObject(url, stored, 'bookmark').target).toBeNull();
      expect(await storedPaths()).toEqual([parseUri(url).path]);
    });

    it('removes the row, then deletes only the v1 file', async () => {
      const { url, body } = BookmarkNormalizer.to(postAt(1), owner);
      await BookmarkApplication.persist(HttpMethod.PUT, {
        postId: compositeAt(1),
        bookmarkUrl: url,
        bookmarkBody: body,
      });

      await BookmarkApplication.persist(HttpMethod.DELETE, { postId: compositeAt(1), bookmarkUrl: url });

      expect(await BookmarkModel.findById(compositeAt(1))).toBeNull();
      expect(await streamIds()).toEqual([]);
      expect(homeserver.spies.deleteIdempotent).toHaveBeenCalledExactlyOnceWith(url);
      expect(await storedPaths()).toEqual([]);
    });

    it('resolves when the file is already gone: a missing bookmark is what the delete wants', async () => {
      const { url } = BookmarkNormalizer.to(postAt(1), owner);
      vi.spyOn(HomeserverService, 'delete').mockRejectedValueOnce(
        new AppError({
          category: ErrorCategory.Client,
          code: ClientErrorCode.NOT_FOUND,
          message: 'Not found',
          service: ErrorService.Homeserver,
          operation: 'delete',
          context: { statusCode: HttpStatusCode.NOT_FOUND },
        }),
      );

      await expect(
        BookmarkApplication.persist(HttpMethod.DELETE, { postId: compositeAt(1), bookmarkUrl: url }),
      ).resolves.toBeUndefined();
    });

    it('refuses a PUT without its bytes before any write', async () => {
      const { url } = BookmarkNormalizer.to(postAt(1), owner);

      await expect(
        BookmarkApplication.persist(HttpMethod.PUT, { postId: compositeAt(1), bookmarkUrl: url }),
      ).rejects.toBeInstanceOf(AppError);
      expect(await BookmarkModel.findById(compositeAt(1))).toBeNull();
      expect(homeserver.spies.putBlob).not.toHaveBeenCalled();
      expect(homeserver.spies.deleteIdempotent).not.toHaveBeenCalled();
    });

    it('stops before the homeserver when the local write fails', async () => {
      const { url, body } = BookmarkNormalizer.to(postAt(1), owner);
      vi.spyOn(LocalBookmarkService, 'persist').mockRejectedValueOnce(new Error('Database error'));

      await expect(
        BookmarkApplication.persist(HttpMethod.PUT, { postId: compositeAt(1), bookmarkUrl: url, bookmarkBody: body }),
      ).rejects.toThrow('Database error');
      expect(homeserver.spies.putBlob).not.toHaveBeenCalled();
    });

    it.each([HttpMethod.PUT, HttpMethod.DELETE])(
      'rethrows a failed %s sync and keeps the local write (no rollback)',
      async (method) => {
        const { url, body } = BookmarkNormalizer.to(postAt(1), owner);
        if (method === HttpMethod.DELETE)
          await LocalBookmarkService.persist(HttpMethod.PUT, { postId: compositeAt(1) });
        homeserver.spies.putBlob.mockRejectedValueOnce(homeserverFailure(HttpMethod.PUT));
        homeserver.spies.deleteIdempotent.mockRejectedValueOnce(homeserverFailure(HttpMethod.DELETE));

        await expect(
          BookmarkApplication.persist(method, { postId: compositeAt(1), bookmarkUrl: url, bookmarkBody: body }),
        ).rejects.toBeInstanceOf(AppError);
        expect(await BookmarkApplication.exists(compositeAt(1))).toBe(method === HttpMethod.PUT);
      },
    );
  });

  describe('getCount', () => {
    it('counts bookmarked posts, collections excluded and posts not cached yet included', async () => {
      await Promise.all(
        [1, 2, 3, 4].map((index) => LocalBookmarkService.persist(HttpMethod.PUT, { postId: compositeAt(index) })),
      );
      await Promise.all([seedDetails(1, 'short'), seedDetails(2, 'collection'), seedDetails(3, 'image')]);

      await expect(BookmarkApplication.getCount()).resolves.toBe(3);
    });

    it('is zero without bookmarks', async () => {
      await expect(BookmarkApplication.getCount()).resolves.toBe(0);
    });
  });

  describe('fetchBookmarks', () => {
    it('lists the private bookmarks directory and stores nothing when it is empty', async () => {
      await expect(BookmarkApplication.fetchBookmarks(owner)).resolves.toEqual([]);

      expect(homeserver.spies.listAll).toHaveBeenCalledExactlyOnceWith({ baseDirectory: BOOKMARKS_DIRECTORY });
      expect(await BookmarkModel.findAll()).toEqual([]);
      expect(await PostStreamModel.findById(STREAM)).toMatchObject({ stream: [] });
    });

    it('stores every listed bookmark with its own time and orders the stream newest bookmark first', async () => {
      await storeRemote(1, T0 + 2_000);
      await storeRemote(2, T0 + 3_000);
      await storeRemote(3, T0 + 1_000);

      const ids = await BookmarkApplication.fetchBookmarks(owner);

      expect(ids).toEqual([compositeAt(2), compositeAt(1), compositeAt(3)]);
      expect(await streamIds()).toEqual(ids);
      expect((await PostStreamModel.findById(STREAM))?.tailCursor).toBeUndefined();
      expect(await BookmarkModel.findAllSorted()).toEqual([
        { id: compositeAt(2), created_at: T0 + 3_000 },
        { id: compositeAt(1), created_at: T0 + 2_000 },
        { id: compositeAt(3), created_at: T0 + 1_000 },
      ]);
    });

    it('reads only the bookmarks not stored locally yet, keeping the stored time of the others', async () => {
      const known = await storeRemote(1, T0 + 1_000);
      const added = await storeRemote(2, T0 + 2_000);
      await BookmarkModel.upsert({ id: compositeAt(1), created_at: T0 + 5_000 });

      await BookmarkApplication.fetchBookmarks(owner);

      expect(homeserver.spies.getBytes).toHaveBeenCalledExactlyOnceWith(added.url);
      expect(homeserver.spies.getBytes).not.toHaveBeenCalledWith(known.url);
      expect(await streamIds()).toEqual([compositeAt(1), compositeAt(2)]);
    });

    it('removes the rows the listing no longer names, from the table and the stream', async () => {
      await storeRemote(1, T0 + 1_000);
      await LocalBookmarkService.persist(HttpMethod.PUT, { postId: compositeAt(2) });
      await LocalBookmarkService.persist(HttpMethod.PUT, { postId: compositeAt(3) });
      // Bookmarked here earlier, un-bookmarked elsewhere since: no file names them any more.

      const ids = await BookmarkApplication.fetchBookmarks(owner);

      expect(ids).toEqual([compositeAt(1)]);
      expect(await BookmarkModel.findAll()).toEqual([compositeAt(1)]);
      expect(await streamIds()).toEqual([compositeAt(1)]);
    });

    it('keeps a bookmark whose time cannot be read, as made now', async () => {
      const failing = await storeRemote(1, T0);
      await storeRemote(2, T0 + 1_000);
      homeserver.spies.getBytes.mockImplementation(async (url) => {
        if (url === failing.url) throw homeserverFailure(HttpMethod.GET);
        return homeserver.session.storage.getBytes(parseUri(url).path);
      });
      const before = Date.now();

      const ids = await BookmarkApplication.fetchBookmarks(owner);

      expect(ids).toEqual([compositeAt(1), compositeAt(2)]);
      expect((await BookmarkModel.findById(compositeAt(1)))?.created_at).toBeGreaterThanOrEqual(before);
      expect(warn).toHaveBeenCalledWith(
        'Keeping a bookmark whose time could not be read as made now',
        expect.objectContaining({ url: failing.url }),
      );
    });

    it('skips files that bookmark no post, reading an overflow-form bookmark for its target', async () => {
      await storeRemote(1, T0);
      const web = buildBookmark(owner, 'https://example.com/a');
      const overflow = buildBookmark(owner, `https://example.com/${'a'.repeat(300)}`);
      const profile = buildBookmark(owner, buildUri(author, 'user'));
      for (const bookmark of [web, overflow, profile]) {
        await homeserver.session.storage.putBytes(bookmark.path, bookmark.body);
      }
      await homeserver.session.storage.putBytes('/priv/social/v1/bookmarks/notes.txt', new TextEncoder().encode('x'));

      const ids = await BookmarkApplication.fetchBookmarks(owner);

      expect(ids).toEqual([compositeAt(1)]);
      expect(homeserver.spies.getBytes).toHaveBeenCalledWith(overflow.url);
      expect(homeserver.spies.getBytes).not.toHaveBeenCalledWith(web.url);
      expect(warn).toHaveBeenCalledWith('Skipping a stored bookmark that bookmarks no post', { url: overflow.url });
      expect(warn).toHaveBeenCalledWith('Skipping a file in the bookmarks directory that bookmarks no post', {
        url: web.url,
      });
    });

    it('reads new bookmarks ten at a time', async () => {
      for (let index = 0; index < 25; index++) await storeRemote(index, T0 + index);
      let inFlight = 0;
      let peak = 0;
      homeserver.spies.getBytes.mockImplementation(async (url) => {
        peak = Math.max(peak, ++inFlight);
        await new Promise((resolve) => setTimeout(resolve, 0));
        inFlight--;
        return homeserver.session.storage.getBytes(parseUri(url).path);
      });

      const ids = await BookmarkApplication.fetchBookmarks(owner);

      expect(ids).toHaveLength(25);
      expect(ids[0]).toBe(compositeAt(24));
      expect(homeserver.spies.getBytes).toHaveBeenCalledTimes(25);
      expect(peak).toBe(10);
    });

    it('leaves alone a post this tab bookmarked or un-bookmarked while the listing was in flight', async () => {
      await storeRemote(1, T0);
      await LocalBookmarkService.persist(HttpMethod.PUT, { postId: compositeAt(1) });
      const list = homeserver.spies.listAll.getMockImplementation()!;
      homeserver.spies.listAll.mockImplementationOnce(async (params) => {
        const urls = await list(params);
        // Both writes land after the listing was taken.
        await LocalBookmarkService.persist(HttpMethod.DELETE, { postId: compositeAt(1) });
        await LocalBookmarkService.persist(HttpMethod.PUT, { postId: compositeAt(2) });
        return urls;
      });

      const ids = await BookmarkApplication.fetchBookmarks(owner);

      expect(ids).toEqual([compositeAt(2)]);
      expect(await BookmarkApplication.exists(compositeAt(1))).toBe(false);
      expect(await streamIds()).toEqual([compositeAt(2)]);
    });

    it('writes nothing once the account it started for is no longer current', async () => {
      await storeRemote(1, T0);
      await LocalBookmarkService.persist(HttpMethod.PUT, { postId: compositeAt(2) });
      let current = true;
      const list = homeserver.spies.listAll.getMockImplementation()!;
      homeserver.spies.listAll.mockImplementationOnce(async (params) => {
        const urls = await list(params);
        current = false;
        return urls;
      });

      await expect(BookmarkApplication.fetchBookmarks(owner, { isCurrent: () => current })).resolves.toEqual([]);

      expect(await BookmarkModel.findAll()).toEqual([compositeAt(2)]);
      expect(homeserver.spies.getBytes).not.toHaveBeenCalled();
    });

    it('rejects when the listing fails, leaving the local bookmarks as they were', async () => {
      await LocalBookmarkService.persist(HttpMethod.PUT, { postId: compositeAt(1) });
      homeserver.spies.listAll.mockRejectedValueOnce(homeserverFailure(HttpMethod.GET));

      await expect(BookmarkApplication.fetchBookmarks(owner)).rejects.toBeInstanceOf(AppError);
      expect(await BookmarkModel.findAll()).toEqual([compositeAt(1)]);
    });
  });
});
