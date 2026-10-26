import { decodeObject } from 'pubky-social-specs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/libs/error/error';
import { MuteNormalizer } from '@/pipes/mute/mute.normalizer';
import { INVALID_INPUTS, restoreMocks, setupIntegrationTestMocks, TEST_PUBKY } from '../pipes.test-utils';

describe('MuteNormalizer', () => {
  beforeEach(setupIntegrationTestMocks);
  afterEach(restoreMocks);

  describe('to', () => {
    it('builds a private mute named by the mutee', () => {
      const result = MuteNormalizer.to({ muter: TEST_PUBKY.USER_1, mutee: TEST_PUBKY.USER_2 });

      expect(result.url).toBe(`pubky://${TEST_PUBKY.USER_1}/priv/social/v1/mutes/${TEST_PUBKY.USER_2}.json`);
      expect(decodeObject(result.url, result.body, 'mute')).toEqual(result.object);
    });

    it('strips a display prefix', () => {
      expect(MuteNormalizer.to({ muter: TEST_PUBKY.USER_1, mutee: `pubky${TEST_PUBKY.USER_2}` }).id).toBe(
        TEST_PUBKY.USER_2,
      );
    });

    it.each([INVALID_INPUTS.EMPTY, INVALID_INPUTS.INVALID_FORMAT])('refuses the mutee %j', (mutee) => {
      expect(() => MuteNormalizer.to({ muter: TEST_PUBKY.USER_1, mutee })).toThrow(AppError);
    });
  });

  describe('toDeleteUrls', () => {
    it('names the 0.x copy first, then the v1 one', () => {
      expect(MuteNormalizer.toDeleteUrls({ muter: TEST_PUBKY.USER_1, mutee: TEST_PUBKY.USER_2 })).toEqual([
        `pubky://${TEST_PUBKY.USER_1}/pub/pubky.app/mutes/${TEST_PUBKY.USER_2}`,
        `pubky://${TEST_PUBKY.USER_1}/priv/social/v1/mutes/${TEST_PUBKY.USER_2}.json`,
      ]);
    });
  });
});
