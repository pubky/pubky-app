import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Core from '@/core';
import {
  HttpMethod,
  AppError,
  ErrorCategory,
  ErrorService,
  ClientErrorCode,
  ServerErrorCode,
  HttpStatusCode,
} from '@/libs';
import { MuteApplication } from './mute';

vi.mock('pubky-app-specs', () => ({
  baseUriBuilder: (pubky: string) => `pubky://${pubky}/pub/pubky.app/`,
}));

describe('MuteApplication.commitMute', () => {
  const muter = 'pubky_muter' as Core.Pubky;
  const mutee = 'pubky_mutee' as Core.Pubky;
  const muteUrl = 'pubky://muter/pub/pubky.app/mutes/mutee';
  const muteJson = { created_at: BigInt(Date.now()) } as unknown as Record<string, unknown>;

  async function clearTables() {
    await Core.db.transaction('rw', [Core.UserStreamModel.table], async () => {
      await Core.UserStreamModel.table.clear();
    });
  }

  async function isMutedInStream(userId: Core.Pubky): Promise<boolean> {
    const stream = await Core.LocalStreamUsersService.findById(Core.UserStreamTypes.MUTED);
    return stream?.stream.includes(userId) ?? false;
  }

  beforeEach(async () => {
    await Core.db.initialize();
    await clearTables();
    vi.clearAllMocks();
  });

  describe.each<['PUT' | 'DELETE', 'mute' | 'unmute', boolean]>([
    ['PUT', 'mute', true],
    ['DELETE', 'unmute', false],
  ])('%s operation', (eventType, action, expectedStatus) => {
    const homeserverAction = eventType === 'PUT' ? HttpMethod.PUT : HttpMethod.DELETE;

    it(`should ${action} when stream is empty`, async () => {
      const requestSpy = vi.spyOn(Core.HomeserverService, 'request').mockResolvedValue(undefined as unknown as void);

      await MuteApplication.commitMute({
        eventType: homeserverAction,
        muteUrl,
        muteJson,
        muter,
        mutee,
      });

      const muted = await isMutedInStream(mutee);
      expect(muted).toBe(expectedStatus);
      expect(requestSpy).toHaveBeenCalledWith({ method: homeserverAction, url: muteUrl, bodyJson: muteJson });
    });

    it(`should update muted stream to ${action}d state`, async () => {
      // Set up opposite stream state
      if (!expectedStatus) {
        // For unmute: user must be in stream first
        await Core.LocalStreamUsersService.prependToStream(Core.UserStreamTypes.MUTED, [mutee]);
      }

      const requestSpy = vi.spyOn(Core.HomeserverService, 'request').mockResolvedValue(undefined as unknown as void);

      await MuteApplication.commitMute({
        eventType: homeserverAction,
        muteUrl,
        muteJson,
        muter,
        mutee,
      });

      const muted = await isMutedInStream(mutee);
      expect(muted).toBe(expectedStatus);
      expect(requestSpy).toHaveBeenCalledWith({ method: homeserverAction, url: muteUrl, bodyJson: muteJson });
    });

    it(`should be idempotent when user already ${action}d`, async () => {
      // Set up stream to match expected state by performing the action once first
      if (expectedStatus) {
        // For mute idempotency: mute first so user is already in stream
        await Core.LocalStreamUsersService.prependToStream(Core.UserStreamTypes.MUTED, [mutee]);
      } else {
        // For unmute idempotency: mute then unmute, so user has been properly unmuted
        await Core.LocalMuteService.create({ muter, mutee });
        await Core.LocalMuteService.delete({ muter, mutee });
      }

      const prependSpy = vi.spyOn(Core.LocalStreamUsersService, 'prependToStream');
      const removeSpy = vi.spyOn(Core.LocalStreamUsersService, 'removeFromStream');
      const requestSpy = vi.spyOn(Core.HomeserverService, 'request').mockResolvedValue(undefined as unknown as void);

      await MuteApplication.commitMute({
        eventType: homeserverAction,
        muteUrl,
        muteJson,
        muter,
        mutee,
      });

      const muted = await isMutedInStream(mutee);
      expect(muted).toBe(expectedStatus);
      expect(prependSpy).not.toHaveBeenCalled();
      expect(removeSpy).not.toHaveBeenCalled();
      expect(requestSpy).toHaveBeenCalledWith({ method: homeserverAction, url: muteUrl, bodyJson: muteJson });
      prependSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });

  describe('Operation Order', () => {
    it('should call database operation before homeserver for PUT', async () => {
      const createSpy = vi.spyOn(Core.LocalMuteService, 'create');
      const requestSpy = vi.spyOn(Core.HomeserverService, 'request').mockResolvedValue(undefined as unknown as void);

      await MuteApplication.commitMute({
        eventType: HttpMethod.PUT,
        muteUrl,
        muteJson,
        muter,
        mutee,
      });

      expect(createSpy.mock.invocationCallOrder[0]).toBeLessThan(requestSpy.mock.invocationCallOrder[0]);
    });

    it('should call database operation before homeserver for DELETE', async () => {
      const deleteSpy = vi.spyOn(Core.LocalMuteService, 'delete');
      const requestSpy = vi.spyOn(Core.HomeserverService, 'request').mockResolvedValue(undefined as unknown as void);

      await MuteApplication.commitMute({
        eventType: HttpMethod.DELETE,
        muteUrl,
        muteJson,
        muter,
        mutee,
      });

      expect(deleteSpy.mock.invocationCallOrder[0]).toBeLessThan(requestSpy.mock.invocationCallOrder[0]);
    });
  });

  describe('Error Handling', () => {
    it('should not call homeserver when local mute operation fails', async () => {
      const findByIdSpy = vi.spyOn(Core.LocalStreamUsersService, 'findById').mockRejectedValue(new Error('db-fail'));
      const requestSpy = vi.spyOn(Core.HomeserverService, 'request').mockResolvedValue(undefined as unknown as void);

      try {
        await expect(
          MuteApplication.commitMute({
            eventType: HttpMethod.PUT,
            muteUrl,
            muteJson,
            muter,
            mutee,
          }),
        ).rejects.toThrow('Failed to mute mute relationship');

        expect(requestSpy).not.toHaveBeenCalled();
      } finally {
        findByIdSpy.mockRestore();
      }
    });

    it('should propagate homeserver errors', async () => {
      const requestSpy = vi.spyOn(Core.HomeserverService, 'request').mockRejectedValue(new Error('homeserver-fail'));

      await expect(
        MuteApplication.commitMute({
          eventType: HttpMethod.PUT,
          muteUrl,
          muteJson,
          muter,
          mutee,
        }),
      ).rejects.toThrow('homeserver-fail');

      expect(requestSpy).toHaveBeenCalledWith({ method: HttpMethod.PUT, url: muteUrl, bodyJson: muteJson });
    });

    it('should not call homeserver when stream update fails', async () => {
      const streamSpy = vi
        .spyOn(Core.LocalStreamUsersService, 'prependToStream')
        .mockRejectedValue(new Error('stream-fail'));
      const requestSpy = vi.spyOn(Core.HomeserverService, 'request').mockResolvedValue(undefined as unknown as void);

      try {
        await expect(
          MuteApplication.commitMute({
            eventType: HttpMethod.PUT,
            muteUrl,
            muteJson,
            muter,
            mutee,
          }),
        ).rejects.toThrow('Failed to mute mute relationship');

        expect(requestSpy).not.toHaveBeenCalled();
      } finally {
        streamSpy.mockRestore();
      }
    });

    it('should handle both database and homeserver failures', async () => {
      const createSpy = vi.spyOn(Core.LocalMuteService, 'create').mockRejectedValue(new Error('db-fail'));
      const requestSpy = vi.spyOn(Core.HomeserverService, 'request').mockRejectedValue(new Error('homeserver-fail'));

      await expect(
        MuteApplication.commitMute({
          eventType: HttpMethod.PUT,
          muteUrl,
          muteJson,
          muter,
          mutee,
        }),
      ).rejects.toThrow('db-fail');

      expect(createSpy).toHaveBeenCalled();
      expect(requestSpy).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle invalid event types gracefully', async () => {
      const requestSpy = vi.spyOn(Core.HomeserverService, 'request').mockResolvedValue(undefined as unknown as void);

      await MuteApplication.commitMute({
        eventType: 'INVALID' as unknown as HttpMethod,
        muteUrl,
        muteJson,
        muter,
        mutee,
      });

      expect(requestSpy).not.toHaveBeenCalled();
    });

    it('should handle undefined return values correctly', async () => {
      const requestSpy = vi.spyOn(Core.HomeserverService, 'request').mockResolvedValue(undefined as unknown as void);

      const result = await MuteApplication.commitMute({
        eventType: HttpMethod.DELETE,
        muteUrl,
        muteJson,
        muter,
        mutee,
      });

      expect(result).toBeUndefined();
      expect(requestSpy).toHaveBeenCalled();
    });
  });
});

describe('MuteApplication.fetchMutedUsers', () => {
  const pubky = 'testpubky123' as Core.Pubky;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return extracted pubkeys from homeserver list response', async () => {
    const muteUris = [
      `pubky://${pubky}/pub/pubky.app/mutes/mutee_aaa`,
      `pubky://${pubky}/pub/pubky.app/mutes/mutee_bbb`,
      `pubky://${pubky}/pub/pubky.app/mutes/mutee_ccc`,
    ];

    const listSpy = vi.spyOn(Core.HomeserverService, 'list').mockResolvedValue(muteUris);

    const result = await MuteApplication.fetchMutedUsers(pubky);

    expect(listSpy).toHaveBeenCalledWith({
      baseDirectory: `pubky://${pubky}/pub/pubky.app/mutes/`,
    });
    expect(result).toEqual(['mutee_aaa', 'mutee_bbb', 'mutee_ccc']);
  });

  it('should return empty array when no muted users', async () => {
    const listSpy = vi.spyOn(Core.HomeserverService, 'list').mockResolvedValue([]);

    const result = await MuteApplication.fetchMutedUsers(pubky);

    expect(listSpy).toHaveBeenCalledWith({
      baseDirectory: `pubky://${pubky}/pub/pubky.app/mutes/`,
    });
    expect(result).toEqual([]);
  });

  it('should build correct mutes directory URL using baseUriBuilder', async () => {
    const listSpy = vi.spyOn(Core.HomeserverService, 'list').mockResolvedValue([]);

    await MuteApplication.fetchMutedUsers(pubky);

    expect(listSpy).toHaveBeenCalledWith({
      baseDirectory: `pubky://${pubky}/pub/pubky.app/mutes/`,
    });
  });

  it('should filter out empty strings from URIs with trailing slashes', async () => {
    const muteUris = [`pubky://${pubky}/pub/pubky.app/mutes/mutee_aaa`, `pubky://${pubky}/pub/pubky.app/mutes/`];
    vi.spyOn(Core.HomeserverService, 'list').mockResolvedValue(muteUris);

    const result = await MuteApplication.fetchMutedUsers(pubky);

    expect(result).toEqual(['mutee_aaa']);
  });

  it('should return empty array when homeserver returns 404', async () => {
    const notFoundError = new AppError({
      category: ErrorCategory.Client,
      code: ClientErrorCode.NOT_FOUND,
      message: 'Not found',
      service: ErrorService.Homeserver,
      operation: 'list',
      context: { statusCode: HttpStatusCode.NOT_FOUND },
    });
    vi.spyOn(Core.HomeserverService, 'list').mockRejectedValue(notFoundError);

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
    vi.spyOn(Core.HomeserverService, 'list').mockRejectedValue(serverError);

    await expect(MuteApplication.fetchMutedUsers(pubky)).rejects.toThrow('Server error');
  });

  it('should propagate non-AppError exceptions', async () => {
    vi.spyOn(Core.HomeserverService, 'list').mockRejectedValue(new Error('network-fail'));

    await expect(MuteApplication.fetchMutedUsers(pubky)).rejects.toThrow('network-fail');
  });
});
