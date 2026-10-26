import { buildUri, decodeObject } from 'pubky-social-specs';
import { describe, expect, it } from 'vitest';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import type { UserValidatorData } from '@/pipes/pipes.types';
import { UserNormalizer } from '@/pipes/user/user.normalizer';
import { TEST_PUBKY } from '../pipes.test-utils';

describe('UserNormalizer', () => {
  const createUserData = (overrides?: Partial<UserValidatorData>): UserValidatorData => ({
    name: 'Test User',
    bio: 'A test bio',
    image: 'https://example.com/avatar.png',
    links: [{ title: 'Website', url: 'https://example.com' }],
    status: 'Available',
    ...overrides,
  });

  const expectValidationError = (run: () => unknown) => {
    let caught: unknown;
    try {
      run();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).code).toBe(ValidationErrorCode.INVALID_INPUT);
    expect((caught as AppError).service).toBe(ErrorService.PubkyAppSpecs);
  };

  describe('to', () => {
    it('builds the v1 profile with every field', () => {
      const result = UserNormalizer.to(createUserData(), TEST_PUBKY.USER_1);

      expect(result.url).toBe(buildUri(TEST_PUBKY.USER_1, 'user'));
      expect(decodeObject(result.url, result.body, 'user')).toEqual({
        name: 'Test User',
        bio: 'A test bio',
        image: 'https://example.com/avatar.png',
        links: [{ title: 'Website', url: 'https://example.com' }],
        status: 'Available',
      });
    });

    it('stores blank optional fields as absent', () => {
      const result = UserNormalizer.to(
        createUserData({ bio: '', image: null, links: [], status: '' }),
        TEST_PUBKY.USER_1,
      );
      expect(result.object).toEqual({ name: 'Test User', bio: null, image: null, links: null, status: null });
    });

    it.each([
      ['a name under 3 code points', { name: 'Al' }],
      ['a name over 50 code points', { name: 'a'.repeat(51) }],
      ['a bio over 160 code points', { bio: 'a'.repeat(161) }],
      ['a status over 50 code points', { status: 'a'.repeat(51) }],
      [
        'more than 5 links',
        { links: Array.from({ length: 6 }, (_, i) => ({ title: `L${i}`, url: `https://e.com/${i}` })) },
      ],
      ['a link that is no web URL', { links: [{ title: 'Bad', url: 'not a url' }] }],
    ])('refuses %s', (_, overrides) => {
      expectValidationError(() => UserNormalizer.to(createUserData(overrides), TEST_PUBKY.USER_1));
    });

    it('refuses a malformed owner', () => {
      expectValidationError(() => UserNormalizer.to(createUserData(), 'not-a-key'));
    });
  });

  describe('applyChanges', () => {
    const stored = UserNormalizer.to(createUserData(), TEST_PUBKY.USER_1).object;

    it('keeps the members another client added', () => {
      const withUnknown = { ...stored, $unknown: '{"pronouns":"they"}' };
      expect(UserNormalizer.applyChanges(withUnknown, { status: 'away' })).toEqual({ ...withUnknown, status: 'away' });
    });

    it('trims display text and clears a blank member', () => {
      expect(UserNormalizer.applyChanges(stored, { name: ' New ', bio: '   ', status: '' })).toMatchObject({
        name: 'New',
        bio: null,
        status: null,
      });
    });

    it('replaces the link list, and an empty list clears it', () => {
      expect(UserNormalizer.applyChanges(stored, { links: [] }).links).toBeNull();
      expect(UserNormalizer.applyChanges(stored, { links: [{ title: 'Git', url: 'https://g.com' }] }).links).toEqual([
        { title: 'Git', url: 'https://g.com' },
      ]);
    });
  });

  describe('fromPublished', () => {
    it('reads a published profile and fills in absent optional fields', () => {
      const published = { name: 'Test User', links: [{ title: 'WEBSITE', url: 'https://example.com/' }], extra: 1 };

      expect(UserNormalizer.fromPublished(published)).toEqual({
        name: 'Test User',
        bio: '',
        image: null,
        links: [{ title: 'WEBSITE', url: 'https://example.com/' }],
        status: null,
      });
    });

    it('keeps every published value', () => {
      const image = `pubky://${TEST_PUBKY.USER_1}/pub/pubky.app/files/0035S78QPP4S0`;
      const published = { name: 'Test User', bio: 'Bio', image, links: null, status: '🪚building' };

      expect(UserNormalizer.fromPublished(published)).toEqual({
        name: 'Test User',
        bio: 'Bio',
        image,
        links: [],
        status: '🪚building',
      });
    });

    it('throws a validation AppError for an empty or invalid body', () => {
      for (const body of [undefined, { bio: 'no name' }]) {
        try {
          UserNormalizer.fromPublished(body);
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          expect(appError.category).toBe(ErrorCategory.Validation);
          expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
          expect(appError.service).toBe(ErrorService.PubkyAppSpecs);
          expect(appError.operation).toBe('fromPublished');
        }
      }
    });
  });

  describe('merge', () => {
    const published = {
      name: 'Published Name',
      bio: 'Published bio',
      image: `pubky://${TEST_PUBKY.USER_1}/pub/social/v1/files/AKSZ57W2RFKHV1EHK007FQQ8TW.png`,
      links: [{ title: 'WEBSITE', url: 'https://example.com/' }],
      status: 'working',
    };

    it('keeps every published field the changes leave out', () => {
      expect(UserNormalizer.merge(published, { status: '🪚building' })).toEqual({ ...published, status: '🪚building' });
    });

    it('applies explicit clears', () => {
      expect(UserNormalizer.merge(published, { bio: '', image: null, links: [], status: '' })).toEqual({
        name: 'Published Name',
        bio: '',
        image: null,
        links: [],
        status: '',
      });
    });

    it('replaces the whole link list when links change', () => {
      const links = [{ title: 'GITHUB', url: 'https://github.com/example' }];

      expect(UserNormalizer.merge(published, { name: 'New Name', links })).toEqual({
        ...published,
        name: 'New Name',
        links,
      });
    });
  });
});
