import { buildFile, buildPost } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileApplication } from '@/application/file/file';
import { PostApplication } from '@/application/post/post';
import { HOMESERVER_SYNC_READ_TIMEOUT_MS } from '@/config/network';
import { AuthErrorCode, ClientErrorCode, ServerErrorCode, TimeoutErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import { isPostDeleted } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import type { TFileAttachmentResult } from '@/pipes/file/file.types';
import { PostNormalizer } from '@/pipes/post/post.normalizer';
import { postReferenceSpellings } from '@/pipes/post/post.reference';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPostService } from '@/services/local/post/post';
import { useAuthStore } from '@/stores/auth/auth.store';
import { stubMemoryHomeserver } from '@/test-utils/homeserver';
import { createTestWebLocks } from '@/test-utils/web-locks';

const OWNER = fakeOwner(1) as Pubky;
const FRIEND = fakeOwner(2) as Pubky;

/**
 * A create, an edit and a delete of one post through the real `PostApplication`, `LocalPostService` and Dexie
 * against the in-memory homeserver, with the Web Locks a browser shares between tabs: the three hold the post's
 * write lock `pubky-post-write:<owner>:<postId>` exclusive, so whichever started second waits, an edit queued
 * behind a delete finds the tombstone and writes nothing, and a delete queued behind a create or an edit lists
 * the version it PUT.
 */
