import { buildUri, listPrefix } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MUTE_HOMESERVER_EVENTS_PATH_PREFIX } from '@/config/mute-sync';
import { db } from '@/database/franky/franky';
import { AppError } from '@/libs/error/error';
import { AuthErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
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

  const commit = (eventType: HttpMethod.PUT | HttpMethod.DELETE, mutee: Pubky) => {
    const params = { muter: MUTER, mutee };
    if (eventType === HttpMethod.DELETE) {
      return MuteApplication.commitMute({ ...params, eventType, deleteUrls: MuteNormalizer.toDeleteUrls(params) });
    }
    const { url, body } = MuteNormalizer.to(params);
    return MuteApplication.commitMute({ ...params, eventType, muteUrl: url, muteBody: body });
  };

  it('stores a mute as a private v1 file that fetchMutedUsers lists back', async () => {
    await commit(HttpMethod.PUT, MUTEE);
    await commit(HttpMethod.PUT, OTHER);
    await clearTables();

    await expect(MuteApplication.fetchMutedUsers(MUTER)).resolves.toEqual([MUTEE, OTHER].sort());
    await expect(mutedStream()).resolves.toEqual([MUTEE, OTHER].sort());
    await expect(homeserver.session.storage.list('/priv/social/v1/mutes/')).resolves.toEqual(
      [MUTEE, OTHER].sort().map((key) => buildUri(MUTER, 'mute', key)),
    );
    expect(homeserver.spies.list).toHaveBeenCalledExactlyOnceWith({ baseDirectory: PRIVATE_MUTES });
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
    expect(homeserver.spies.list).toHaveBeenCalledExactlyOnceWith({ baseDirectory: PRIVATE_MUTES });
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

  it('lists only the private v1 mutes directory and reads the muted key from each file name', async () => {
    const listSpy = vi
      .spyOn(HomeserverService, 'list')
      .mockResolvedValue([buildUri(MUTER, 'mute', MUTEE), buildUri(MUTER, 'mute', OTHER)]);

    const result = await MuteApplication.fetchMutedUsers(MUTER);

    expect(listSpy).toHaveBeenCalledExactlyOnceWith({ baseDirectory: PRIVATE_MUTES });
    expect(PRIVATE_MUTES).toBe(`pubky://${MUTER}/priv/social/v1/mutes/`);
    expect(result).toEqual([MUTEE, OTHER]);
    await expect(mutedStream()).resolves.toEqual([MUTEE, OTHER]);
  });

  it('skips a listed name that is no v1 mute', async () => {
    vi.spyOn(HomeserverService, 'list').mockResolvedValue([
      buildUri(MUTER, 'mute', MUTEE),
      `${PRIVATE_MUTES}junk.json`,
      `${PRIVATE_MUTES}${OTHER}`,
      PRIVATE_MUTES,
      'not a uri',
    ]);

    await expect(MuteApplication.fetchMutedUsers(MUTER)).resolves.toEqual([MUTEE]);
  });

  it('returns and persists an empty list when nobody is muted (a missing directory is an empty list at the service)', async () => {
    vi.spyOn(HomeserverService, 'list').mockResolvedValue([]);

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
    vi.spyOn(HomeserverService, 'list').mockRejectedValue(serverError);

    await expect(MuteApplication.fetchMutedUsers(MUTER)).rejects.toBe(serverError);
  });

  it('propagates a non-AppError failure', async () => {
    vi.spyOn(HomeserverService, 'list').mockRejectedValue(new Error('network-fail'));

    await expect(MuteApplication.fetchMutedUsers(MUTER)).rejects.toThrow('network-fail');
  });
});

describe('MuteApplication.subscribeMuteDirectoryEventStream', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('subscribes to the private v1 mutes prefix, which the service serves only with the owner session', async () => {
    const stream = new ReadableStream();
    const subscribe = vi.spyOn(HomeserverService, 'subscribeUserEventStreamForPath').mockResolvedValue(stream);

    await expect(MuteApplication.subscribeMuteDirectoryEventStream(MUTER, 'c1')).resolves.toBe(stream);

    expect(MUTE_HOMESERVER_EVENTS_PATH_PREFIX).toBe('/priv/social/v1/mutes/');
    expect(subscribe).toHaveBeenCalledExactlyOnceWith({
      userZ32: MUTER,
      cursor: 'c1',
      pathPrefix: MUTE_HOMESERVER_EVENTS_PATH_PREFIX,
    });
  });

  it('lets the auth failure of a missing session through untouched, for the coordinator to report', async () => {
    // `HomeserverService.subscribeUserEventStreamForPath` throws this before any request for a `/priv/` prefix.
    const expired = Err.auth(AuthErrorCode.SESSION_EXPIRED, 'A private event stream needs a signed-in session.', {
      service: ErrorService.Homeserver,
      operation: 'subscribeUserEventStream',
    });
    vi.spyOn(HomeserverService, 'subscribeUserEventStreamForPath').mockRejectedValue(expired);

    await expect(MuteApplication.subscribeMuteDirectoryEventStream(MUTER, null)).rejects.toBe(expired);
  });
});
