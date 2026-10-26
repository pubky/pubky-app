import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MuteApplication } from '@/application/mute/mute';
import { HttpMethod } from '@/libs/http/http.types';
import type { Pubky } from '@/models/models.types';
import { MuteNormalizer } from '@/pipes/mute/mute.normalizer';
import { MuteController } from './mute';

const TEST_PUBKY = {
  USER_1: '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky,
  USER_2: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky,
};

describe('MuteController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('commitMute', () => {
    it('should build the mute with the package and delegate to MuteApplication.commitMute (PUT)', async () => {
      const muter = TEST_PUBKY.USER_1;
      const mutee = TEST_PUBKY.USER_2;

      const commitMuteSpy = vi.spyOn(MuteApplication, 'commitMute').mockResolvedValue(undefined);

      await MuteController.commitMute(HttpMethod.PUT, { muter, mutee });

      expect(commitMuteSpy).toHaveBeenCalledWith({
        eventType: HttpMethod.PUT,
        muteUrl: `pubky://${muter}/priv/social/v1/mutes/${mutee}.json`,
        muteBody: expect.toSatisfy(ArrayBuffer.isView),
        muter,
        mutee,
      });
    });

    it('should delete every copy of the mute on DELETE', async () => {
      const muter = TEST_PUBKY.USER_1;
      const mutee = TEST_PUBKY.USER_2;

      const commitMuteSpy = vi.spyOn(MuteApplication, 'commitMute').mockResolvedValue(undefined);

      await MuteController.commitMute(HttpMethod.DELETE, { muter, mutee });

      expect(commitMuteSpy).toHaveBeenCalledWith({
        eventType: HttpMethod.DELETE,
        deleteUrls: [
          `pubky://${muter}/pub/pubky.app/mutes/${mutee}`,
          `pubky://${muter}/priv/social/v1/mutes/${mutee}.json`,
        ],
        muter,
        mutee,
      });
    });

    it('should normalize mutee pubky by stripping prefix', async () => {
      const muter = TEST_PUBKY.USER_1;
      const prefixedMutee = `pubky${TEST_PUBKY.USER_2}` as Pubky;

      const toSpy = vi.spyOn(MuteNormalizer, 'to');
      const commitMuteSpy = vi.spyOn(MuteApplication, 'commitMute').mockResolvedValue(undefined);

      await MuteController.commitMute(HttpMethod.PUT, { muter, mutee: prefixedMutee });

      expect(toSpy).toHaveBeenCalledWith({ muter, mutee: TEST_PUBKY.USER_2 });
      expect(commitMuteSpy).toHaveBeenCalledWith(expect.objectContaining({ mutee: TEST_PUBKY.USER_2 }));
    });

    it('should bubble when MuteNormalizer.to fails and not delegate', async () => {
      const muter = TEST_PUBKY.USER_1;
      const mutee = TEST_PUBKY.USER_2;

      vi.spyOn(MuteNormalizer, 'to').mockImplementation(() => {
        throw new Error('normalize-fail');
      });
      const commitMuteSpy = vi.spyOn(MuteApplication, 'commitMute').mockResolvedValue(undefined);

      await expect(MuteController.commitMute(HttpMethod.PUT, { muter, mutee })).rejects.toThrow('normalize-fail');

      expect(commitMuteSpy).not.toHaveBeenCalled();
    });

    it('should bubble when MuteApplication.commitMute fails', async () => {
      const muter = TEST_PUBKY.USER_1;
      const mutee = TEST_PUBKY.USER_2;

      vi.spyOn(MuteApplication, 'commitMute').mockRejectedValue(new Error('commit-fail'));

      await expect(MuteController.commitMute(HttpMethod.PUT, { muter, mutee })).rejects.toThrow('commit-fail');
    });
  });

  describe('fetchMutedUsers', () => {
    it('should delegate to MuteApplication.fetchMutedUsers', async () => {
      const pubky = TEST_PUBKY.USER_1;
      const mockMutedUsers: Pubky[] = ['muted-1' as Pubky, 'muted-2' as Pubky];

      const fetchSpy = vi.spyOn(MuteApplication, 'fetchMutedUsers').mockResolvedValue(mockMutedUsers);

      const result = await MuteController.fetchMutedUsers(pubky);

      expect(result).toEqual(mockMutedUsers);
      expect(fetchSpy).toHaveBeenCalledWith(pubky);
    });

    it('should propagate errors from application layer', async () => {
      const pubky = TEST_PUBKY.USER_1;

      vi.spyOn(MuteApplication, 'fetchMutedUsers').mockRejectedValue(new Error('fetch-fail'));

      await expect(MuteController.fetchMutedUsers(pubky)).rejects.toThrow('fetch-fail');
    });
  });
});
