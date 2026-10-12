import { decodeObject } from 'pubky-social-specs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { FollowNormalizer } from '@/pipes/follow/follow.normalizer';
import { INVALID_INPUTS, restoreMocks, setupIntegrationTestMocks, TEST_PUBKY } from '../pipes.test-utils';

describe('FollowNormalizer', () => {
  beforeEach(setupIntegrationTestMocks);
  afterEach(restoreMocks);

  describe('to', () => {
    it('builds a public follow named by the followee', () => {
      const result = FollowNormalizer.to({ follower: TEST_PUBKY.USER_1, followee: TEST_PUBKY.USER_2 });

      expect(result.id).toBe(TEST_PUBKY.USER_2);
      expect(result.url).toBe(`pubky://${TEST_PUBKY.USER_1}/pub/social/v1/follows/${TEST_PUBKY.USER_2}.json`);
      expect(decodeObject(result.url, result.body, 'follow')).toEqual(result.object);
    });

    it.each([`pubky${TEST_PUBKY.USER_2}`, `pk:${TEST_PUBKY.USER_2}`])('strips the display prefix of %s', (followee) => {
      expect(FollowNormalizer.to({ follower: TEST_PUBKY.USER_1, followee }).id).toBe(TEST_PUBKY.USER_2);
    });

    it.each([INVALID_INPUTS.EMPTY, INVALID_INPUTS.INVALID_FORMAT])('refuses the followee %j', (followee) => {
      expect(() => FollowNormalizer.to({ follower: TEST_PUBKY.USER_1, followee })).toThrow(AppError);
      try {
        FollowNormalizer.to({ follower: TEST_PUBKY.USER_1, followee });
      } catch (error) {
        expect((error as AppError).code).toBe(ValidationErrorCode.INVALID_INPUT);
      }
    });
  });

  describe('toDeleteUrls', () => {
    it('names the 0.x copy first, then the v1 one', () => {
      expect(FollowNormalizer.toDeleteUrls({ follower: TEST_PUBKY.USER_1, followee: TEST_PUBKY.USER_2 })).toEqual([
        `pubky://${TEST_PUBKY.USER_1}/pub/pubky.app/follows/${TEST_PUBKY.USER_2}`,
        `pubky://${TEST_PUBKY.USER_1}/pub/social/v1/follows/${TEST_PUBKY.USER_2}.json`,
      ]);
    });
  });
});
