import { decodeObject, parseUri } from 'pubky-social-specs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorService } from '@/libs/error/error.types';
import { BookmarkNormalizer } from '@/pipes/bookmark/bookmark.normalizer';
import {
  createPostUri,
  INVALID_INPUTS,
  restoreMocks,
  setupIntegrationTestMocks,
  TEST_POST_IDS,
  TEST_PUBKY,
} from '../pipes.test-utils';

describe('BookmarkNormalizer', () => {
  beforeEach(setupIntegrationTestMocks);
  afterEach(restoreMocks);

  it('builds a private bookmark whose path spells the target', () => {
    const postUri = createPostUri(TEST_PUBKY.USER_2, TEST_POST_IDS.POST_2);
    const result = BookmarkNormalizer.to(postUri, TEST_PUBKY.USER_1);

    expect(result.path.startsWith('/priv/social/v1/bookmarks/')).toBe(true);
    const parsed = parseUri(result.url);
    expect(parsed.kind === 'bookmark' && parsed.target).toBe(postUri);
    expect(decodeObject(result.url, result.body, 'bookmark').created_at).toBe(result.object.created_at);
  });

  it('gives the same path for the same target, so a delete can rebuild it', () => {
    const postUri = createPostUri();
    expect(BookmarkNormalizer.to(postUri, TEST_PUBKY.USER_1).url).toBe(
      BookmarkNormalizer.to(postUri, TEST_PUBKY.USER_1).url,
    );
  });

  it.each([
    ['an empty owner', INVALID_INPUTS.EMPTY],
    ['a malformed owner', INVALID_INPUTS.INVALID_FORMAT],
  ])('throws a validation AppError for %s', (_, owner) => {
    let caught: unknown;
    try {
      BookmarkNormalizer.to(createPostUri(), owner);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).code).toBe(ValidationErrorCode.INVALID_INPUT);
    expect((caught as AppError).service).toBe(ErrorService.PubkyAppSpecs);
  });
});
