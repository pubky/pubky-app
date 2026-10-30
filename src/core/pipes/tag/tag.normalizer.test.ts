import { buildTag, buildUri, decodeObject, limits, parseUri } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { describe, expect, it } from 'vitest';
import { TagKind } from '@/application/tag/tag.types';
import type { TTagEventParams } from '@/controllers/tag/tag.types';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import { TagNormalizer } from '@/pipes/tag/tag.normalizer';
import { withFrozenSpecClock } from '@/test-utils/spec-clock';
import { asInvalid } from '@/test-utils/type-assertions';

const TAGGER = fakeOwner(1);
const AUTHOR = fakeOwner(2);
const POST_ID = '0032PARTQP4G0';
const POST_REF = buildUri(AUTHOR, 'post', POST_ID);

const caught = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
};

const expectValidationError = (error: unknown, operation: string) => {
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({
    category: ErrorCategory.Validation,
    code: ValidationErrorCode.INVALID_INPUT,
    service: ErrorService.SocialSpecs,
    operation,
  });
};

describe('TagNormalizer', () => {
  withFrozenSpecClock();

  describe('to', () => {
    it('builds the tag where pubky-social-specs stores it: a hash id under the tagger public tags', () => {
      const built = TagNormalizer.to(POST_REF, 'technology', TAGGER);

      expect(built.url).toBe(`pubky://${TAGGER}/pub/social/v1/tags/${built.id}.json`);
      expect(parseUri(built.url)).toMatchObject({ owner: TAGGER, root: 'public', kind: 'tag', id: built.id });
      expect(built.object).toEqual({ uri: POST_REF, label: 'technology', created_at: expect.any(Number) });
    });

    it('returns the bytes to PUT, which decode back to the stored object', () => {
      const built = TagNormalizer.to(POST_REF, 'technology', TAGGER);

      expect(ArrayBuffer.isView(built.body)).toBe(true);
      expect(decodeObject(built.url, built.body, 'tag')).toEqual(built.object);
    });

    it('is the package builder: the same target and label give the same id, another label another id', () => {
      const built = TagNormalizer.to(POST_REF, 'technology', TAGGER);

      expect(built.id).toBe(buildTag(TAGGER, POST_REF, 'technology').id);
      expect(TagNormalizer.to(POST_REF, 'rust', TAGGER).id).not.toBe(built.id);
    });

    it('hashes the folded label, so a differently cased spelling is the same tag', () => {
      expect(TagNormalizer.to(POST_REF, '  TechNology ', TAGGER)).toMatchObject({
        id: TagNormalizer.to(POST_REF, 'technology', TAGGER).id,
        object: { label: 'technology' },
      });
    });

    it.each([
      ['an empty label', '', 'length'],
      ['a blank label', '   ', 'length'],
      ['a label over the limit', 'a'.repeat(limits.tagLabelMaxLength + 1), 'length'],
      ['a label with whitespace inside', 'tech nology', 'format'],
      ['a label with a comma', 'tech,nology', 'format'],
      ['a label with a colon', 'tech:nology', 'format'],
    ])('refuses %s as a validation error carrying the package code', (_case, label, code) => {
      const error = caught(() => TagNormalizer.to(POST_REF, label, TAGGER));

      expectValidationError(error, 'buildTag');
      expect((error as AppError).context).toMatchObject({ uri: POST_REF, label, pubky: TAGGER, code, field: 'label' });
    });

    it('accepts a label at the limit, counted in code points', () => {
      const label = '😀'.repeat(limits.tagLabelMaxLength);

      expect(TagNormalizer.to(POST_REF, label, TAGGER).object.label).toBe(label);
      expectValidationError(
        caught(() => TagNormalizer.to(POST_REF, `${label}😀`, TAGGER)),
        'buildTag',
      );
    });

    it.each([
      ['a tagger that is no key', 'viewer'],
      ['a tagger written as a URL', `pubky://${TAGGER}`],
    ])('refuses %s', (_case, tagger) => {
      const error = caught(() => TagNormalizer.to(POST_REF, 'technology', tagger as Pubky));

      expectValidationError(error, 'buildTag');
      expect((error as AppError).context).toMatchObject({ field: 'owner' });
    });

    it('refuses a target that is a post version instead of the versionless reference', () => {
      const error = caught(() => TagNormalizer.to(`${POST_REF}/0032PARTQP4G0.json`, 'technology', TAGGER));

      expectValidationError(error, 'buildTag');
      expect((error as AppError).context).toMatchObject({ field: 'uri' });
    });

    it('refuses a label of the wrong type as a misuse naming the argument', () => {
      const error = caught(() => TagNormalizer.to(POST_REF, asInvalid<string>(42), TAGGER));

      expectValidationError(error, 'buildTag');
    });
  });

  describe('from', () => {
    const params = (overrides: Partial<TTagEventParams> = {}): TTagEventParams => ({
      taggerId: TAGGER,
      taggedId: buildCompositeId({ pubky: AUTHOR, id: POST_ID }),
      label: 'Bitcoin',
      taggedKind: TagKind.POST,
      ...overrides,
    });

    it('targets a post by its versionless v1 reference, built from the composite id', () => {
      const result = TagNormalizer.from(params());
      const built = buildTag(TAGGER, POST_REF, 'bitcoin');

      expect(result).toEqual({
        taggerId: TAGGER,
        taggedId: `${AUTHOR}:${POST_ID}`,
        label: 'bitcoin',
        taggedKind: TagKind.POST,
        tagUrl: built.url,
        tagBody: built.body,
      });
      expect(decodeObject(result.tagUrl, result.tagBody, 'tag').uri).toBe(POST_REF);
    });

    it('targets a user by the profile URL, the target the migration respells a 0.x user tag to', () => {
      const result = TagNormalizer.from(params({ taggedId: AUTHOR, taggedKind: TagKind.USER }));
      const profileUrl = buildUri(AUTHOR, 'user');

      expect(profileUrl).toBe(`pubky://${AUTHOR}/pub/social/v1/profile.json`);
      expect(decodeObject(result.tagUrl, result.tagBody, 'tag').uri).toBe(profileUrl);
      expect(result).toMatchObject({
        taggedId: AUTHOR,
        taggedKind: TagKind.USER,
        tagUrl: buildTag(TAGGER, profileUrl, 'bitcoin').url,
      });
      expect(result.tagUrl).not.toBe(buildTag(TAGGER, `pubky://${AUTHOR}`, 'bitcoin').url);
    });

    it.each([
      ['  Bitcoin  ', 'bitcoin'],
      ['RUST', 'rust'],
      ['ÄPFEL', 'Äpfel'],
      ['Café', 'café'],
      ['İ', 'İ'],
      ['tag_123', 'tag_123'],
    ])('returns the stored label for %j: trimmed, ASCII letters lowercased, the rest kept', (label, stored) => {
      const result = TagNormalizer.from(params({ label }));

      expect(result.label).toBe(stored);
      expect(decodeObject(result.tagUrl, result.tagBody, 'tag').label).toBe(stored);
    });

    it.each([
      ['a composite id without a post id', AUTHOR],
      ['a composite id with an author that is no key', `author:${POST_ID}`],
      ['a composite id with a post id the data model refuses', `${AUTHOR}:not-a-post-id`],
    ])('refuses %s before building the tag', (_case, taggedId) => {
      const error = caught(() => TagNormalizer.from(params({ taggedId: taggedId as Pubky })));

      expectValidationError(error, 'createTagFromParams');
      expect((error as AppError).context).toMatchObject({ taggedKind: TagKind.POST, taggedId, taggerId: TAGGER });
    });

    it('refuses a tagged user that is no key', () => {
      const error = caught(() =>
        TagNormalizer.from(params({ taggedId: 'someone' as Pubky, taggedKind: TagKind.USER })),
      );

      expectValidationError(error, 'createTagFromParams');
    });

    it('refuses an invalid label with the builder error', () => {
      const error = caught(() => TagNormalizer.from(params({ label: 'two words' })));

      expectValidationError(error, 'buildTag');
      expect((error as AppError).context).toMatchObject({ label: 'two words', code: 'format' });
    });
  });

  describe('toOwnTagUri', () => {
    it.each([
      'pubky://viewer/pub/pubky.app/tags/0033RX1Y4ZTQ0',
      'pubky://viewer/pub/mapky/tags/MAPKY01',
      'pubky://viewer/pub/social/v1/tags/SOCIAL01',
      'pubky://viewer/pub/social/v1/tags/PZ367H48M2YE6VG4YY439CXC6W.json',
    ])('accepts a tag file in the viewer folder: %s', (tagUri) => {
      expect(TagNormalizer.toOwnTagUri(tagUri, 'viewer')).toBe(tagUri);
    });

    it('accepts the address TagNormalizer.from writes', () => {
      const { tagUrl } = TagNormalizer.from({
        taggerId: TAGGER,
        taggedId: buildCompositeId({ pubky: AUTHOR, id: POST_ID }),
        label: 'bitcoin',
        taggedKind: TagKind.POST,
      });

      expect(TagNormalizer.toOwnTagUri(tagUrl, TAGGER)).toBe(tagUrl);
      expect(TagNormalizer.toOwnTagUri(tagUrl, AUTHOR)).toBeUndefined();
    });

    it.each([
      ['missing', undefined],
      ['null', null],
      ['another user', 'pubky://other/pub/pubky.app/tags/TAG01'],
      ['a viewer key prefix', 'pubky://viewerx/pub/pubky.app/tags/TAG01'],
      ['private storage', 'pubky://viewer/priv/pubky.app/tags/TAG01'],
      ['not a tag file', 'pubky://viewer/pub/pubky.app/posts/POST01'],
      ['the tags folder itself', 'pubky://viewer/pub/pubky.app/tags/'],
      ['no app folder', 'pubky://viewer/pub/tags/TAG01'],
      ['a parent segment', 'pubky://viewer/pub/../tags/TAG01'],
      ['a query', 'pubky://viewer/pub/pubky.app/tags/TAG01?x=1'],
      ['a fragment', 'pubky://viewer/pub/pubky.app/tags/TAG01#f'],
      ['an encoded parent segment', 'pubky://viewer/pub/pubky.app/%2e%2e/tags/TAG01'],
      ['an empty segment', 'pubky://viewer/pub/pubky.app//tags/TAG01'],
      ['a backslash', 'pubky://viewer/pub/pubky.app\\tags/TAG01'],
      ['an uppercase scheme', 'PUBKY://viewer/pub/pubky.app/tags/TAG01'],
      ['a tags folder nested in app data', 'pubky://viewer/pub/pubky.app/posts/tags/TAG01'],
      ['an app folder deeper than two segments', 'pubky://viewer/pub/a/b/c/tags/TAG01'],
    ])('rejects %s', (_case, tagUri) => {
      expect(TagNormalizer.toOwnTagUri(tagUri, 'viewer')).toBeUndefined();
    });
  });
});
