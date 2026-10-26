import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/database/franky/franky';
import { AppError } from '@/libs/error/error';
import { ServerErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import type { Pubky } from '@/models/models.types';
import { UserStreamModel } from '@/models/stream/user/userStream';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalMuteService } from '@/services/local/mute/mute';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import { MuteApplication } from './mute';

describe('MuteApplication.commitMute', () => {
  const muter = 'pubky_muter' as Pubky;
  const mutee = 'pubky_mutee' as Pubky;
  const muteUrl = 'pubky://muter/priv/social/v1/mutes/mutee.json';
  const legacyUrl = 'pubky://muter/pub/pubky.app/mutes/mutee';
  const muteBody = new TextEncoder().encode('{"created_at":1}');
  // A mute PUTs its bytes; an unmute deletes every copy, the 0.x one first
  const commitParams = (eventType: HttpMethod) =>
    eventType === HttpMethod.PUT
      ? { eventType: HttpMethod.PUT as const, muteUrl, muteBody, muter, mutee }
      : { eventType: HttpMethod.DELETE as const, deleteUrls: [legacyUrl, muteUrl], muter, mutee };
  const spyOnSync = (eventType: HttpMethod) =>
    eventType === HttpMethod.PUT
      ? vi.spyOn(HomeserverService, 'putBlob').mockResolvedValue(undefined)
      : vi.spyOn(HomeserverService, 'deleteIdempotent').mockResolvedValue(undefined);
  const expectSynced = (spy: ReturnType<typeof spyOnSync>, eventType: HttpMethod) => {
    if (eventType === HttpMethod.PUT) expect(spy).toHaveBeenCalledWith({ url: muteUrl, blob: muteBody });
    else expect(spy.mock.calls).toEqual([[legacyUrl], [muteUrl]]);
  };

  async function clearTables() {
    await db.transaction('rw', [UserStreamModel.table], async () => {
      await UserStreamModel.table.clear();
    });
  }

  async function isMutedInStream(userId: Pubky): Promise<boolean> {
    const stream = await LocalStreamUsersService.findById(UserStreamTypes.MUTED);
    return stream?.stream.includes(userId) ?? false;
  }

  beforeEach(async () => {
    await db.initialize();
    await clearTables();
    vi.clearAllMocks();
  });

  describe.each<['PUT' | 'DELETE', 'mute' | 'unmute', boolean]>([
    ['PUT', 'mute', true],
    ['DELETE', 'unmute', false],
  ])('%s operation', (eventType, action, expectedStatus) => {
    const homeserverAction = eventType === 'PUT' ? HttpMethod.PUT : HttpMethod.DELETE;

    it(`should ${action} when stream is empty`, async () => {
      const requestSpy = spyOnSync(homeserverAction);

      await MuteApplication.commitMute(commitParams(homeserverAction));

      const muted = await isMutedInStream(mutee);
      expect(muted).toBe(expectedStatus);
      expectSynced(requestSpy, homeserverAction);
    });

    it(`should update muted stream to ${action}d state`, async () => {
      // Set up opposite stream state
      if (!expectedStatus) {
        // For unmute: user must be in stream first
        await LocalStreamUsersService.prependToStream(UserStreamTypes.MUTED, [mutee]);
      }

      const requestSpy = spyOnSync(homeserverAction);

      await MuteApplication.commitMute(commitParams(homeserverAction));

      const muted = await isMutedInStream(mutee);
      expect(muted).toBe(expectedStatus);
      expectSynced(requestSpy, homeserverAction);
    });

    it(`should be idempotent when user already ${action}d`, async () => {
      // Set up stream to match expected state by performing the action once first
      if (expectedStatus) {
        // For mute idempotency: mute first so user is already in stream
        await LocalStreamUsersService.prependToStream(UserStreamTypes.MUTED, [mutee]);
      } else {
        // For unmute idempotency: mute then unmute, so user has been properly unmuted
        await LocalMuteService.create({ muter, mutee });
        await LocalMuteService.delete({ muter, mutee });
      }

      const prependSpy = vi.spyOn(LocalStreamUsersService, 'prependToStream');
      const removeSpy = vi.spyOn(LocalStreamUsersService, 'removeFromStream');
      const requestSpy = spyOnSync(homeserverAction);

      await MuteApplication.commitMute(commitParams(homeserverAction));

      const muted = await isMutedInStream(mutee);
      expect(muted).toBe(expectedStatus);
      expect(prependSpy).not.toHaveBeenCalled();
      expect(removeSpy).not.toHaveBeenCalled();
      expectSynced(requestSpy, homeserverAction);
      prependSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });

  describe('Operation Order', () => {
    it('should call database operation before homeserver for PUT', async () => {
      const createSpy = vi.spyOn(LocalMuteService, 'create');
      const requestSpy = spyOnSync(HttpMethod.PUT);

      await MuteApplication.commitMute(commitParams(HttpMethod.PUT));

      expect(createSpy.mock.invocationCallOrder[0]).toBeLessThan(requestSpy.mock.invocationCallOrder[0]);
    });

    it('should call database operation before homeserver for DELETE', async () => {
      const deleteSpy = vi.spyOn(LocalMuteService, 'delete');
      const requestSpy = spyOnSync(HttpMethod.DELETE);

      await MuteApplication.commitMute(commitParams(HttpMethod.DELETE));

      expect(deleteSpy.mock.invocationCallOrder[0]).toBeLessThan(requestSpy.mock.invocationCallOrder[0]);
    });
  });

  describe('Error Handling', () => {
    it('should not call homeserver when local mute operation fails', async () => {
      const findByIdSpy = vi.spyOn(LocalStreamUsersService, 'findById').mockRejectedValue(new Error('db-fail'));
      const requestSpy = spyOnSync(HttpMethod.PUT);

      try {
        await expect(MuteApplication.commitMute(commitParams(HttpMethod.PUT))).rejects.toThrow(
          'Failed to mute mute relationship',
        );

        expect(requestSpy).not.toHaveBeenCalled();
      } finally {
        findByIdSpy.mockRestore();
      }
    });

    it('should propagate homeserver errors', async () => {
      const requestSpy = vi.spyOn(HomeserverService, 'putBlob').mockRejectedValue(new Error('homeserver-fail'));

      await expect(MuteApplication.commitMute(commitParams(HttpMethod.PUT))).rejects.toThrow('homeserver-fail');

      expect(requestSpy).toHaveBeenCalledWith({ url: muteUrl, blob: muteBody });
    });

    it('should not call homeserver when stream update fails', async () => {
      const streamSpy = vi
        .spyOn(LocalStreamUsersService, 'prependToStream')
        .mockRejectedValue(new Error('stream-fail'));
      const requestSpy = spyOnSync(HttpMethod.PUT);

      try {
        await expect(MuteApplication.commitMute(commitParams(HttpMethod.PUT))).rejects.toThrow(
          'Failed to mute mute relationship',
        );

        expect(requestSpy).not.toHaveBeenCalled();
      } finally {
        streamSpy.mockRestore();
      }
    });

    it('should handle both database and homeserver failures', async () => {
      const createSpy = vi.spyOn(LocalMuteService, 'create').mockRejectedValue(new Error('db-fail'));
      const requestSpy = vi.spyOn(HomeserverService, 'putBlob').mockRejectedValue(new Error('homeserver-fail'));

      await expect(MuteApplication.commitMute(commitParams(HttpMethod.PUT))).rejects.toThrow('db-fail');

      expect(createSpy).toHaveBeenCalled();
      expect(requestSpy).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined return values correctly', async () => {
      const requestSpy = spyOnSync(HttpMethod.DELETE);

      const result = await MuteApplication.commitMute(commitParams(HttpMethod.DELETE));

      expect(result).toBeUndefined();
      expect(requestSpy).toHaveBeenCalled();
    });
  });
});

describe('MuteApplication.fetchMutedUsers', () => {
  const pubky = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky;
  const keys = [
    'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
    'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy',
    '8kkppkmiubfq4pxn6f73nqrhhhgkb5xyfprntc9si3np9ydbotto',
  ] as Pubky[];
  const v1Dir = `pubky://${pubky}/priv/social/v1/mutes/`;
  const legacyDir = `pubky://${pubky}/pub/pubky.app/mutes/`;
  const listing = (v1: string[], legacy: string[]) => (params: { baseDirectory: string }) =>
    Promise.resolve(params.baseDirectory === v1Dir ? v1 : params.baseDirectory === legacyDir ? legacy : []);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('unions the v1 mutes with the ones a 0.x client wrote', async () => {
    const listSpy = vi
      .spyOn(HomeserverService, 'list')
      .mockImplementation(
        listing(
          [`${v1Dir}${keys[0]}.json`, `${v1Dir}${keys[1]}.json`],
          [`${legacyDir}${keys[1]}`, `${legacyDir}${keys[2]}`],
        ),
      );

    const result = await MuteApplication.fetchMutedUsers(pubky);

    expect(listSpy).toHaveBeenCalledWith({ baseDirectory: v1Dir });
    expect(listSpy).toHaveBeenCalledWith({ baseDirectory: legacyDir });
    expect(result).toEqual(keys);
  });

  it('should return empty array when no muted users', async () => {
    vi.spyOn(HomeserverService, 'list').mockImplementation(listing([], []));

    expect(await MuteApplication.fetchMutedUsers(pubky)).toEqual([]);
  });

  it('skips listed names that name no mute', async () => {
    vi.spyOn(HomeserverService, 'list').mockImplementation(
      listing([`${v1Dir}${keys[0]}.json`, `${v1Dir}not a key.json`], [legacyDir, `${legacyDir}a/b`]),
    );

    expect(await MuteApplication.fetchMutedUsers(pubky)).toEqual([keys[0]]);
  });

  it('should return empty array when homeserver list returns empty (404 absorbed at service layer)', async () => {
    vi.spyOn(HomeserverService, 'list').mockResolvedValue([]);

    const result = await MuteApplication.fetchMutedUsers(pubky);

    expect(result).toEqual([]);
  });

  it('should propagate non-404 AppError from HomeserverService.list', async () => {
    const serverError = new AppError({
      category: ErrorCategory.Server,
      code: ServerErrorCode.INTERNAL_ERROR,
      message: 'Server error',
      service: ErrorService.Homeserver,
      operation: 'list',
      context: { statusCode: 500 },
    });
    vi.spyOn(HomeserverService, 'list').mockRejectedValue(serverError);

    await expect(MuteApplication.fetchMutedUsers(pubky)).rejects.toThrow('Server error');
  });

  it('should propagate non-AppError exceptions', async () => {
    vi.spyOn(HomeserverService, 'list').mockRejectedValue(new Error('network-fail'));

    await expect(MuteApplication.fetchMutedUsers(pubky)).rejects.toThrow('network-fail');
  });
});