describe('PostApplication post write lock', () => {
  let homeserver: ReturnType<typeof stubMemoryHomeserver>;
  let locks: LockManager;
  let otherTab: Awaited<ReturnType<typeof openOtherTab>> | null = null;
  /** Holds a failing test may leave, released after it so the next test does not wait on them. */
  const holds: Array<() => void> = [];
  /**
   * The runs a test started, settled after it so none is still writing when the next test begins. A rejection
   * is handled here, since a test asserts it only once the run it was queued behind has settled.
   */
  const runs: Promise<unknown>[] = [];
  const run = <T>(promise: Promise<T>) => {
    runs.push(promise.catch(() => undefined));
    return promise;
  };

  const lockOf = (postId: string) => `pubky-post-write:${OWNER}:${postId}`;
  const notFound = { code: ClientErrorCode.NOT_FOUND, message: 'Post not found' };

  /** The post's stored version files; an empty directory is a 404 on the memory homeserver, read as none. */
  const versions = (postId: string) =>
    homeserver.session.storage
      .list(`/pub/social/v1/posts/${postId}/`, null, false, 100, false)
      .catch((error: { message?: string }) => {
        if (String(error?.message).startsWith('404')) return [] as string[];
        throw error;
      });

  const publish = async (content: string, fileAttachments?: TFileAttachmentResult[]) => {
    const post = fileAttachments
      ? buildPost(OWNER, {
          kind: 'image',
          content,
          attachments: fileAttachments.map(({ media }) => ({ uri: media.url })),
        })
      : buildPost(OWNER, { content });
    const compositePostId = `${OWNER}:${post.id}`;
    await PostApplication.commitCreate({ compositePostId, post, fileAttachments });
    return { compositePostId, postId: post.id, firstUrl: post.url };
  };

  const publishCollection = async (name: string) => {
    const post = PostNormalizer.toCollection({ name, items: [] }, OWNER);
    const compositePostId = `${OWNER}:${post.id}`;
    await PostApplication.commitCreate({ compositePostId, post });
    return { compositePostId, postId: post.id };
  };

  const attachment = (byte: number): TFileAttachmentResult => {
    const bytes = new Uint8Array([byte, byte, byte]);
    return {
      media: buildFile(OWNER, { bytes, type: 'image/png' }),
      bytes,
      name: `a-${byte}.png`,
      contentType: 'image/png',
    };
  };

  const row = (compositePostId: string) => PostDetailsModel.findById(compositePostId);

  /** Web Locks as the browser provides them: one manager shared by every tab (every module instance). */
  const installWebLocks = () => {
    locks = createTestWebLocks();
    Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
    return locks;
  };

  /**
   * Another tab of the app: a second instance of every module, sharing only what tabs share (the one IndexedDB
   * behind both Dexie instances, `navigator.locks`, the homeserver). Its homeserver calls go to this tab's
   * in-memory homeserver; `events` records its listings.
   */
  async function openOtherTab(events: string[] = []) {
    vi.resetModules();
    const { PostApplication: application } = await import('@/application/post/post');
    const { HomeserverService: service } = await import('@/services/homeserver/homeserver');
    const { db: database } = await import('@/database/franky/franky');
    vi.spyOn(service, 'putBlob').mockImplementation((params) => HomeserverService.putBlob(params));
    vi.spyOn(service, 'deleteIdempotent').mockImplementation((url) => HomeserverService.deleteIdempotent(url));
    vi.spyOn(service, 'listAll').mockImplementation((params) => {
      events.push('B:list');
      return HomeserverService.listAll(params);
    });
    vi.spyOn(service, 'exists').mockImplementation((url) => HomeserverService.exists(url));
    vi.spyOn(service, 'getBytes').mockImplementation((url) => HomeserverService.getBytes(url));
    return { application, close: () => database.close() };
  }

  /** A hold a test releases, or the `afterEach` does: `taken` resolves once the held call is reached. */
  const gate = () => {
    const taken = Promise.withResolvers<void>();
    const released = Promise.withResolvers<void>();
    holds.push(() => released.resolve());
    return { taken, released, handle: { taken: taken.promise, release: () => released.resolve() } };
  };
  /**
   * Holds this tab's version PUT (any PUT but the first version's) once reached, until `release`; it then lands
   * (`onLanded` runs after) or, with `fail`, is refused with that error.
   */
  const holdPut = (firstUrl: string, { onLanded, fail }: { onLanded?: () => void; fail?: Error } = {}) => {
    const { taken, released, handle } = gate();
    const put = homeserver.spies.putBlob.getMockImplementation()!;
    homeserver.spies.putBlob.mockImplementation(async (params) => {
      if (params.url === firstUrl) return put(params);
      taken.resolve();
      await released.promise;
      if (fail) throw fail;
      await put(params);
      onLanded?.();
    });
    return handle;
  };
  /** Holds this tab's next PUT (a create's first version) once reached, until `release`. */
  const holdNextPut = () => {
    const { taken, released, handle } = gate();
    const put = homeserver.spies.putBlob.getMockImplementation()!;
    homeserver.spies.putBlob.mockImplementationOnce(async (params) => {
      taken.resolve();
      await released.promise;
      await put(params);
    });
    return handle;
  };
  /** Holds this tab's next listing once it is taken, until `release`; `taken` resolves meanwhile. */
  const holdListing = () => {
    const { taken, released, handle } = gate();
    const list = homeserver.spies.listAll.getMockImplementation()!;
    homeserver.spies.listAll.mockImplementationOnce(async (params) => {
      const urls = await list(params);
      taken.resolve();
      await released.promise;
      return urls;
    });
    return handle;
  };
  /** Holds this tab's next upload batch (`commitCreate`) or media collection (`commitDelete`) once it starts. */
  const holdFileWrite = (method: 'commitCreate' | 'commitDelete') => {
    const { taken, released, handle } = gate();
    vi.spyOn(FileApplication, method).mockImplementationOnce(async () => {
      taken.resolve();
      await released.promise;
    });
    return handle;
  };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

  beforeEach(async () => {
    homeserver = stubMemoryHomeserver(OWNER);
    useAuthStore.setState({ currentUserPubky: OWNER, generation: 'g1' });
    vi.spyOn(Logger, 'debug').mockImplementation(() => {});
    vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger, 'error').mockImplementation(() => {});
    // Uploads never reach the homeserver here, and the media collection a delete ends with asks Nexus.
    vi.spyOn(FileApplication, 'commitCreate').mockResolvedValue(undefined);
    vi.spyOn(FileApplication, 'commitDeleteUploaded').mockResolvedValue(undefined);
    vi.spyOn(FileApplication, 'commitDelete').mockResolvedValue(undefined);
    await PostDetailsModel.table.clear();
    installWebLocks();
  });

  afterEach(async () => {
    holds.splice(0).forEach((release) => release());
    await Promise.allSettled(runs.splice(0));
    Reflect.deleteProperty(navigator, 'locks');
    otherTab?.close();
    otherTab = null;
    vi.restoreAllMocks();
  });

  describe('a create, then a delete of the same post', () => {
    it('waits for the first version PUT in flight, then lists and deletes it; the row stays a tombstone', async () => {
      const post = buildPost(OWNER, { content: 'new' });
      const compositePostId = `${OWNER}:${post.id}`;
      const settled: string[] = [];
      const put = holdNextPut();

      const creating = run(PostApplication.commitCreate({ compositePostId, post }).then(() => settled.push('create')));
      await put.taken;
      const deleting = run(
        PostApplication.commitDelete({ compositePostId, canWriteLegacy: true }).then(() => settled.push('delete')),
      );
      await tick();
      // The delete waits for the create: the row is live and nothing was listed yet.
      const live = await row(compositePostId);
      expect(live?.content).toBe('new');
      expect(isPostDeleted(live)).toBe(false);
      expect(homeserver.spies.listAll).not.toHaveBeenCalled();
      put.release();
      await Promise.all([creating, deleting]);

      expect(settled).toEqual(['create', 'delete']);
      // The listing taken after the PUT named the version, so it was deleted instead of landing after "Post deleted".
      expect(homeserver.spies.deleteIdempotent).toHaveBeenCalledExactlyOnceWith(post.url);
      expect(await versions(post.id)).toEqual([]);
      expect(isPostDeleted(await row(compositePostId))).toBe(true);
    });
  });

  describe('an edit, then a delete of the same post', () => {
    it('waits for the edit PUT in flight, lists the version it wrote and deletes it; the row stays a tombstone', async () => {
      const { compositePostId, postId, firstUrl } = await publish('original');
      const settled: string[] = [];
      const put = holdPut(firstUrl);

      const editing = run(
        PostApplication.commitEdit({ compositePostId, edit: { content: 'edited' } }).then(() => settled.push('edit')),
      );
      await put.taken;
      const deleting = run(
        PostApplication.commitDelete({ compositePostId, canWriteLegacy: true }).then(() => settled.push('delete')),
      );
      await tick();
      // The delete waits for the edit: the row is not tombstoned and nothing was listed yet.
      expect(isPostDeleted(await row(compositePostId))).toBe(false);
      expect(homeserver.spies.listAll).toHaveBeenCalledTimes(1); // the edit's head read
      put.release();
      await Promise.all([editing, deleting]);

      expect(settled).toEqual(['edit', 'delete']);
      expect(await versions(postId)).toEqual([]);
      // The listing taken after the PUT named the new version, which was deleted with the first one.
      const deleted = homeserver.spies.deleteIdempotent.mock.calls.map(([url]) => url);
      expect(deleted).toHaveLength(2);
      expect(deleted).toContain(firstUrl);
      expect(isPostDeleted(await row(compositePostId))).toBe(true);
    });

    it('rolls a failed edit PUT back before a queued delete runs, so the rollback never clears the tombstone', async () => {
      const { compositePostId, postId, firstUrl } = await publish('original');
      const editSpy = vi.spyOn(LocalPostService, 'edit');
      const deleteSpy = vi.spyOn(LocalPostService, 'delete');
      const put = holdPut(firstUrl, {
        fail: Err.server(ServerErrorCode.UNKNOWN_ERROR, 'Bad request', {
          service: ErrorService.Homeserver,
          operation: 'putBlob',
          context: { statusCode: 400 },
        }),
      });

      const editing = run(PostApplication.commitEdit({ compositePostId, edit: { content: 'edited' } }));
      await put.taken;
      const deleting = run(PostApplication.commitDelete({ compositePostId, canWriteLegacy: true }));
      await tick();
      put.release();
      await expect(editing).rejects.toMatchObject({ message: 'Bad request' });
      await deleting;

      // The rollback (the edit's last local write) ran before the delete's local tombstone.
      const rollback = editSpy.mock.calls.findIndex(([params]) => params.content === 'original');
      expect(rollback).toBeGreaterThan(0);
      expect(editSpy.mock.invocationCallOrder[rollback]).toBeLessThan(deleteSpy.mock.invocationCallOrder[0]);
      expect(isPostDeleted(await row(compositePostId))).toBe(true);
      expect(await versions(postId)).toEqual([]);
    });

    it('waits for an edit still reading the head, which then completes and is deleted with the first version', async () => {
      const { compositePostId, postId } = await publish('original');
      const settled: string[] = [];
      const listing = holdListing();

      const editing = run(
        PostApplication.commitEdit({ compositePostId, edit: { content: 'edited' } }).then(() => settled.push('edit')),
      );
      await listing.taken;
      const deleting = run(
        PostApplication.commitDelete({ compositePostId, canWriteLegacy: true }).then(() => settled.push('delete')),
      );
      await tick();
      expect(isPostDeleted(await row(compositePostId))).toBe(false);
      listing.release();
      await Promise.all([editing, deleting]);

      expect(settled).toEqual(['edit', 'delete']);
      expect(homeserver.spies.putBlob).toHaveBeenCalledTimes(2); // the first version and the edit's
      expect(homeserver.spies.deleteIdempotent).toHaveBeenCalledTimes(2);
      expect(await versions(postId)).toEqual([]);
      expect(isPostDeleted(await row(compositePostId))).toBe(true);
    });

    it('waits for an edit still uploading; its file is then collected by the delete, not swept as the edit’s orphan', async () => {
      const { compositePostId, postId } = await publish('original');
      const added = attachment(7);
      const settled: string[] = [];
      const upload = holdFileWrite('commitCreate');

      const editing = run(
        PostApplication.commitEdit({
          compositePostId,
          edit: { content: 'edited', attachmentUris: [added.media.url], kind: 'image' },
          fileAttachments: [added],
        }).then(() => settled.push('edit')),
      );
      await upload.taken;
      const deleting = run(
        PostApplication.commitDelete({ compositePostId, canWriteLegacy: true }).then(() => settled.push('delete')),
      );
      await tick();
      expect(isPostDeleted(await row(compositePostId))).toBe(false);
      upload.release();
      await Promise.all([editing, deleting]);

      expect(settled).toEqual(['edit', 'delete']);
      expect(FileApplication.commitDeleteUploaded).not.toHaveBeenCalled();
      expect(FileApplication.commitDelete).toHaveBeenCalledExactlyOnceWith([added.media.url], compositePostId);
      expect(await versions(postId)).toEqual([]);
      expect(isPostDeleted(await row(compositePostId))).toBe(true);
    });
  });

  describe('across tabs', () => {
    it('a delete in another tab lists only after this tab’s edit PUT landed, the post lock held exclusive meanwhile', async () => {
      const events: string[] = [];
      otherTab = await openOtherTab(events);
      const { compositePostId, postId, firstUrl } = await publish('original');
      const put = holdPut(firstUrl, { onLanded: () => events.push('A:put') });

      const editing = run(PostApplication.commitEdit({ compositePostId, edit: { content: 'edited' } }));
      await put.taken;
      const deleting = run(otherTab.application.commitDelete({ compositePostId, canWriteLegacy: true }));
      await tick();
      expect(await locks.query()).toEqual({
        held: [{ name: lockOf(postId), mode: 'exclusive', clientId: 'test' }],
        pending: [{ name: lockOf(postId), mode: 'exclusive', clientId: 'test' }],
      });
      expect(events).toEqual([]);
      expect(isPostDeleted(await row(compositePostId))).toBe(false);
      put.release();
      await Promise.all([editing, deleting]);

      expect(events).toEqual(['A:put', 'B:list', 'B:list']);
      expect(await versions(postId)).toEqual([]);
      expect(isPostDeleted(await row(compositePostId))).toBe(true);
      expect((await locks.query()).held).toEqual([]);
    });
  });

  describe('a delete, then an edit of the same post', () => {
    it.each([
      ['this tab', false],
      ['another tab', true],
    ])(
      'refuses an edit with new files queued behind a delete in %s, uploading and sweeping nothing',
      async (_, inOtherTab) => {
        const deleter = inOtherTab ? (otherTab = await openOtherTab()).application : PostApplication;
        const { compositePostId, postId } = await publish('original');
        const added = attachment(9);
        const listing = holdListing();

        const deleting = run(deleter.commitDelete({ compositePostId, canWriteLegacy: true }));
        await listing.taken;
        const editing = run(
          PostApplication.commitEdit({
            compositePostId,
            edit: { content: 'edited', attachmentUris: [added.media.url], kind: 'image' },
            fileAttachments: [added],
          }),
        );
        await tick();
        listing.release();
        await deleting;

        await expect(editing).rejects.toMatchObject(notFound);
        expect(FileApplication.commitCreate).not.toHaveBeenCalled();
        expect(FileApplication.commitDeleteUploaded).not.toHaveBeenCalled();
        expect(homeserver.spies.putBlob).toHaveBeenCalledTimes(1); // the first version only
        expect(await versions(postId)).toEqual([]);
        expect(isPostDeleted(await row(compositePostId))).toBe(true);
      },
    );

    it('refuses a collection item add queued behind the collection’s delete, writing nothing', async () => {
      const { compositePostId, postId } = await publishCollection('reading list');
      const item = postReferenceSpellings(FRIEND, '00360AGX9THG2');
      const listing = holdListing();

      const deleting = run(PostApplication.commitDelete({ compositePostId, canWriteLegacy: true }));
      await listing.taken;
      const adding = run(
        PostApplication.commitEdit({ compositePostId, edit: { collection: { op: 'add', spellings: item } } }),
      );
      await tick();
      listing.release();
      await deleting;

      await expect(adding).rejects.toMatchObject(notFound);
      expect(homeserver.spies.putBlob).toHaveBeenCalledTimes(1);
      expect(await versions(postId)).toEqual([]);
      expect(isPostDeleted(await row(compositePostId))).toBe(true);
    });
  });

  describe('a read that never answers under the lock', () => {
    // Only the timers are faked: IndexedDB schedules its work with `setImmediate`.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const timedOut = (operation: string) => ({
      category: ErrorCategory.Timeout,
      code: TimeoutErrorCode.REQUEST_TIMEOUT,
      service: ErrorService.Homeserver,
      operation,
    });
    /** Holds this tab's next listing as an SDK read that never answers; `taken` resolves once it is out. */
    const hangListing = () => {
      const taken = Promise.withResolvers<void>();
      const answer = Promise.withResolvers<string[]>();
      homeserver.spies.listAll.mockImplementationOnce(() => {
        taken.resolve();
        return answer.promise;
      });
      // A test that fails before the bound fires leaves the read hanging past `useRealTimers`: answer it then.
      holds.push(() => answer.resolve([]));
      return { taken: taken.promise, answer: (urls: string[]) => answer.resolve(urls) };
    };
    /** Lets the pending microtasks and IndexedDB work run; the faked timers stay where they are. */
    const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

    it('bounds the edit’s head read: the edit rolls back and sweeps its uploads, then a queued delete runs', async () => {
      const { compositePostId, postId, firstUrl } = await publish('original');
      const added = attachment(10);
      const listing = hangListing();

      const editing = run(
        PostApplication.commitEdit({
          compositePostId,
          edit: { content: 'edited', attachmentUris: [added.media.url], kind: 'image' },
          fileAttachments: [added],
        }).then(
          () => null,
          (error: unknown) => error,
        ),
      );
      await listing.taken;
      const deleting = run(PostApplication.commitDelete({ compositePostId, canWriteLegacy: true }));
      await settle();
      // The delete waits for the lock the head read holds: the projected edit shows, nothing is tombstoned.
      expect(await row(compositePostId)).toMatchObject({ content: 'edited', deleted: false });
      expect(homeserver.spies.listAll).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(HOMESERVER_SYNC_READ_TIMEOUT_MS);

      expect(await editing).toMatchObject(timedOut('commitEdit'));
      await deleting;
      expect(FileApplication.commitDeleteUploaded).toHaveBeenCalledExactlyOnceWith([added], compositePostId);
      expect(homeserver.spies.putBlob).toHaveBeenCalledTimes(1);
      expect(homeserver.spies.deleteIdempotent).toHaveBeenCalledExactlyOnceWith(firstUrl);
      expect(await versions(postId)).toEqual([]);
      expect(isPostDeleted(await row(compositePostId))).toBe(true);

      // The abandoned LIST answers now: the edit stopped at the read, so no version is built from it.
      listing.answer([firstUrl]);
      await settle();
      expect(homeserver.spies.putBlob).toHaveBeenCalledTimes(1);
      expect(isPostDeleted(await row(compositePostId))).toBe(true);
    });

    it('bounds the delete’s listing: no DELETE is sent, the row stays a tombstone, and a queued edit is refused', async () => {
      const { compositePostId, postId, firstUrl } = await publish('original');
      const listing = hangListing();

      const deleting = run(
        PostApplication.commitDelete({ compositePostId, canWriteLegacy: true }).then(
          () => null,
          (error: unknown) => error,
        ),
      );
      await listing.taken;
      const editing = run(PostApplication.commitEdit({ compositePostId, edit: { content: 'edited' } }));
      await settle();
      expect(isPostDeleted(await row(compositePostId))).toBe(true);
      expect(homeserver.spies.putBlob).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(HOMESERVER_SYNC_READ_TIMEOUT_MS);

      expect(await deleting).toMatchObject(timedOut('commitDelete'));
      await expect(editing).rejects.toMatchObject(notFound);
      expect(homeserver.spies.deleteIdempotent).not.toHaveBeenCalled();
      expect(homeserver.spies.putBlob).toHaveBeenCalledTimes(1);
      expect(await versions(postId)).toEqual([firstUrl]); // the user sees the delete fail; the row keeps its tombstone
      expect(isPostDeleted(await row(compositePostId))).toBe(true);

      // The abandoned LIST answers now: the delete stopped at the read, so nothing is deleted from it.
      listing.answer([firstUrl]);
      await settle();
      expect(homeserver.spies.deleteIdempotent).not.toHaveBeenCalled();
    });
  });

  describe('the session fences', () => {
    const sessionExpired = { code: AuthErrorCode.SESSION_EXPIRED };

    it('a delete that waited on the lock across a session replacement tombstones nothing and sends nothing', async () => {
      const { compositePostId, postId, firstUrl } = await publish('original');
      const put = holdPut(firstUrl);

      const editing = run(PostApplication.commitEdit({ compositePostId, edit: { content: 'edited' } }));
      await put.taken;
      const deleting = run(PostApplication.commitDelete({ compositePostId, canWriteLegacy: true }));
      await tick();
      useAuthStore.setState({ generation: 'g2' }); // the account changed while the delete waited
      put.release();
      await editing;

      await expect(deleting).rejects.toMatchObject(sessionExpired);
      expect(homeserver.spies.listAll).toHaveBeenCalledTimes(1); // the edit's head read only
      expect(homeserver.spies.deleteIdempotent).not.toHaveBeenCalled();
      expect(await row(compositePostId)).toMatchObject({ content: 'edited', deleted: false });
      expect(await versions(postId)).toHaveLength(2);
    });

    it('an edit with new files that waited on the lock across a session replacement writes nothing', async () => {
      const { compositePostId, firstUrl } = await publish('original');
      const added = attachment(12);
      const editSpy = vi.spyOn(LocalPostService, 'edit');
      const put = holdPut(firstUrl);

      const first = run(PostApplication.commitEdit({ compositePostId, edit: { content: 'first edit' } }));
      await put.taken;
      const second = run(
        PostApplication.commitEdit({
          compositePostId,
          edit: { content: 'second edit', attachmentUris: [added.media.url], kind: 'image' },
          fileAttachments: [added],
        }),
      );
      await tick();
      useAuthStore.setState({ generation: 'g2' }); // the account changed while the second edit waited
      put.release();
      await first;

      await expect(second).rejects.toMatchObject(sessionExpired);
      // Nothing of the second edit: no upload, no projection, no PUT; the row holds the first edit.
      expect(FileApplication.commitCreate).not.toHaveBeenCalled();
      expect(FileApplication.commitDeleteUploaded).not.toHaveBeenCalled();
      expect(editSpy).toHaveBeenCalledTimes(2); // the first edit's projection and converge
      expect(homeserver.spies.putBlob).toHaveBeenCalledTimes(2); // the first version and the first edit's
      expect(await row(compositePostId)).toMatchObject({ content: 'first edit', deleted: false });
    });

    it('an edit whose session is replaced during its uploads PUTs nothing, rolls back and sweeps them', async () => {
      const { compositePostId } = await publish('original');
      const added = attachment(13);
      const upload = holdFileWrite('commitCreate');

      const editing = run(
        PostApplication.commitEdit({
          compositePostId,
          edit: { content: 'edited', attachmentUris: [added.media.url], kind: 'image' },
          fileAttachments: [added],
        }),
      );
      await upload.taken;
      useAuthStore.setState({ generation: 'g2' }); // the account changed while the files went up
      upload.release();

      await expect(editing).rejects.toMatchObject(sessionExpired);
      expect(homeserver.spies.putBlob).toHaveBeenCalledTimes(1); // the first version only
      expect(FileApplication.commitDeleteUploaded).toHaveBeenCalledExactlyOnceWith([added], compositePostId);
      expect(await row(compositePostId)).toMatchObject({ content: 'original', attachments: null, deleted: false });
    });
  });

  describe('the lock', () => {
    it('is pubky-post-write:<owner>:<postId>, held exclusive by a create, an edit and a delete', async () => {
      const request = vi.spyOn(locks, 'request');
      const { compositePostId, postId } = await publish('original');

      await PostApplication.commitEdit({ compositePostId, edit: { content: 'edited' } });
      await PostApplication.commitDelete({ compositePostId, canWriteLegacy: true });

      expect(request.mock.calls.map(([name, options]) => [name, (options as LockOptions).mode])).toEqual([
        [lockOf(postId), 'exclusive'],
        [lockOf(postId), 'exclusive'],
        [lockOf(postId), 'exclusive'],
      ]);
    });

    it('is per post: an edit of another post completes while this one’s PUT is held', async () => {
      const first = await publish('one');
      const second = await publish('two');
      const put = holdPut(first.firstUrl);

      const editing = run(
        PostApplication.commitEdit({ compositePostId: first.compositePostId, edit: { content: 'edited' } }),
      );
      await put.taken;
      // Both PUTs are held (`holdPut` holds every version PUT), so the other post's edit is observed before its
      // PUT: its projection lands and its head read runs while this post's lock is held.
      const otherEditing = run(
        PostApplication.commitEdit({ compositePostId: second.compositePostId, edit: { content: 'edited too' } }),
      );
      await vi.waitFor(async () => expect(await row(second.compositePostId)).toMatchObject({ content: 'edited too' }));
      await vi.waitFor(() => expect(homeserver.spies.listAll).toHaveBeenCalledTimes(2));

      put.release();
      await Promise.all([editing, otherEditing]);
    });

    it('is released before the media collection: a queued edit is refused while the collection still runs', async () => {
      const kept = attachment(11);
      const { compositePostId } = await publish('with media', [kept]);
      const collection = holdFileWrite('commitDelete');

      const deleting = run(PostApplication.commitDelete({ compositePostId, canWriteLegacy: true }));
      await collection.taken;
      // The collection is still running and the lock is already free: a queued edit is refused at once.
      expect((await locks.query()).held).toEqual([]);
      await expect(PostApplication.commitEdit({ compositePostId, edit: { content: 'edited' } })).rejects.toMatchObject(
        notFound,
      );

      collection.release();
      await deleting;
      expect(FileApplication.commitDelete).toHaveBeenCalledExactlyOnceWith([kept.media.url], compositePostId);
    });
  });
});
