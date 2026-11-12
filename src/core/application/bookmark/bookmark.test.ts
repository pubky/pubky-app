import { buildBookmark, buildUri, decodeObject, listPrefix, parseUri } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOMESERVER_SYNC_READ_TIMEOUT_MS } from '@/config/network';
import { db } from '@/database/franky/franky';
import { AppError } from '@/libs/error/error';
import { ClientErrorCode, ServerErrorCode, TimeoutErrorCode } from '@/libs/error/error.codes';
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
import { createTestWebLocks } from '@/test-utils/web-locks';
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

/** A transient refusal `deleteIdempotent` retries. */
const serviceUnavailable = (method: HttpMethod) =>
  new AppError({
    category: ErrorCategory.Server,
    code: ServerErrorCode.SERVICE_UNAVAILABLE,
    message: `Failed to ${method} homeserver: 503`,
    service: ErrorService.Homeserver,
    operation: method,
    context: { statusCode: HttpStatusCode.SERVICE_UNAVAILABLE },
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
        userId: owner,
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
        userId: owner,
        bookmarkUrl: url,
        bookmarkBody: body,
      });

      await BookmarkApplication.persist(HttpMethod.DELETE, { postId: compositeAt(1), userId: owner, bookmarkUrl: url });

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
        BookmarkApplication.persist(HttpMethod.DELETE, { postId: compositeAt(1), userId: owner, bookmarkUrl: url }),
      ).resolves.toBe(true);
    });

    it('refuses a PUT without its bytes before any write', async () => {
      const { url } = BookmarkNormalizer.to(postAt(1), owner);

      await expect(
        BookmarkApplication.persist(HttpMethod.PUT, { postId: compositeAt(1), userId: owner, bookmarkUrl: url }),
      ).rejects.toBeInstanceOf(AppError);
      expect(await BookmarkModel.findById(compositeAt(1))).toBeNull();
      expect(homeserver.spies.putBlob).not.toHaveBeenCalled();
      expect(homeserver.spies.deleteIdempotent).not.toHaveBeenCalled();
    });

    it('stops before the homeserver when the local write fails', async () => {
      const { url, body } = BookmarkNormalizer.to(postAt(1), owner);
      vi.spyOn(LocalBookmarkService, 'persist').mockRejectedValueOnce(new Error('Database error'));

      await expect(
        BookmarkApplication.persist(HttpMethod.PUT, {
          postId: compositeAt(1),
          userId: owner,
          bookmarkUrl: url,
          bookmarkBody: body,
        }),
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
          BookmarkApplication.persist(method, {
            postId: compositeAt(1),
            userId: owner,
            bookmarkUrl: url,
            bookmarkBody: body,
          }),
        ).rejects.toBeInstanceOf(AppError);
        expect(await BookmarkApplication.exists(compositeAt(1))).toBe(method === HttpMethod.PUT);
      },
    );
  });

  describe('getAllWithPostDetails', () => {
    it('returns every bookmark newest first with the cached details of its post', async () => {
      // Explicit bookmark times: two persists in one tick would share `Date.now()` and tie on order.
      await BookmarkModel.upsert({ id: compositeAt(1), created_at: T0 + 1 });
      await BookmarkModel.upsert({ id: compositeAt(2), created_at: T0 + 2 });
      await seedDetails(1, 'collection');

      const bookmarked = await BookmarkApplication.getAllWithPostDetails();

      expect(bookmarked.map(({ id }) => id)).toEqual([compositeAt(2), compositeAt(1)]);
      expect(bookmarked.map(({ details }) => details?.kind)).toEqual([undefined, 'collection']);
    });
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

  describe('sync lock', () => {
    const SYNC_LOCK = `pubky-bookmarks-sync:${owner}`;
    const writeLockOf = (index: number) => `pubky-bookmark-write:${owner}:${compositeAt(index)}`;
    let otherTab: Awaited<ReturnType<typeof openOtherTab>> | null = null;

    /**
     * Another tab of the app: a second instance of every module, sharing only what tabs share (the one
     * IndexedDB behind both Dexie instances, `navigator.locks`, the homeserver). Its homeserver writes go
     * to this tab's in-memory homeserver.
     */
    async function openOtherTab() {
      vi.resetModules();
      const { BookmarkApplication: application } = await import('@/application/bookmark/bookmark');
      const { HomeserverService: service } = await import('@/services/homeserver/homeserver');
      const { db: database } = await import('@/database/franky/franky');
      vi.spyOn(service, 'putBlob').mockImplementation((params) => HomeserverService.putBlob(params));
      vi.spyOn(service, 'deleteIdempotent').mockImplementation((url) => HomeserverService.deleteIdempotent(url));
      return { application, close: () => database.close() };
    }
    /** Web Locks as the browser provides them: one manager shared by every tab (every module instance). */
    const installWebLocks = () => {
      const locks = createTestWebLocks();
      Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
      return locks;
    };
    /** Holds this tab's listing once it is taken, until `release`; `taken` resolves meanwhile. */
    const holdListing = () => {
      const taken = Promise.withResolvers<void>();
      const released = Promise.withResolvers<void>();
      const list = homeserver.spies.listAll.getMockImplementation()!;
      homeserver.spies.listAll.mockImplementationOnce(async (params) => {
        const urls = await list(params);
        taken.resolve();
        await released.promise;
        return urls;
      });
      return { taken: taken.promise, release: () => released.resolve() };
    };
    const bookmark = (application: typeof BookmarkApplication, index: number, isCurrent?: () => boolean) => {
      const { url, body } = BookmarkNormalizer.to(postAt(index), owner);
      return application.persist(HttpMethod.PUT, {
        postId: compositeAt(index),
        bookmarkUrl: url,
        bookmarkBody: body,
        userId: owner,
        isCurrent,
      });
    };
    const unbookmark = (application: typeof BookmarkApplication, index: number, isCurrent?: () => boolean) => {
      const { url } = BookmarkNormalizer.to(postAt(index), owner);
      return application.persist(HttpMethod.DELETE, {
        postId: compositeAt(index),
        bookmarkUrl: url,
        userId: owner,
        isCurrent,
      });
    };
    const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
    /** Holds this tab's next PUT until `landed` resolves, as a retry backing off would. */
    const holdPut = (landed: Promise<void>) => {
      const put = homeserver.spies.putBlob.getMockImplementation()!;
      homeserver.spies.putBlob.mockImplementationOnce(async (params) => {
        await landed;
        return put(params);
      });
    };

    afterEach(() => {
      Reflect.deleteProperty(navigator, 'locks');
      otherTab?.close();
      otherTab = null;
    });

    it('keeps a bookmark another tab makes while this tab is listing', async () => {
      installWebLocks();
      otherTab = await openOtherTab();
      const listing = holdListing();
      const settled: string[] = [];

      const fetching = BookmarkApplication.fetchBookmarks(owner).then(() => settled.push('fetch'));
      await listing.taken;
      const writing = bookmark(otherTab.application, 1).then(() => settled.push('write'));
      await tick();
      listing.release();
      await Promise.all([fetching, writing]);

      expect(await BookmarkApplication.exists(compositeAt(1))).toBe(true);
      expect(await streamIds()).toEqual([compositeAt(1)]);
      expect(settled).toEqual(['fetch', 'write']);
    });

    it('keeps an un-bookmark another tab makes while this tab is listing', async () => {
      installWebLocks();
      otherTab = await openOtherTab();
      await storeRemote(1, T0);
      await LocalBookmarkService.persist(HttpMethod.PUT, { postId: compositeAt(1) });
      const listing = holdListing();
      const settled: string[] = [];

      const fetching = BookmarkApplication.fetchBookmarks(owner).then(() => settled.push('fetch'));
      await listing.taken;
      const removing = unbookmark(otherTab.application, 1).then(() => settled.push('write'));
      await tick();
      listing.release();
      await Promise.all([fetching, removing]);

      expect(await BookmarkApplication.exists(compositeAt(1))).toBe(false);
      expect(await streamIds()).toEqual([]);
      expect(await storedPaths()).toEqual([]);
      expect(settled).toEqual(['fetch', 'write']);
    });

    it('holds the user lock shared and the bookmark lock exclusive for a write, the user lock exclusive for the fetch', async () => {
      const request = vi.spyOn(installWebLocks(), 'request');
      const other = fakeOwner(3) as Pubky;

      await bookmark(BookmarkApplication, 1);
      await BookmarkApplication.fetchBookmarks(owner);
      await unbookmark(BookmarkApplication, 1);
      homeserver.spies.listAll.mockResolvedValueOnce([]);
      await BookmarkApplication.fetchBookmarks(other);

      expect(request.mock.calls.map(([name, options]) => [name, (options as LockOptions).mode])).toEqual([
        [SYNC_LOCK, 'shared'],
        [writeLockOf(1), 'exclusive'],
        [SYNC_LOCK, 'exclusive'],
        [SYNC_LOCK, 'shared'],
        [writeLockOf(1), 'exclusive'],
        [`pubky-bookmarks-sync:${other}`, 'exclusive'],
      ]);
    });

    it('orders a PUT from another tab behind a DELETE that is retrying, so the retry never removes the file the PUT stored', async () => {
      installWebLocks();
      otherTab = await openOtherTab();
      // The real `deleteIdempotent` loop over the stub's single-attempt `delete`: the first attempt
      // fails with a 503 and the loop backs off before the second, lock held. The second attempt is
      // held until the test lets it land, so the window below does not ride on the back-off timer.
      homeserver.spies.deleteIdempotent.mockRestore();
      const remove = homeserver.spies.delete.getMockImplementation()!;
      const firstAttemptFailed = Promise.withResolvers<void>();
      const secondAttempt = Promise.withResolvers<void>();
      homeserver.spies.delete
        .mockImplementationOnce(async () => {
          firstAttemptFailed.resolve();
          throw serviceUnavailable(HttpMethod.DELETE);
        })
        .mockImplementationOnce(async (url) => {
          await secondAttempt.promise;
          return remove(url);
        });
      const { path } = BookmarkNormalizer.to(postAt(1), owner);
      await bookmark(BookmarkApplication, 1);
      const settled: string[] = [];

      const deleting = unbookmark(BookmarkApplication, 1).then(() => settled.push('delete'));
      await firstAttemptFailed.promise;
      expect(await BookmarkApplication.exists(compositeAt(1))).toBe(false);
      expect(await storedPaths()).toEqual([path]);
      // Another tab saves the same bookmark during the back-off: it waits for the whole delete.
      const saving = bookmark(otherTab.application, 1).then(() => settled.push('write'));
      await tick();
      expect(await BookmarkApplication.exists(compositeAt(1))).toBe(false);
      expect(homeserver.spies.putBlob).toHaveBeenCalledTimes(1);
      secondAttempt.resolve();
      await Promise.all([deleting, saving]);

      expect(settled).toEqual(['delete', 'write']);
      expect(homeserver.spies.delete).toHaveBeenCalledTimes(2);
      // The last write wins on both sides: the row is back, and so is the file.
      expect(await BookmarkApplication.exists(compositeAt(1))).toBe(true);
      expect(await streamIds()).toEqual([compositeAt(1)]);
      expect(await storedPaths()).toEqual([path]);
      expect(await BookmarkApplication.fetchBookmarks(owner)).toEqual([compositeAt(1)]);
    });

    it('orders a DELETE from another tab behind a PUT still syncing, so the file goes with the row', async () => {
      installWebLocks();
      otherTab = await openOtherTab();
      const landed = Promise.withResolvers<void>();
      holdPut(landed.promise);
      const settled: string[] = [];

      const saving = bookmark(BookmarkApplication, 1).then(() => settled.push('write'));
      await vi.waitFor(async () => expect(await BookmarkApplication.exists(compositeAt(1))).toBe(true));
      // The row is written and the PUT is in flight: the other tab's un-bookmark waits for it.
      const removing = unbookmark(otherTab.application, 1).then(() => settled.push('delete'));
      await tick();
      expect(await BookmarkApplication.exists(compositeAt(1))).toBe(true);
      expect(homeserver.spies.delete).not.toHaveBeenCalled();
      landed.resolve();
      await Promise.all([saving, removing]);

      expect(settled).toEqual(['write', 'delete']);
      expect(await BookmarkApplication.exists(compositeAt(1))).toBe(false);
      expect(await streamIds()).toEqual([]);
      expect(await storedPaths()).toEqual([]);
    });

    it('lets a write to another bookmark land while one is syncing, from this tab or another', async () => {
      installWebLocks();
      otherTab = await openOtherTab();
      const landed = Promise.withResolvers<void>();
      holdPut(landed.promise);
      const paths = [1, 2].map((index) => BookmarkNormalizer.to(postAt(index), owner).path);

      const saving = bookmark(BookmarkApplication, 1);
      await vi.waitFor(async () => expect(await BookmarkApplication.exists(compositeAt(1))).toBe(true));
      // The other bookmark lands while the first PUT is in flight.
      const other = bookmark(otherTab.application, 2);
      await vi.waitFor(async () => expect(await storedPaths()).toEqual([paths[1]]));
      landed.resolve();

      await expect(Promise.all([saving, other])).resolves.toEqual([true, true]);
      expect((await storedPaths()).sort()).toEqual([...paths].sort());
    });

    it.each([
      {
        method: HttpMethod.PUT,
        write: bookmark,
        hold: holdPut,
      },
      {
        method: HttpMethod.DELETE,
        write: unbookmark,
        hold: (landed: Promise<void>) => {
          const remove = homeserver.spies.deleteIdempotent.getMockImplementation()!;
          homeserver.spies.deleteIdempotent.mockImplementationOnce(async (url) => {
            await landed;
            return remove(url);
          });
        },
      },
    ])(
      'holds the lock across the $method sync, so a fetch lists only once the write has landed',
      async ({ method, write, hold }) => {
        installWebLocks();
        const isCreate = method === HttpMethod.PUT;
        const after = isCreate ? [compositeAt(1)] : [];
        if (!isCreate) {
          await storeRemote(1, T0);
          await LocalBookmarkService.persist(HttpMethod.PUT, { postId: compositeAt(1) });
        }
        const landed = Promise.withResolvers<void>();
        hold(landed.promise);

        const writing = write(BookmarkApplication, 1);
        await vi.waitFor(async () => expect(await BookmarkApplication.exists(compositeAt(1))).toBe(isCreate));
        // The row is written and the sync is in flight: the fetch, exclusive, lists only once it has landed.
        const fetching = BookmarkApplication.fetchBookmarks(owner);
        await tick();
        expect(homeserver.spies.listAll).not.toHaveBeenCalled();

        landed.resolve();
        const [written, ids] = await Promise.all([writing, fetching]);

        expect(written).toBe(true);
        expect(ids).toEqual(after);
        expect(await streamIds()).toEqual(after);
        expect(await storedPaths()).toEqual(isCreate ? [BookmarkNormalizer.to(postAt(1), owner).path] : []);
      },
    );

    it('holds the lock through the GET batch, so a write waits for the whole fetch', async () => {
      installWebLocks();
      await storeRemote(1, T0);
      const reading = Promise.withResolvers<void>();
      const read = Promise.withResolvers<void>();
      const getBytes = homeserver.spies.getBytes.getMockImplementation()!;
      homeserver.spies.getBytes.mockImplementationOnce(async (url) => {
        reading.resolve();
        await read.promise;
        return getBytes(url);
      });
      const settled: string[] = [];

      const fetching = BookmarkApplication.fetchBookmarks(owner).then(() => settled.push('fetch'));
      await reading.promise;
      const writing = bookmark(BookmarkApplication, 2).then(() => settled.push('write'));
      await tick();
      // The listing is done and a GET is in flight: the write still waits, locally and on the homeserver.
      expect(await BookmarkModel.findById(compositeAt(2))).toBeNull();
      expect(homeserver.spies.putBlob).not.toHaveBeenCalled();
      read.resolve();
      await Promise.all([fetching, writing]);

      expect(settled).toEqual(['fetch', 'write']);
      expect(await streamIds()).toEqual([compositeAt(2), compositeAt(1)]);
    });

    it('writes nothing when the account changed while a create waited for the lock', async () => {
      installWebLocks();
      const listing = holdListing();
      let current = true;

      const fetching = BookmarkApplication.fetchBookmarks(owner);
      await listing.taken;
      const writing = bookmark(BookmarkApplication, 1, () => current);
      // Signed out (or into another account) while the write waits: logout cleared the shared database.
      current = false;
      listing.release();
      await fetching;

      // The write reports that it did not run, so no caller announces it.
      await expect(writing).resolves.toBe(false);
      expect(await BookmarkModel.findById(compositeAt(1))).toBeNull();
      expect(await streamIds()).toEqual([]);
      expect(homeserver.spies.putBlob).not.toHaveBeenCalled();
    });

    it('removes nothing when the account changed while a delete waited for the lock', async () => {
      installWebLocks();
      const stored = await storeRemote(1, T0);
      await LocalBookmarkService.persist(HttpMethod.PUT, { postId: compositeAt(1) });
      const listing = holdListing();
      let current = true;

      const fetching = BookmarkApplication.fetchBookmarks(owner);
      await listing.taken;
      const removing = unbookmark(BookmarkApplication, 1, () => current);
      current = false;
      listing.release();
      await fetching;

      await expect(removing).resolves.toBe(false);
      expect(await BookmarkApplication.exists(compositeAt(1))).toBe(true);
      expect(await storedPaths()).toEqual([stored.path]);
      expect(homeserver.spies.deleteIdempotent).not.toHaveBeenCalled();
    });

    it.each([HttpMethod.PUT, HttpMethod.DELETE])(
      'reports a %s skipped when the account changes during the local write, and syncs nothing',
      async (method) => {
        const isCreate = method === HttpMethod.PUT;
        if (!isCreate) await LocalBookmarkService.persist(HttpMethod.PUT, { postId: compositeAt(1) });
        let current = true;
        const persist = LocalBookmarkService.persist.bind(LocalBookmarkService);
        vi.spyOn(LocalBookmarkService, 'persist').mockImplementationOnce(async (action, params) => {
          await persist(action, params);
          // Signed out while the row was being written: the second guard, before the sync, must fire.
          current = false;
        });

        const ran = await (isCreate ? bookmark : unbookmark)(BookmarkApplication, 1, () => current);

        // The row landed as written (the logout clears it); the homeserver never hears of it.
        expect(ran).toBe(false);
        expect(await BookmarkApplication.exists(compositeAt(1))).toBe(isCreate);
        expect(homeserver.spies.putBlob).not.toHaveBeenCalled();
        expect(homeserver.spies.deleteIdempotent).not.toHaveBeenCalled();
      },
    );

    it('releases the lock when the listing fails, so a write that follows runs', async () => {
      installWebLocks();
      homeserver.spies.listAll.mockRejectedValueOnce(homeserverFailure(HttpMethod.GET));

      await expect(BookmarkApplication.fetchBookmarks(owner)).rejects.toBeInstanceOf(AppError);
      await bookmark(BookmarkApplication, 1);

      expect(await BookmarkApplication.exists(compositeAt(1))).toBe(true);
    });

    it('releases the lock when a write fails to sync, so a fetch that follows runs', async () => {
      installWebLocks();
      homeserver.spies.putBlob.mockRejectedValueOnce(homeserverFailure(HttpMethod.PUT));

      await expect(bookmark(BookmarkApplication, 1)).rejects.toBeInstanceOf(AppError);
      // The row was left in place (no rollback) and nothing names it: the listing removes it.
      await expect(BookmarkApplication.fetchBookmarks(owner)).resolves.toEqual([]);

      expect(await BookmarkApplication.exists(compositeAt(1))).toBe(false);
    });

    it('queues a write of this tab behind the fetch where Web Locks are unavailable', async () => {
      expect('locks' in navigator).toBe(false);
      const listing = holdListing();
      const settled: string[] = [];

      const fetching = BookmarkApplication.fetchBookmarks(owner).then(() => settled.push('fetch'));
      await listing.taken;
      const writing = bookmark(BookmarkApplication, 1).then(() => settled.push('write'));
      await tick();
      expect(await BookmarkModel.findById(compositeAt(1))).toBeNull();
      listing.release();
      await Promise.all([fetching, writing]);

      expect(settled).toEqual(['fetch', 'write']);
      expect(await BookmarkApplication.exists(compositeAt(1))).toBe(true);
      expect(await streamIds()).toEqual([compositeAt(1)]);
    });

    describe('a read that never answers', () => {
      // Only the timers are faked: IndexedDB schedules its work with `setImmediate`.
      beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      const timedOut = {
        category: ErrorCategory.Timeout,
        code: TimeoutErrorCode.REQUEST_TIMEOUT,
        service: ErrorService.Homeserver,
        operation: 'fetchBookmarks',
      };
      /** Holds this tab's next LIST page as an SDK read that never answers; `taken` resolves once it is out. */
      const hangListing = () => {
        const taken = Promise.withResolvers<void>();
        const answer = Promise.withResolvers<string[]>();
        homeserver.spies.list.mockImplementationOnce(() => {
          taken.resolve();
          return answer.promise;
        });
        return { taken: taken.promise, answer: (urls: string[]) => answer.resolve(urls) };
      };
      /** Holds the GET of `url` as an SDK read that never answers; every other GET answers as before. */
      const hangRead = (url: string) => {
        const taken = Promise.withResolvers<void>();
        const answer = Promise.withResolvers<Uint8Array>();
        const getBytes = homeserver.spies.getBytes.getMockImplementation()!;
        homeserver.spies.getBytes.mockImplementation((read) => {
          if (read !== url) return getBytes(read);
          taken.resolve();
          return answer.promise;
        });
        return { taken: taken.promise, answer: (bytes: Uint8Array) => answer.resolve(bytes) };
      };
      /** Lets the pending microtasks and IndexedDB work run; the faked timers stay where they are. */
      const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

      it('lets a bookmark queued behind the LIST write once the wait is bounded, and applies nothing the LIST answers late', async () => {
        installWebLocks();
        const listing = hangListing();

        const fetching = BookmarkApplication.fetchBookmarks(owner).then(
          () => null,
          (error: unknown) => error,
        );
        await listing.taken;
        const writing = bookmark(BookmarkApplication, 1);
        await settle();
        // The write waits for the lock the listing holds: nothing written, locally or on the homeserver.
        expect(await BookmarkModel.findById(compositeAt(1))).toBeNull();
        expect(homeserver.spies.putBlob).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(HOMESERVER_SYNC_READ_TIMEOUT_MS);

        expect(await fetching).toMatchObject(timedOut);
        await expect(writing).resolves.toBe(true);
        expect(await BookmarkApplication.exists(compositeAt(1))).toBe(true);
        expect(await streamIds()).toEqual([compositeAt(1)]);
        expect(await storedPaths()).toEqual([BookmarkNormalizer.to(postAt(1), owner).path]);

        // The abandoned LIST answers now, from before the write: its reconcile would have removed the row, but
        // the fetch stopped at the read, so nothing applies it.
        listing.answer([]);
        await settle();
        expect(await BookmarkApplication.exists(compositeAt(1))).toBe(true);
        expect(await streamIds()).toEqual([compositeAt(1)]);
      });

      it('lets a bookmark queued behind a GET batch write once the wait is bounded, and applies nothing the GET answers late', async () => {
        installWebLocks();
        const stored = await storeRemote(1, T0);
        const reading = hangRead(stored.url);

        const fetching = BookmarkApplication.fetchBookmarks(owner).then(
          () => null,
          (error: unknown) => error,
        );
        await reading.taken;
        const writing = bookmark(BookmarkApplication, 2);
        await settle();
        // The listing is done and the GET is out: the write still waits for the lock.
        expect(await BookmarkModel.findById(compositeAt(2))).toBeNull();
        expect(homeserver.spies.putBlob).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(HOMESERVER_SYNC_READ_TIMEOUT_MS);

        expect(await fetching).toMatchObject(timedOut);
        await expect(writing).resolves.toBe(true);
        expect(await BookmarkApplication.exists(compositeAt(2))).toBe(true);
        // The fetch stopped at the GET, before its reconcile: the listed bookmark was not stored.
        expect(await BookmarkApplication.exists(compositeAt(1))).toBe(false);

        // The abandoned GET answers now: nothing applies it.
        reading.answer(stored.body);
        await settle();
        expect(await BookmarkApplication.exists(compositeAt(1))).toBe(false);
        expect(await streamIds()).toEqual([compositeAt(2)]);
      });
    });
  });
});
