import { buildUri, decodeObject } from 'pubky-social-specs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TagKind } from '@/application/tag/tag.types';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { buildCompositeId } from '@/models/models.utils';
import { TagNormalizer } from '@/pipes/tag/tag.normalizer';
import { createPostUri, restoreMocks, setupIntegrationTestMocks, TEST_POST_IDS, TEST_PUBKY } from '../pipes.test-utils';

const expectValidationError = (run: () => unknown) => {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AppError);
  expect((caught as AppError).code).toBe(ValidationErrorCode.INVALID_INPUT);
};

describe('TagNormalizer', () => {
  beforeEach(setupIntegrationTestMocks);
  afterEach(restoreMocks);

  describe('to', () => {
    it('builds a public tag that decodes back', () => {
      const result = TagNormalizer.to(createPostUri(), 'rust', TEST_PUBKY.USER_1);

      expect(result.path.startsWith('/pub/social/v1/tags/')).toBe(true);
      expect(decodeObject(result.url, result.body, 'tag')).toEqual(result.object);
      expect(result.object.uri).toBe(createPostUri());
    });

    it('trims and lowercases the label, so one label has one path', () => {
      const lower = TagNormalizer.to(createPostUri(), 'rust', TEST_PUBKY.USER_1);
      const mixed = TagNormalizer.to(createPostUri(), '  RuSt ', TEST_PUBKY.USER_1);
      expect(mixed.object.label).toBe('rust');
      expect(mixed.url).toBe(lower.url);
    });

    it.each(['', 'a'.repeat(21), 'two words', 'a,b', 'a:b'])('refuses the label %j', (label) => {
      expectValidationError(() => TagNormalizer.to(createPostUri(), label, TEST_PUBKY.USER_1));
    });

    it('refuses the url of one post version as a target', () => {
      const version = `pubky://${TEST_PUBKY.USER_2}/pub/social/v1/posts/${TEST_POST_IDS.POST_1}/${TEST_POST_IDS.POST_1}.json`;
      expectValidationError(() => TagNormalizer.to(version, 'rust', TEST_PUBKY.USER_1));
    });
  });

  describe('from', () => {
    it('targets the versionless reference of a post', () => {
      const taggedId = buildCompositeId({ pubky: TEST_PUBKY.USER_2, id: TEST_POST_IDS.POST_2 });
      const result = TagNormalizer.from({
        taggedKind: TagKind.POST,
        taggedId,
        label: 'Cool',
        taggerId: TEST_PUBKY.USER_1,
      });

      expect(result).toMatchObject({ taggerId: TEST_PUBKY.USER_1, taggedId, label: 'cool', taggedKind: TagKind.POST });
      expect(decodeObject(result.tagUrl, result.tagBody, 'tag').uri).toBe(
        buildUri(TEST_PUBKY.USER_2, 'post', TEST_POST_IDS.POST_2),
      );
    });

    it('targets the profile of a user', () => {
      const result = TagNormalizer.from({
        taggedKind: TagKind.USER,
        taggedId: TEST_PUBKY.USER_2,
        label: 'friend',
        taggerId: TEST_PUBKY.USER_1,
      });

      expect(decodeObject(result.tagUrl, result.tagBody, 'tag').uri).toBe(buildUri(TEST_PUBKY.USER_2, 'user'));
    });

    it('refuses a malformed composite post id', () => {
      expectValidationError(() =>
        TagNormalizer.from({
          taggedKind: TagKind.POST,
          taggedId: 'no-delimiter',
          label: 'x',
          taggerId: TEST_PUBKY.USER_1,
        }),
      );
    });
  });
});
