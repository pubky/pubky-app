import { buildUri, listPrefix } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TMuteApplicationCommitParams } from '@/application/mute/mute.types';
import { HOMESERVER_SYNC_READ_TIMEOUT_MS } from '@/config/network';
import { db } from '@/database/franky/franky';
import { AppError } from '@/libs/error/error';
import { ServerErrorCode, TimeoutErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import type { Pubky } from '@/models/models.types';
import { UserStreamModel } from '@/models/stream/user/userStream';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { MuteNormalizer } from '@/pipes/mute/mute.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalMuteService } from '@/services/local/mute/mute';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import { stubMemoryHomeserver } from '@/test-utils/homeserver';
import { createTestWebLocks } from '@/test-utils/web-locks';
import { MuteApplication } from './mute';

const MUTER = fakeOwner(1);
const MUTEE = fakeOwner(2);
const OTHER = fakeOwner(3);
const PRIVATE_MUTES = `${listPrefix(MUTER, 'private')}mutes/`;

async function clearTables() {
  await db.transaction('rw', [UserStreamModel.table], async () => {
    await UserStreamModel.table.clear();
  });
}

async function mutedStream(): Promise<Pubky[]> {
  return (await LocalStreamUsersService.findById(UserStreamTypes.MUTED))?.stream ?? [];
}

describe('MuteApplication.commitMute', () => {
  const built = MuteNormalizer.to({ muter: MUTER, mutee: MUTEE });
  const deleteUrls = MuteNormalizer.toDeleteUrls({ muter: MUTER, mutee: MUTEE });
  const mute = {
    eventType: HttpMethod.PUT,
    muteUrl: built.url,
    muteBody: built.body,
    muter: MUTER,
    mutee: MUTEE,
  } as const;
  const unmute = { eventType: HttpMethod.DELETE, deleteUrls, muter: MUTER, mutee: MUTEE } as const;

  beforeEach(async () => {
    await db.initialize();
    await clearTables();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mutes locally first, then PUTs the built bytes at the private v1 mute URL', async () => {
    const createSpy = vi.spyOn(LocalMuteService, 'create');
    const putBlob = vi.spyOn(HomeserverService, 'putBlob').mockResolvedValue(undefined);
    const deleteIdempotent = vi.spyOn(HomeserverService, 'deleteIdempotent');

    await MuteApplication.commitMute(mute);

    await expect(mutedStream()).resolves.toEqual([MUTEE]);
    expect(putBlob).toHaveBeenCalledExactlyOnceWith({ url: built.url, blob: built.body });
    expect(built.url).toBe(`pubky://${MUTER}/priv/social/v1/mutes/${MUTEE}.json`);
    expect(deleteIdempotent).not.toHaveBeenCalled();
    expect(createSpy.mock.invocationCallOrder[0]).toBeLessThan(putBlob.mock.invocationCallOrder[0]);
  });

  it('unmutes locally first, then deletes both copies, the 0.x one before the private v1 one', async () => {
    await LocalStreamUsersService.prependToStream(UserStreamTypes.MUTED, [MUTEE]);
    const deleteSpy = vi.spyOn(LocalMuteService, 'delete');
    const putBlob = vi.spyOn(HomeserverService, 'putBlob');
    const deleteIdempotent = vi.spyOn(HomeserverService, 'deleteIdempotent').mockResolvedValue(undefined);

    await MuteApplication.commitMute(unmute);

    await expect(mutedStream()).resolves.toEqual([]);
    expect(deleteIdempotent.mock.calls.map(([url]) => url)).toEqual([
      `${listPrefix(MUTER, 'legacy')}mutes/${MUTEE}`,
      buildUri(MUTER, 'mute', MUTEE),
    ]);
    expect(putBlob).not.toHaveBeenCalled();
    expect(deleteSpy.mock.invocationCallOrder[0]).toBeLessThan(deleteIdempotent.mock.invocationCallOrder[0]);
  });

  it.each([
    ['mute', mute, true],
    ['unmute', unmute, false],
  ] as const)('is idempotent locally when the user is already %sd, and still syncs', async (_action, params, muted) => {
    if (muted) {
      await LocalStreamUsersService.prependToStream(UserStreamTypes.MUTED, [MUTEE]);
    } else {
      await LocalMuteService.create({ muter: MUTER, mutee: MUTEE });
      await LocalMuteService.delete({ muter: MUTER, mutee: MUTEE });
    }
    const prependSpy = vi.spyOn(LocalStreamUsersService, 'prependToStream');
    const removeSpy = vi.spyOn(LocalStreamUsersService, 'removeFromStream');
    const putBlob = vi.spyOn(HomeserverService, 'putBlob').mockResolvedValue(undefined);
    const deleteIdempotent = vi.spyOn(HomeserverService, 'deleteIdempotent').mockResolvedValue(undefined);

    await MuteApplication.commitMute(params);

    await expect(mutedStream()).resolves.toEqual(muted ? [MUTEE] : []);
    expect(prependSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();
    expect(muted ? putBlob : deleteIdempotent).toHaveBeenCalled();
  });

  it('does not reach the homeserver when the local mute fails', async () => {
    vi.spyOn(LocalStreamUsersService, 'findById').mockRejectedValue(new Error('db-fail'));
    const putBlob = vi.spyOn(HomeserverService, 'putBlob').mockResolvedValue(undefined);

    await expect(MuteApplication.commitMute(mute)).rejects.toThrow('Failed to mute mute relationship');

    expect(putBlob).not.toHaveBeenCalled();
  });

  it('does not reach the homeserver when the stream update fails', async () => {
    vi.spyOn(LocalStreamUsersService, 'prependToStream').mockRejectedValue(new Error('stream-fail'));
    const putBlob = vi.spyOn(HomeserverService, 'putBlob').mockResolvedValue(undefined);

    await expect(MuteApplication.commitMute(mute)).rejects.toThrow('Failed to mute mute relationship');

    expect(putBlob).not.toHaveBeenCalled();
  });

  it('propagates a failed PUT', async () => {
    const putBlob = vi.spyOn(HomeserverService, 'putBlob').mockRejectedValue(new Error('homeserver-fail'));

    await expect(MuteApplication.commitMute(mute)).rejects.toThrow('homeserver-fail');

    expect(putBlob).toHaveBeenCalledWith({ url: built.url, blob: built.body });
  });

  it('propagates a failed delete and leaves the next copy alone', async () => {
    const deleteIdempotent = vi.spyOn(HomeserverService, 'deleteIdempotent').mockRejectedValue(new Error('fail'));

    await expect(MuteApplication.commitMute(unmute)).rejects.toThrow('fail');

    expect(deleteIdempotent).toHaveBeenCalledExactlyOnceWith(deleteUrls[0]);
  });

  it('runs overlapping commits for one pair in order, so a retrying unmute cannot remove a newer mute', async () => {
    const createSpy = vi.spyOn(LocalMuteService, 'create');
    const deleteSpy = vi.spyOn(LocalMuteService, 'delete');
    // The first copy's delete is still retrying (deleteIdempotent waits between attempts).
    const pendingDelete = Promise.withResolvers<void>();
    const deleteIdempotent = vi
      .spyOn(HomeserverService, 'deleteIdempotent')
      .mockImplementationOnce(() => pendingDelete.promise)
      .mockResolvedValue(undefined);
    const putBlob = vi.spyOn(HomeserverService, 'putBlob').mockResolvedValue(undefined);

    const unmuteCommit = MuteApplication.commitMute(unmute);
    const muteCommit = MuteApplication.commitMute(mute);
    await vi.waitFor(() => expect(deleteIdempotent).toHaveBeenCalledOnce());

    // The mute waits: no local write and no PUT while the unmute is still deleting.
    expect(createSpy).not.toHaveBeenCalled();
    expect(putBlob).not.toHaveBeenCalled();

    pendingDelete.resolve();
    await Promise.all([unmuteCommit, muteCommit]);

    expect(deleteIdempotent).toHaveBeenCalledTimes(2);
    expect(putBlob).toHaveBeenCalledExactlyOnceWith({ url: built.url, blob: built.body });
    expect(deleteSpy.mock.invocationCallOrder[0]).toBeLessThan(createSpy.mock.invocationCallOrder[0]);
    expect(Math.max(...deleteIdempotent.mock.invocationCallOrder)).toBeLessThan(putBlob.mock.invocationCallOrder[0]);
    await expect(mutedStream()).resolves.toEqual([MUTEE]);
  });

  it('writes nothing for a queued commit whose session ended while it waited', async () => {
    let current = true;
    const createSpy = vi.spyOn(LocalMuteService, 'create');
    const pendingDelete = Promise.withResolvers<void>();
    const deleteIdempotent = vi
      .spyOn(HomeserverService, 'deleteIdempotent')
      .mockImplementationOnce(() => pendingDelete.promise)
      .mockResolvedValue(undefined);
    const putBlob = vi.spyOn(HomeserverService, 'putBlob').mockResolvedValue(undefined);

    const unmuteCommit = MuteApplication.commitMute({ ...unmute, isCurrent: () => current });
    const muteCommit = MuteApplication.commitMute({ ...mute, isCurrent: () => current });
    await vi.waitFor(() => expect(deleteIdempotent).toHaveBeenCalledOnce());

    // Logout while the mute is queued: the database now belongs to whoever signs in next.
    current = false;
    pendingDelete.resolve();
    await expect(unmuteCommit).resolves.toBeUndefined();
    await expect(muteCommit).resolves.toBeUndefined();

    expect(createSpy).not.toHaveBeenCalled();
    expect(putBlob).not.toHaveBeenCalled();
    // The unmute stopped after its first copy too: no second DELETE for a session that is gone.
    expect(deleteIdempotent).toHaveBeenCalledOnce();
  });

  it('lets a failed commit release the pair queue for the next one', async () => {
    vi.spyOn(HomeserverService, 'deleteIdempotent').mockRejectedValueOnce(new Error('offline'));
    const putBlob = vi.spyOn(HomeserverService, 'putBlob').mockResolvedValue(undefined);

    const unmuteCommit = MuteApplication.commitMute(unmute);
    const muteCommit = MuteApplication.commitMute(mute);

    await expect(unmuteCommit).rejects.toThrow('offline');
    await expect(muteCommit).resolves.toBeUndefined();
    expect(putBlob).toHaveBeenCalledOnce();
  });

  it('reports the local failure when both the database and the homeserver would fail', async () => {
    const createSpy = vi.spyOn(LocalMuteService, 'create').mockRejectedValue(new Error('db-fail'));
    const putBlob = vi.spyOn(HomeserverService, 'putBlob').mockRejectedValue(new Error('homeserver-fail'));

    await expect(MuteApplication.commitMute(mute)).rejects.toThrow('db-fail');

    expect(createSpy).toHaveBeenCalled();
    expect(putBlob).not.toHaveBeenCalled();
  });
});

describe('MuteApplication against the in-memory homeserver', () => {
  let homeserver: ReturnType<typeof stubMemoryHomeserver>;

  beforeEach(async () => {
    await db.initialize();
    await clearTables();
    homeserver = stubMemoryHomeserver(MUTER);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The commit params the controller builds for `mutee`. */
  const commitParams = (eventType: HttpMethod.PUT | HttpMethod.DELETE, mutee: Pubky): TMuteApplicationCommitParams => {
    const params = { muter: MUTER, mutee };
    if (eventType === HttpMethod.DELETE) {
      return { ...params, eventType, deleteUrls: MuteNormalizer.toDeleteUrls(params) };
    }
    const { url, body } = MuteNormalizer.to(params);
    return { ...params, eventType, muteUrl: url, muteBody: body };
  };
  const commit = (eventType: HttpMethod.PUT | HttpMethod.DELETE, mutee: Pubky) =>
    MuteApplication.commitMute(commitParams(eventType, mutee));

  it('stores a mute as a private v1 file that fetchMutedUsers lists back', async () => {
    await commit(HttpMethod.PUT, MUTEE);
    await commit(HttpMethod.PUT, OTHER);
    await clearTables();

    await expect(MuteApplication.fetchMutedUsers(MUTER)).resolves.toEqual([MUTEE, OTHER].sort());
    await expect(mutedStream()).resolves.toEqual([MUTEE, OTHER].sort());
    await expect(homeserver.session.storage.list('/priv/social/v1/mutes/')).resolves.toEqual(
      [MUTEE, OTHER].sort().map((key) => buildUri(MUTER, 'mute', key)),
    );
    expect(homeserver.spies.listAll).toHaveBeenCalledExactlyOnceWith({ baseDirectory: PRIVATE_MUTES });
  });

  it('unmute deletes the private v1 file and the 0.x copy a migration left behind', async () => {
    const legacyPath = `/pub/pubky.app/mutes/${MUTEE}`;
    await commit(HttpMethod.PUT, MUTEE);
    await homeserver.session.storage.putBytes(legacyPath, new TextEncoder().encode('{"created_at":1}'));

    await commit(HttpMethod.DELETE, MUTEE);

    await expect(homeserver.session.storage.exists(legacyPath)).resolves.toBe(false);
    await expect(homeserver.session.storage.exists(`/priv/social/v1/mutes/${MUTEE}.json`)).resolves.toBe(false);
    expect(homeserver.spies.deleteIdempotent.mock.calls.map(([url]) => url)).toEqual(
      MuteNormalizer.toDeleteUrls({ muter: MUTER, mutee: MUTEE }),
    );
    await expect(MuteApplication.fetchMutedUsers(MUTER)).resolves.toEqual([]);
  });

  it('never lists the 0.x mutes directory: a mute only a 0.x client wrote is not a mute after the gate', async () => {
    await homeserver.session.storage.putBytes(`/pub/pubky.app/mutes/${OTHER}`, new TextEncoder().encode('{}'));
    await commit(HttpMethod.PUT, MUTEE);

    await expect(MuteApplication.fetchMutedUsers(MUTER)).resolves.toEqual([MUTEE]);
    expect(homeserver.spies.listAll).toHaveBeenCalledExactlyOnceWith({ baseDirectory: PRIVATE_MUTES });
  });

  describe('sync lock', () => {
    const SYNC_LOCK = `pubky-mutes-sync:${MUTER}`;
    const writeLock = (mutee: Pubky) => `pubky-mute-write:${MUTER}:${mutee}`;
    const muteUri = (mutee: Pubky) => buildUri(MUTER, 'mute', mutee);
    let otherTab: Awaited<ReturnType<typeof openOtherTab>> | null = null;
    /** Holds a failing test may leave, released after it so the next test does not wait on them. */
    const holds: Array<() => void> = [];
    /** The runs a test started, settled after it so none is still writing when the next test begins. */
    const runs: Promise<unknown>[] = [];
    const run = <T>(promise: Promise<T>) => {
      runs.push(promise);
      return promise;
    };

    // Through the app's own listing, which reads a directory that is gone as empty.
    const storedMutes = () => HomeserverService.listAll({ baseDirectory: PRIVATE_MUTES });

    /**
     * Another tab of the app: a second instance of every module, sharing only what tabs share (the one
     * IndexedDB behind both Dexie instances, `navigator.locks`, the homeserver). Its homeserver writes go
     * to this tab's in-memory homeserver.
     */
    async function openOtherTab() {
      vi.resetModules();
      const { MuteApplication: application } = await import('@/application/mute/mute');
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
      holds.push(() => released.resolve());
      return { taken: taken.promise, release: () => released.resolve() };
    };
    const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

    afterEach(async () => {
      holds.splice(0).forEach((release) => release());
      await Promise.allSettled(runs.splice(0));
      Reflect.deleteProperty(navigator, 'locks');
      otherTab?.close();
      otherTab = null;
    });

    it('keeps a mute another tab makes while this tab is listing', async () => {
      installWebLocks();
      otherTab = await openOtherTab();
      const listing = holdListing();
      const settled: string[] = [];

      const fetching = run(MuteApplication.fetchMutedUsers(MUTER).then(() => settled.push('fetch')));
      await listing.taken;
      const params = commitParams(HttpMethod.PUT, MUTEE);
      const muting = run(otherTab.application.commitMute(params).then(() => settled.push('write')));
      await tick();
      listing.release();
      await Promise.all([fetching, muting]);

      await expect(mutedStream()).resolves.toEqual([MUTEE]);
      await expect(storedMutes()).resolves.toEqual([muteUri(MUTEE)]);
      expect(settled).toEqual(['fetch', 'write']);
    });

    it('keeps an unmute another tab makes while this tab is listing', async () => {
      installWebLocks();
      otherTab = await openOtherTab();
      await commit(HttpMethod.PUT, MUTEE);
      const listing = holdListing();
      const settled: string[] = [];

      const fetching = run(MuteApplication.fetchMutedUsers(MUTER).then(() => settled.push('fetch')));
      await listing.taken;
      const params = commitParams(HttpMethod.DELETE, MUTEE);
      const unmuting = run(otherTab.application.commitMute(params).then(() => settled.push('write')));
      await tick();
      listing.release();
      await Promise.all([fetching, unmuting]);

      await expect(mutedStream()).resolves.toEqual([]);
      await expect(storedMutes()).resolves.toEqual([]);
      expect(settled).toEqual(['fetch', 'write']);
    });

    it('orders a mute from another tab behind an unmute whose delete is still retrying', async () => {
      installWebLocks();
      otherTab = await openOtherTab();
      await commit(HttpMethod.PUT, MUTEE);
      const settled: string[] = [];
      // The v1 copy's first DELETE failed: `deleteIdempotent` waits out its back-off outside the
      // homeserver's per-file queue, then deletes again.
      const retrying = Promise.withResolvers<void>();
      holds.push(() => retrying.resolve());
      const remove = homeserver.spies.deleteIdempotent.getMockImplementation()!;
      homeserver.spies.deleteIdempotent.mockImplementation(async (url) => {
        if (url === muteUri(MUTEE)) await retrying.promise;
        return remove(url);
      });

      const unmuting = run(commit(HttpMethod.DELETE, MUTEE).then(() => settled.push('unmute')));
      await vi.waitFor(() => expect(homeserver.spies.deleteIdempotent).toHaveBeenCalledTimes(2));
      const params = commitParams(HttpMethod.PUT, MUTEE);
      const muting = run(otherTab.application.commitMute(params).then(() => settled.push('mute')));
      await tick();
      retrying.resolve();
      await Promise.all([unmuting, muting]);

      await expect(mutedStream()).resolves.toEqual([MUTEE]);
      await expect(storedMutes()).resolves.toEqual([muteUri(MUTEE)]);
      expect(settled).toEqual(['unmute', 'mute']);
    });

    it('does not make commits for different pairs wait on each other', async () => {
      installWebLocks();
      const settled: string[] = [];
      // The unmute's v1 DELETE is still retrying: it holds the user lock shared and its pair lock exclusive.
      const retrying = Promise.withResolvers<void>();
      holds.push(() => retrying.resolve());
      const remove = homeserver.spies.deleteIdempotent.getMockImplementation()!;
      homeserver.spies.deleteIdempotent.mockImplementation(async (url) => {
        if (url === muteUri(MUTEE)) await retrying.promise;
        return remove(url);
      });

      const unmuting = run(commit(HttpMethod.DELETE, MUTEE).then(() => settled.push('unmute')));
      await vi.waitFor(() => expect(homeserver.spies.deleteIdempotent).toHaveBeenCalledTimes(2));
      await run(commit(HttpMethod.PUT, OTHER));

      expect(settled).toEqual([]);
      await expect(mutedStream()).resolves.toEqual([OTHER]);
      await expect(storedMutes()).resolves.toEqual([muteUri(OTHER)]);
      retrying.resolve();
      await unmuting;
      expect(settled).toEqual(['unmute']);
    });

    it('releases the user lock when the LIST fails, so another tab still writes', async () => {
      installWebLocks();
      otherTab = await openOtherTab();
      homeserver.spies.listAll.mockRejectedValueOnce(new Error('offline'));

      await expect(MuteApplication.fetchMutedUsers(MUTER)).rejects.toThrow('offline');

      await expect(otherTab.application.commitMute(commitParams(HttpMethod.PUT, MUTEE))).resolves.toBeUndefined();
      await expect(mutedStream()).resolves.toEqual([MUTEE]);
    });

    it('releases both locks when the homeserver write fails, so another tab and the fetch go on', async () => {
      installWebLocks();
      otherTab = await openOtherTab();
      homeserver.spies.putBlob.mockRejectedValueOnce(new Error('offline'));

      await expect(commit(HttpMethod.PUT, MUTEE)).rejects.toThrow('offline');

      await expect(otherTab.application.commitMute(commitParams(HttpMethod.DELETE, MUTEE))).resolves.toBeUndefined();
      await expect(MuteApplication.fetchMutedUsers(MUTER)).resolves.toEqual([]);
      await expect(mutedStream()).resolves.toEqual([]);
    });

    it('holds the user lock shared and the pair lock exclusive for a write, the user lock exclusive for the fetch', async () => {
      const request = vi.spyOn(installWebLocks(), 'request');
      const other = fakeOwner(4);

      await commit(HttpMethod.PUT, MUTEE);
      await commit(HttpMethod.PUT, OTHER);
      await MuteApplication.fetchMutedUsers(MUTER);
      await commit(HttpMethod.DELETE, MUTEE);
      homeserver.spies.listAll.mockResolvedValueOnce([]);
      await MuteApplication.fetchMutedUsers(other);

      expect(request.mock.calls.map(([name, options]) => [name, (options as LockOptions).mode])).toEqual([
        [SYNC_LOCK, 'shared'],
        [writeLock(MUTEE), 'exclusive'],
        [SYNC_LOCK, 'shared'],
        [writeLock(OTHER), 'exclusive'],
        [SYNC_LOCK, 'exclusive'],
        [SYNC_LOCK, 'shared'],
        [writeLock(MUTEE), 'exclusive'],
        [`pubky-mutes-sync:${other}`, 'exclusive'],
      ]);
    });

    describe('a LIST that never answers', () => {
      // Only the timers are faked: IndexedDB schedules its work with `setImmediate`.
      beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      });

      afterEach(() => {
        vi.useRealTimers();
      });

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
      /** Lets the pending microtasks and IndexedDB work run; the faked timers stay where they are. */
      const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

      it('lets a mute queued behind it write once the wait is bounded, and applies nothing the LIST answers late', async () => {
        installWebLocks();
        const listing = hangListing();

        const fetching = MuteApplication.fetchMutedUsers(MUTER).then(
          () => null,
          (error: unknown) => error,
        );
        await listing.taken;
        const muting = run(commit(HttpMethod.PUT, MUTEE));
        await settle();
        // The mute waits for the lock the listing holds: nothing written, locally or on the homeserver.
        await expect(mutedStream()).resolves.toEqual([]);
        expect(homeserver.spies.putBlob).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(HOMESERVER_SYNC_READ_TIMEOUT_MS);

        expect(await fetching).toMatchObject({
          category: ErrorCategory.Timeout,
          code: TimeoutErrorCode.REQUEST_TIMEOUT,
          service: ErrorService.Homeserver,
          operation: 'fetchMutedUsers',
        });
        await muting;
        await expect(mutedStream()).resolves.toEqual([MUTEE]);
        await expect(storedMutes()).resolves.toEqual([muteUri(MUTEE)]);

        // The abandoned LIST answers now, from before the mute: the fetch stopped at the read, so nothing applies it.
        listing.answer([]);
        await settle();
        await expect(mutedStream()).resolves.toEqual([MUTEE]);
      });
    });
  });
});

describe('MuteApplication.fetchMutedUsers', () => {
  beforeEach(async () => {
    await db.initialize();
    await clearTables();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists the whole private v1 mutes directory, nothing else, and reads the muted key from each file name', async () => {
    const listSpy = vi
      .spyOn(HomeserverService, 'listAll')
      .mockResolvedValue([buildUri(MUTER, 'mute', MUTEE), buildUri(MUTER, 'mute', OTHER)]);

    const result = await MuteApplication.fetchMutedUsers(MUTER);

    expect(listSpy).toHaveBeenCalledExactlyOnceWith({ baseDirectory: PRIVATE_MUTES });
    expect(PRIVATE_MUTES).toBe(`pubky://${MUTER}/priv/social/v1/mutes/`);
    expect(result).toEqual([MUTEE, OTHER]);
    await expect(mutedStream()).resolves.toEqual([MUTEE, OTHER]);
  });

  it('skips a listed name that is no v1 mute', async () => {
    vi.spyOn(HomeserverService, 'listAll').mockResolvedValue([
      buildUri(MUTER, 'mute', MUTEE),
      `${PRIVATE_MUTES}junk.json`,
      `${PRIVATE_MUTES}${OTHER}`,
      PRIVATE_MUTES,
      'not a uri',
    ]);

    await expect(MuteApplication.fetchMutedUsers(MUTER)).resolves.toEqual([MUTEE]);
  });

  it('returns and persists an empty list when nobody is muted (a missing directory is an empty list at the service)', async () => {
    vi.spyOn(HomeserverService, 'listAll').mockResolvedValue([]);

    await expect(MuteApplication.fetchMutedUsers(MUTER)).resolves.toEqual([]);
    await expect(mutedStream()).resolves.toEqual([]);
  });

  it('propagates a non-404 AppError from the LIST', async () => {
    const serverError = new AppError({
      category: ErrorCategory.Server,
      code: ServerErrorCode.INTERNAL_ERROR,
      message: 'Server error',
      service: ErrorService.Homeserver,
      operation: 'list',
      context: { statusCode: 500 },
    });
    vi.spyOn(HomeserverService, 'listAll').mockRejectedValue(serverError);

    await expect(MuteApplication.fetchMutedUsers(MUTER)).rejects.toBe(serverError);
  });

  it('propagates a non-AppError failure', async () => {
    vi.spyOn(HomeserverService, 'listAll').mockRejectedValue(new Error('network-fail'));

    await expect(MuteApplication.fetchMutedUsers(MUTER)).rejects.toThrow('network-fail');
  });

  describe('the local write of a refresh', () => {
    const built = MuteNormalizer.to({ muter: MUTER, mutee: MUTEE });
    const mute = {
      eventType: HttpMethod.PUT,
      muteUrl: built.url,
      muteBody: built.body,
      muter: MUTER,
      mutee: MUTEE,
    } as const;

    /** A LIST the test answers by hand, so a commit can run while it is out. */
    function pendingList() {
      let answer: (urls: string[]) => void = () => {};
      vi.spyOn(HomeserverService, 'listAll').mockImplementation(
        () =>
          new Promise<string[]>((resolve) => {
            answer = resolve;
          }),
      );
      return (urls: string[]) => answer(urls);
    }

    /** A homeserver write the test finishes by hand. */
    function pendingPut() {
      let finish: () => void = () => {};
      vi.spyOn(HomeserverService, 'putBlob').mockImplementation(
        () =>
          new Promise<undefined>((resolve) => {
            finish = () => resolve(undefined);
          }),
      );
      return () => finish();
    }

    const flushIndexedDb = () => new Promise((resolve) => setTimeout(resolve, 20));

    it('waits for a commit whose homeserver write is still running, then lists what it wrote', async () => {
      const finishPut = pendingPut();
      const commit = MuteApplication.commitMute(mute);
      await flushIndexedDb();
      await expect(mutedStream()).resolves.toEqual([MUTEE]);
      const listSpy = vi.spyOn(HomeserverService, 'listAll').mockResolvedValue([buildUri(MUTER, 'mute', MUTEE)]);

      const refresh = MuteApplication.fetchMutedUsers(MUTER);
      await flushIndexedDb();
      // The refresh holds the sync lock exclusive, so it does not even LIST while the commit is out.
      expect(listSpy).not.toHaveBeenCalled();

      finishPut();
      await commit;
      await expect(refresh).resolves.toEqual([MUTEE]);
      await expect(mutedStream()).resolves.toEqual([MUTEE]);
    });

    it('makes a commit wait while the LIST is out, then applies the listing before the commit writes', async () => {
      vi.spyOn(HomeserverService, 'putBlob').mockResolvedValue(undefined);
      const createSpy = vi.spyOn(LocalMuteService, 'create');
      const answerList = pendingList();
      const refresh = MuteApplication.fetchMutedUsers(MUTER);

      const commit = MuteApplication.commitMute(mute);
      await flushIndexedDb();
      expect(createSpy).not.toHaveBeenCalled();

      // Another device muted OTHER meanwhile: the listing lands, then the waiting mute lands on top of it.
      answerList([buildUri(MUTER, 'mute', OTHER)]);
      await expect(refresh).resolves.toEqual([OTHER]);
      await commit;
      await expect(mutedStream()).resolves.toEqual([MUTEE, OTHER]);
    });

    it('writes again on the next refresh once no commit overlaps it', async () => {
      vi.spyOn(HomeserverService, 'putBlob').mockResolvedValue(undefined);
      await MuteApplication.commitMute(mute);

      vi.spyOn(HomeserverService, 'listAll').mockResolvedValue([buildUri(MUTER, 'mute', OTHER)]);
      await MuteApplication.fetchMutedUsers(MUTER);

      await expect(mutedStream()).resolves.toEqual([OTHER]);
    });

    it('runs refreshes started at once one after the other, each applying its own listing', async () => {
      /** The LISTs the test answers by hand, in the order they were started. */
      const answers: Array<(urls: string[]) => void> = [];
      vi.spyOn(HomeserverService, 'listAll').mockImplementation(
        () =>
          new Promise<string[]>((resolve) => {
            answers.push(resolve);
          }),
      );
      const older = MuteApplication.fetchMutedUsers(MUTER);
      const newer = MuteApplication.fetchMutedUsers(MUTER);
      await flushIndexedDb();
      // The later refresh waits for the sync lock: one LIST is out, never two.
      expect(answers).toHaveLength(1);

      answers[0]([buildUri(MUTER, 'mute', MUTEE)]);
      await expect(older).resolves.toEqual([MUTEE]);
      await expect(mutedStream()).resolves.toEqual([MUTEE]);

      await vi.waitFor(() => expect(answers).toHaveLength(2));
      answers[1]([buildUri(MUTER, 'mute', OTHER)]);
      await expect(newer).resolves.toEqual([OTHER]);
      await expect(mutedStream()).resolves.toEqual([OTHER]);
    });

    it('writes nothing once the session the fetch started for has ended', async () => {
      vi.spyOn(HomeserverService, 'listAll').mockResolvedValue([buildUri(MUTER, 'mute', MUTEE)]);

      await expect(MuteApplication.fetchMutedUsers(MUTER, { isCurrent: () => false })).resolves.toEqual([MUTEE]);

      await expect(LocalStreamUsersService.findById(UserStreamTypes.MUTED)).resolves.toBeNull();
    });

    it('does not rewrite unchanged members, whatever their order, so readers are not woken on every poll', async () => {
      await LocalStreamUsersService.upsert({ streamId: UserStreamTypes.MUTED, stream: [OTHER, MUTEE] });
      vi.spyOn(HomeserverService, 'listAll').mockResolvedValue([
        buildUri(MUTER, 'mute', MUTEE),
        buildUri(MUTER, 'mute', OTHER),
      ]);
      const upsert = vi.spyOn(LocalStreamUsersService, 'upsert');

      await MuteApplication.fetchMutedUsers(MUTER);

      expect(upsert).not.toHaveBeenCalled();
      await expect(mutedStream()).resolves.toEqual([OTHER, MUTEE]);
    });

    it('applies a mute and an unmute made on another device', async () => {
      await LocalStreamUsersService.upsert({ streamId: UserStreamTypes.MUTED, stream: [MUTEE] });
      vi.spyOn(HomeserverService, 'listAll').mockResolvedValue([buildUri(MUTER, 'mute', OTHER)]);

      await MuteApplication.fetchMutedUsers(MUTER);

      await expect(mutedStream()).resolves.toEqual([OTHER]);
    });
  });
});
