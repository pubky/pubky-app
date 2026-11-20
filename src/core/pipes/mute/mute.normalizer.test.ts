import { buildMute, buildUri, decodeObject, listPrefix, parseUri } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { describe, expect, it } from 'vitest';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';
import { MuteNormalizer } from '@/pipes/mute/mute.normalizer';
import { withFrozenSpecClock } from '@/test-utils/spec-clock';

const MUTER = fakeOwner(1);
const MUTEE = fakeOwner(2);

const caught = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
};

describe('MuteNormalizer', () => {
  withFrozenSpecClock();

  describe('to', () => {
    it('builds the mute where pubky-social-specs stores it: the mutee key under the muter PRIVATE tree', () => {
      const built = MuteNormalizer.to({ muter: MUTER, mutee: MUTEE });

      expect(built.url).toBe(`pubky://${MUTER}/priv/social/v1/mutes/${MUTEE}.json`);
      expect(built.url).toBe(buildUri(MUTER, 'mute', MUTEE));
      expect(built.id).toBe(MUTEE);
      expect(parseUri(built.url)).toMatchObject({ owner: MUTER, root: 'private', kind: 'mute', id: MUTEE });
    });

    it('returns the bytes to PUT, which decode back to the stored object', () => {
      const built = MuteNormalizer.to({ muter: MUTER, mutee: MUTEE });

      expect(built.object).toEqual({ created_at: expect.any(Number) });
      expect(decodeObject(built.url, built.body, 'mute')).toEqual(built.object);
      expect(built.body).toEqual(buildMute(MUTER, MUTEE).body);
    });

    it.each([`pubky${MUTEE}`, `pk:${MUTEE}`])('strips the %s prefix the builder refuses', (mutee) => {
      expect(MuteNormalizer.to({ muter: MUTER, mutee: mutee as Pubky }).id).toBe(MUTEE);
    });

    it('allows a self-mute at the data model level', () => {
      expect(MuteNormalizer.to({ muter: MUTER, mutee: MUTER }).id).toBe(MUTER);
    });

    it.each([
      ['an empty mutee', MUTER, '', 'mutee'],
      ['a mutee that is no key', MUTER, 'not-a-key', 'mutee'],
      ['a mutee with a bad character', MUTER, `${MUTEE.slice(0, 51)}O`, 'mutee'],
      ['a muter that is no key', 'viewer', MUTEE, 'owner'],
    ])('refuses %s as a validation error naming the field', (_case, muter, mutee, field) => {
      const error = caught(() => MuteNormalizer.to({ muter: muter as Pubky, mutee: mutee as Pubky }));

      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({
        category: ErrorCategory.Validation,
        code: ValidationErrorCode.INVALID_INPUT,
        service: ErrorService.SocialSpecs,
        operation: 'buildMute',
        context: { muter, mutee, field },
      });
    });
  });

  describe('toDeleteUrls', () => {
    it('names both copies an unmute deletes: the 0.x mute first, then the private v1 one', () => {
      expect(MuteNormalizer.toDeleteUrls({ muter: MUTER, mutee: MUTEE })).toEqual([
        `${listPrefix(MUTER, 'legacy')}mutes/${MUTEE}`,
        buildUri(MUTER, 'mute', MUTEE),
      ]);
    });

    it('strips a prefixed mutee like `to` does', () => {
      expect(MuteNormalizer.toDeleteUrls({ muter: MUTER, mutee: `pk:${MUTEE}` as Pubky })).toEqual(
        MuteNormalizer.toDeleteUrls({ muter: MUTER, mutee: MUTEE }),
      );
    });

    it('refuses a mutee that is no key', () => {
      const error = caught(() => MuteNormalizer.toDeleteUrls({ muter: MUTER, mutee: 'nope' as Pubky }));

      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ code: ValidationErrorCode.INVALID_INPUT, operation: 'muteDeletionPaths' });
    });
  });
});
