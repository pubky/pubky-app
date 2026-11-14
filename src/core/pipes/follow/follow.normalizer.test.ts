import { buildFollow, buildUri, decodeObject, listPrefix, parseUri } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { describe, expect, it } from 'vitest';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';
import { FollowNormalizer } from '@/pipes/follow/follow.normalizer';
import { withFrozenSpecClock } from '@/test-utils/spec-clock';

const FOLLOWER = fakeOwner(1);
const FOLLOWEE = fakeOwner(2);

const caught = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
};

describe('FollowNormalizer', () => {
  withFrozenSpecClock();

  describe('to', () => {
    it('builds the follow where pubky-social-specs stores it: the followee key under the follower public tree', () => {
      const built = FollowNormalizer.to({ follower: FOLLOWER, followee: FOLLOWEE });

      expect(built.url).toBe(`pubky://${FOLLOWER}/pub/social/v1/follows/${FOLLOWEE}.json`);
      expect(built.url).toBe(buildUri(FOLLOWER, 'follow', FOLLOWEE));
      expect(built.id).toBe(FOLLOWEE);
      expect(parseUri(built.url)).toMatchObject({ owner: FOLLOWER, root: 'public', kind: 'follow', id: FOLLOWEE });
    });

    it('returns the bytes to PUT, which decode back to the stored object', () => {
      const built = FollowNormalizer.to({ follower: FOLLOWER, followee: FOLLOWEE });

      expect(built.object).toEqual({ created_at: expect.any(Number) });
      expect(decodeObject(built.url, built.body, 'follow')).toEqual(built.object);
      expect(built.body).toEqual(buildFollow(FOLLOWER, FOLLOWEE).body);
    });

    it.each([`pubky${FOLLOWEE}`, `pk:${FOLLOWEE}`])('strips the %s prefix the builder refuses', (followee) => {
      expect(FollowNormalizer.to({ follower: FOLLOWER, followee: followee as Pubky }).id).toBe(FOLLOWEE);
    });

    it('allows a self-follow at the data model level', () => {
      expect(FollowNormalizer.to({ follower: FOLLOWER, followee: FOLLOWER }).id).toBe(FOLLOWER);
    });

    it.each([
      ['an empty followee', FOLLOWER, '', 'followee'],
      ['a followee that is no key', FOLLOWER, 'not-a-key', 'followee'],
      ['a followee with a bad character', FOLLOWER, `${FOLLOWEE.slice(0, 51)}O`, 'followee'],
      ['a follower that is no key', 'viewer', FOLLOWEE, 'owner'],
    ])('refuses %s as a validation error naming the field', (_case, follower, followee, field) => {
      const error = caught(() => FollowNormalizer.to({ follower: follower as Pubky, followee: followee as Pubky }));

      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({
        category: ErrorCategory.Validation,
        code: ValidationErrorCode.INVALID_INPUT,
        service: ErrorService.SocialSpecs,
        operation: 'buildFollow',
        context: { follower, followee, field },
      });
    });
  });

  describe('toDeleteUrls', () => {
    it('names both copies an unfollow deletes: the 0.x follow first, then the v1 one', () => {
      expect(FollowNormalizer.toDeleteUrls({ follower: FOLLOWER, followee: FOLLOWEE })).toEqual([
        `${listPrefix(FOLLOWER, 'legacy')}follows/${FOLLOWEE}`,
        buildUri(FOLLOWER, 'follow', FOLLOWEE),
      ]);
    });

    it('strips a prefixed followee like `to` does', () => {
      expect(FollowNormalizer.toDeleteUrls({ follower: FOLLOWER, followee: `pubky${FOLLOWEE}` as Pubky })).toEqual(
        FollowNormalizer.toDeleteUrls({ follower: FOLLOWER, followee: FOLLOWEE }),
      );
    });

    it('refuses a followee that is no key', () => {
      const error = caught(() => FollowNormalizer.toDeleteUrls({ follower: FOLLOWER, followee: 'nope' as Pubky }));

      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ code: ValidationErrorCode.INVALID_INPUT, operation: 'followDeletionPaths' });
    });
  });
});
