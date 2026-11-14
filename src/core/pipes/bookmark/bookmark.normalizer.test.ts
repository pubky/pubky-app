import { buildBookmark, buildUri, decodeObject, listPrefix, parseUri } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorService } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import { BookmarkNormalizer } from '@/pipes/bookmark/bookmark.normalizer';
import { freezeSpecClock, restoreSpecClock } from '@/test-utils/spec-clock';

const owner = fakeOwner(1) as Pubky;
const author = fakeOwner(2) as Pubky;
const POST_ID = '0035V9A20WSE4';
const post = { pubky: author, id: POST_ID };
const compositeId = buildCompositeId(post);
const NOW_MS = 1_793_412_449_822;

/** The error a call throws, for assertions on its fields. */
const caught = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
};

describe('BookmarkNormalizer', () => {
  beforeEach(() => freezeSpecClock(NOW_MS));
  afterEach(restoreSpecClock);

  describe('to', () => {
    it('builds a private bookmark whose path spells the versionless v1 post reference', () => {
      const result = BookmarkNormalizer.to(post, owner);

      expect(result.path.startsWith('/priv/social/v1/bookmarks/')).toBe(true);
      expect(result.url.startsWith(`${listPrefix(owner, 'private')}bookmarks/`)).toBe(true);
      const parsed = parseUri(result.url);
      expect(parsed.kind === 'bookmark' && parsed.target).toBe(buildUri(author, 'post', POST_ID));
      expect(decodeObject(result.url, result.body, 'bookmark')).toEqual({ created_at: NOW_MS * 1000, target: null });
    });

    it('gives the same path for the same post, so a delete can rebuild it', () => {
      expect(BookmarkNormalizer.to(post, owner).url).toBe(BookmarkNormalizer.to(post, owner).url);
      expect(BookmarkNormalizer.to(post, owner).url).not.toBe(
        BookmarkNormalizer.to({ pubky: author, id: '0035V9A20WSE0' }, owner).url,
      );
    });

    it.each([
      ['a malformed owner', { pubky: author, id: POST_ID }, 'not-a-key' as Pubky],
      ['a malformed author', { pubky: 'not-a-key' as Pubky, id: POST_ID }, owner],
      ['a malformed post id', { pubky: author, id: 'abc' }, owner],
    ])('throws a validation AppError for %s', (_, target, bookmarker) => {
      const error = caught(() => BookmarkNormalizer.to(target, bookmarker));

      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ValidationErrorCode.INVALID_INPUT);
      expect((error as AppError).service).toBe(ErrorService.SocialSpecs);
      expect((error as AppError).operation).toBe('buildBookmark');
    });
  });

  describe('fromListing', () => {
    it('reads the bookmarked post from a primary filename', () => {
      const { url } = BookmarkNormalizer.to(post, owner);

      expect(BookmarkNormalizer.fromListing(url)).toEqual({ url, postId: compositeId });
    });

    it('names no post for the overflow form, whose target only the stored object holds', () => {
      const { url } = buildBookmark(owner, `https://example.com/${'a'.repeat(300)}`);

      expect(url).toContain('/bookmarks/~');
      expect(BookmarkNormalizer.fromListing(url)).toEqual({ url, postId: null });
    });

    it.each([
      ['a web page', () => buildBookmark(owner, 'https://example.com/a').url],
      ['a profile', () => buildBookmark(owner, buildUri(author, 'user')).url],
      ['a 0.x post reference', () => buildBookmark(owner, `${listPrefix(author, 'legacy')}posts/${POST_ID}`).url],
      ['another kind of file', () => buildUri(owner, 'mute', author)],
      ['a filename that decodes to nothing', () => `${listPrefix(owner, 'private')}bookmarks/not-base64!.json`],
      ['a string that is no pubky URI', () => 'https://example.com/bookmarks/a.json'],
    ])('skips a file that bookmarks %s', (_, url) => {
      expect(BookmarkNormalizer.fromListing(url())).toBeNull();
    });
  });

  describe('fromStored', () => {
    it('reads the post and the bookmark time in milliseconds', () => {
      const { url, body } = BookmarkNormalizer.to(post, owner);

      expect(BookmarkNormalizer.fromStored(url, body)).toEqual({ postId: compositeId, createdAt: NOW_MS });
    });

    it('reads the target of the overflow form from the stored object', () => {
      const { url, body } = buildBookmark(owner, `https://example.com/${'a'.repeat(300)}`);

      expect(BookmarkNormalizer.fromStored(url, body)).toEqual({ postId: null, createdAt: NOW_MS });
    });

    it('throws a validation AppError for bytes the data model refuses', () => {
      const { url } = BookmarkNormalizer.to(post, owner);
      const error = caught(() => BookmarkNormalizer.fromStored(url, new TextEncoder().encode('{"nope":true}')));

      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ValidationErrorCode.INVALID_INPUT);
      expect((error as AppError).operation).toBe('decodeBookmark');
    });
  });
});
