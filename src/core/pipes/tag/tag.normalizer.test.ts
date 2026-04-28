import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TagResult, postUriBuilder } from 'pubky-app-specs';
import { asInvalid, asOpaque } from '@/test-utils';
import {
  TEST_PUBKY,
  TEST_POST_IDS,
  setupUnitTestMocks,
  setupIntegrationTestMocks,
  restoreMocks,
  buildPubkyUri,
} from '../pipes.test-utils';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import * as parseCompositeIdModule from '@/models/models.utils';
import { TagKind } from '@/application/tag/tag.types';
import type { TTagEventParams } from '@/controllers/tag/tag.types';
import { parseCompositeId } from '@/models/models.utils';
import { PubkySpecsSingleton } from '@/pipes/pipes.builder';
import { TagNormalizer } from '@/pipes/tag/tag.normalizer';
describe('TagNormalizer', () => {
  const createMockBuilder = (overrides?: Partial<{ createTag: ReturnType<typeof vi.fn> }>) => ({
    createTag: vi.fn((uri: string, label: string) =>
      asOpaque<TagResult>({
        tag: { label, toJson: vi.fn(() => ({ uri, label })) },
        meta: { url: buildPubkyUri(TEST_PUBKY.USER_1, `tags/${encodeURIComponent(label)}`) },
      }),
    ),
    ...overrides,
  });

  /**
   * Tests for `to` method - Creates TagResult directly
   */
  describe('to', () => {
    describe('Unit Tests', () => {
      let mockBuilder: ReturnType<typeof createMockBuilder>;

      beforeEach(() => {
        mockBuilder = createMockBuilder();
        setupUnitTestMocks(mockBuilder);
      });

      afterEach(restoreMocks);

      describe('successful creation', () => {
        it('should create tag with tag and meta properties', () => {
          const uri = buildPubkyUri(TEST_PUBKY.USER_2, `posts/${TEST_POST_IDS.POST_1}`);
          const result = TagNormalizer.to(uri, 'technology', TEST_PUBKY.USER_1);

          expect(result).toHaveProperty('tag');
          expect(result).toHaveProperty('meta');
        });

        it('should call PubkySpecsSingleton.get with pubky and createTag with uri/label', () => {
          const uri = buildPubkyUri(TEST_PUBKY.USER_2, `posts/${TEST_POST_IDS.POST_1}`);
          TagNormalizer.to(uri, 'tech', TEST_PUBKY.USER_1);

          expect(PubkySpecsSingleton.get).toHaveBeenCalledWith(TEST_PUBKY.USER_1);
          expect(mockBuilder.createTag).toHaveBeenCalledWith(uri, 'tech');
        });

        it('should return correct structure with tag and meta URL', () => {
          const uri = buildPubkyUri(TEST_PUBKY.USER_2, `posts/${TEST_POST_IDS.POST_1}`);
          const result = TagNormalizer.to(uri, 'label', TEST_PUBKY.USER_1);

          expect(result.tag).toHaveProperty('toJson');
          expect(result.meta.url).toContain('pubky://');
          expect(result.meta.url).toContain('/pub/pubky.app/tags/');
        });
      });

      describe('different inputs', () => {
        it.each([['technology'], ['Developer'], ['tech-tag'], ['tag_123']])('should handle label "%s"', (label) => {
          const uri = buildPubkyUri(TEST_PUBKY.USER_2, 'posts/123');
          TagNormalizer.to(uri, label, TEST_PUBKY.USER_1);

          expect(mockBuilder.createTag).toHaveBeenCalledWith(uri, label);
        });

        it.each([
          ['USER_1', TEST_PUBKY.USER_1],
          ['USER_2', TEST_PUBKY.USER_2],
        ])('should handle pubky: %s', (_, pubky) => {
          const uri = buildPubkyUri(TEST_PUBKY.USER_2, 'posts/123');
          TagNormalizer.to(uri, 'label', pubky);

          expect(PubkySpecsSingleton.get).toHaveBeenCalledWith(pubky);
        });
      });

      describe('error handling', () => {
        it('should throw AppError with correct properties when createTag fails', () => {
          const errorMessage = 'Invalid tag';
          mockBuilder.createTag.mockImplementation(() => {
            throw errorMessage;
          });
          const uri = 'pubky://test/uri';
          const label = 'testlabel';

          try {
            TagNormalizer.to(uri, label, TEST_PUBKY.USER_1);
            expect.fail('Should have thrown');
          } catch (error) {
            expect(error).toBeInstanceOf(AppError);
            const appError = error as AppError;
            expect(appError.category).toBe(ErrorCategory.Validation);
            expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
            expect(appError.service).toBe(ErrorService.PubkyAppSpecs);
            expect(appError.operation).toBe('createTag');
            expect(appError.context).toEqual({ uri, label, pubky: TEST_PUBKY.USER_1 });
            expect(appError.message).toBe(errorMessage);
          }
        });

        it('should throw AppError when PubkySpecsSingleton.get fails', () => {
          vi.spyOn(PubkySpecsSingleton, 'get').mockImplementation(() => {
            throw 'Singleton error';
          });

          expect(() => TagNormalizer.to('uri', 'label', TEST_PUBKY.USER_1)).toThrow(AppError);
        });
      });
    });

    describe('Integration Tests', () => {
      beforeEach(setupIntegrationTestMocks);
      afterEach(restoreMocks);

      describe('successful creation with real library', () => {
        it('should create valid result with correct URL format', () => {
          const uri = postUriBuilder(TEST_PUBKY.USER_2, TEST_POST_IDS.POST_1);
          const result = TagNormalizer.to(uri, 'technology', TEST_PUBKY.USER_1);

          expect(result.tag).toBeDefined();
          expect(result.meta.url).toMatch(/^pubky:\/\/.+\/pub\/pubky\.app\/tags\/.+/);
        });

        it('should store label in tag', () => {
          const uri = postUriBuilder(TEST_PUBKY.USER_2, TEST_POST_IDS.POST_1);
          const result = TagNormalizer.to(uri, 'developer', TEST_PUBKY.USER_1);

          expect(result.tag.label).toBe('developer');
        });

        it('should create unique URLs for different labels', () => {
          const uri = postUriBuilder(TEST_PUBKY.USER_2, TEST_POST_IDS.POST_1);
          const result1 = TagNormalizer.to(uri, 'tech', TEST_PUBKY.USER_1);
          const result2 = TagNormalizer.to(uri, 'news', TEST_PUBKY.USER_1);

          expect(result1.meta.url).not.toBe(result2.meta.url);
        });

        it('should produce valid JSON from tag object', () => {
          const uri = postUriBuilder(TEST_PUBKY.USER_2, TEST_POST_IDS.POST_1);
          const result = TagNormalizer.to(uri, 'label', TEST_PUBKY.USER_1);

          expect(typeof result.tag.toJson).toBe('function');
          const tagJson = result.tag.toJson();
          expect(tagJson).toHaveProperty('uri', uri);
          expect(tagJson).toHaveProperty('label', 'label');
        });
      });

      describe('validation with real library', () => {
        it('should throw AppError for empty label', () => {
          const uri = postUriBuilder(TEST_PUBKY.USER_2, TEST_POST_IDS.POST_1);

          try {
            TagNormalizer.to(uri, '', TEST_PUBKY.USER_1);
            expect.fail('Should have thrown');
          } catch (error) {
            expect(error).toBeInstanceOf(AppError);
            const appError = error as AppError;
            expect(appError.category).toBe(ErrorCategory.Validation);
            expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
            expect(appError.service).toBe(ErrorService.PubkyAppSpecs);
            expect(appError.operation).toBe('createTag');
          }
        });

        it('should throw AppError for null label', () => {
          const uri = postUriBuilder(TEST_PUBKY.USER_2, TEST_POST_IDS.POST_1);

          expect(() => TagNormalizer.to(uri, asInvalid<string>(null), TEST_PUBKY.USER_1)).toThrow(AppError);
        });
      });

      describe('label length limits', () => {
        const uri = postUriBuilder(TEST_PUBKY.USER_2, TEST_POST_IDS.POST_1);

        it('should accept label at maximum length (20 characters)', () => {
          const maxLengthLabel = 'A'.repeat(20);
          const result = TagNormalizer.to(uri, maxLengthLabel, TEST_PUBKY.USER_1);

          expect(result).toBeDefined();
          // Library converts labels to lowercase
          expect(result.tag.label).toBe(maxLengthLabel.toLowerCase());
        });

        it('should throw AppError for label exceeding maximum length', () => {
          const tooLongLabel = 'A'.repeat(21);
          expect(() => TagNormalizer.to(uri, tooLongLabel, TEST_PUBKY.USER_1)).toThrow(AppError);
        });

        it('should throw AppError for label with emojis exceeding maximum length', () => {
          const tooLongEmojiLabel = '🎉'.repeat(21);
          expect(() => TagNormalizer.to(uri, tooLongEmojiLabel, TEST_PUBKY.USER_1)).toThrow(AppError);
        });

        it('should accept mixed label at maximum length', () => {
          const mixedLabel = 'A'.repeat(15) + '🎉'.repeat(5);
          const result = TagNormalizer.to(uri, mixedLabel, TEST_PUBKY.USER_1);

          expect(result).toBeDefined();
          expect(result.tag.label).toBe('a'.repeat(15) + '🎉'.repeat(5));
        });

        it('should throw AppError for mixed label exceeding maximum length', () => {
          const tooLongMixedLabel = 'A'.repeat(16) + '🎉'.repeat(5);
          expect(() => TagNormalizer.to(uri, tooLongMixedLabel, TEST_PUBKY.USER_1)).toThrow(AppError);
        });
      });

      describe('special characters in labels', () => {
        const uri = postUriBuilder(TEST_PUBKY.USER_2, TEST_POST_IDS.POST_1);

        /**
         * Characters that are ACCEPTED by the library
         */
        it.each([
          ['hyphen', 'tag-value'],
          ['underscore', 'tag_value'],
          ['period', 'tag.value'],
          ['at symbol', 'tag@value'],
          ['hash', 'tag#value'],
          ['ampersand', 'tag&value'],
          ['equals', 'tag=value'],
          ['plus', 'tag+value'],
        ])('should accept label with %s: "%s"', (_, label) => {
          const result = TagNormalizer.to(uri, label, TEST_PUBKY.USER_1);

          expect(result).toBeDefined();
          expect(result.tag.label).toBe(label);
        });

        /**
         * Characters that are REJECTED by the library.
         * Note: `:` and `,` have semantic meaning in the pubky protocol
         * - `:` is used in composite IDs (author:postId)
         * - `,` might be used to separate multiple tags
         */
        it.each([
          ['colon', 'tag:value'],
          ['comma', 'tag,value'],
        ])('should reject label with %s: "%s"', (_, label) => {
          expect(() => TagNormalizer.to(uri, label, TEST_PUBKY.USER_1)).toThrow(AppError);
        });
      });
    });
  });

  /**
   * Tests for `from` method - High-level tag creation with normalization
   */
  describe('from', () => {
    describe('Unit Tests', () => {
      let mockBuilder: ReturnType<typeof createMockBuilder>;
      const compositePostId = `${TEST_PUBKY.USER_2}:${TEST_POST_IDS.POST_1}`;

      beforeEach(() => {
        mockBuilder = createMockBuilder();
        setupUnitTestMocks(mockBuilder);
      });

      afterEach(restoreMocks);

      describe('POST tag creation', () => {
        it('should parse composite ID and build post URI', () => {
          vi.spyOn(parseCompositeIdModule, 'parseCompositeId').mockReturnValue({
            pubky: TEST_PUBKY.USER_2,
            id: TEST_POST_IDS.POST_1,
          });

          const params: TTagEventParams = {
            taggerId: TEST_PUBKY.USER_1,
            taggedId: compositePostId,
            label: 'Technology',
            taggedKind: TagKind.POST,
          };

          TagNormalizer.from(params);

          expect(parseCompositeId).toHaveBeenCalledWith(compositePostId);
          expect(mockBuilder.createTag).toHaveBeenCalledWith(
            expect.stringContaining(`pubky://${TEST_PUBKY.USER_2}/pub/pubky.app/posts/${TEST_POST_IDS.POST_1}`),
            'Technology',
          );
        });

        it('should return normalized response with lowercase label', () => {
          vi.spyOn(parseCompositeIdModule, 'parseCompositeId').mockReturnValue({
            pubky: TEST_PUBKY.USER_2,
            id: TEST_POST_IDS.POST_1,
          });

          const params: TTagEventParams = {
            taggerId: TEST_PUBKY.USER_1,
            taggedId: compositePostId,
            label: '  TECHNOLOGY  ',
            taggedKind: TagKind.POST,
          };

          const result = TagNormalizer.from(params);

          expect(result.label).toBe('technology'); // Trimmed and lowercase
          expect(result.taggerId).toBe(TEST_PUBKY.USER_1);
          expect(result.taggedId).toBe(compositePostId);
          expect(result.taggedKind).toBe(TagKind.POST);
          expect(result.tagUrl).toContain('pubky://');
          expect(result.tagJson).toBeDefined();
        });
      });

      describe('USER tag creation', () => {
        it('should build user URI directly without parsing', () => {
          const params: TTagEventParams = {
            taggerId: TEST_PUBKY.USER_1,
            taggedId: TEST_PUBKY.USER_2,
            label: 'Developer',
            taggedKind: TagKind.USER,
          };

          TagNormalizer.from(params);

          expect(mockBuilder.createTag).toHaveBeenCalledWith(
            expect.stringContaining(`pubky://${TEST_PUBKY.USER_2}`),
            'Developer',
          );
        });

        it('should return normalized response with lowercase label', () => {
          const params: TTagEventParams = {
            taggerId: TEST_PUBKY.USER_1,
            taggedId: TEST_PUBKY.USER_2,
            label: '  DEVELOPER  ',
            taggedKind: TagKind.USER,
          };

          const result = TagNormalizer.from(params);

          expect(result.label).toBe('developer');
          expect(result.taggedKind).toBe(TagKind.USER);
        });
      });

      describe('error handling', () => {
        it('should throw AppError with correct properties when parseCompositeId fails', () => {
          vi.spyOn(parseCompositeIdModule, 'parseCompositeId').mockImplementation(() => {
            throw 'Invalid composite ID';
          });

          const params: TTagEventParams = {
            taggerId: TEST_PUBKY.USER_1,
            taggedId: 'invalid',
            label: 'test',
            taggedKind: TagKind.POST,
          };

          try {
            TagNormalizer.from(params);
            expect.fail('Should have thrown');
          } catch (error) {
            expect(error).toBeInstanceOf(AppError);
            const appError = error as AppError;
            expect(appError.category).toBe(ErrorCategory.Validation);
            expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
            expect(appError.service).toBe(ErrorService.PubkyAppSpecs);
            expect(appError.operation).toBe('createTagFromParams');
            expect(appError.context).toEqual(params);
          }
        });

        it('should throw AppError when createTag fails', () => {
          vi.spyOn(parseCompositeIdModule, 'parseCompositeId').mockReturnValue({
            pubky: TEST_PUBKY.USER_2,
            id: TEST_POST_IDS.POST_1,
          });
          mockBuilder.createTag.mockImplementation(() => {
            throw 'Builder error';
          });

          const params: TTagEventParams = {
            taggerId: TEST_PUBKY.USER_1,
            taggedId: compositePostId,
            label: 'test',
            taggedKind: TagKind.POST,
          };

          expect(() => TagNormalizer.from(params)).toThrow(AppError);
        });
      });
    });

    describe('Integration Tests', () => {
      beforeEach(setupIntegrationTestMocks);
      afterEach(restoreMocks);

      describe('POST tag with real library', () => {
        it('should create valid POST tag', () => {
          const compositeId = `${TEST_PUBKY.USER_2}:${TEST_POST_IDS.POST_1}`;

          const params: TTagEventParams = {
            taggerId: TEST_PUBKY.USER_1,
            taggedId: compositeId,
            label: 'technology',
            taggedKind: TagKind.POST,
          };

          const result = TagNormalizer.from(params);

          expect(result.tagUrl).toMatch(/^pubky:\/\/.+\/pub\/pubky\.app\/tags\/.+/);
          expect(result.label).toBe('technology');
          expect(result.tagJson).toBeDefined();
        });
      });

      describe('USER tag with real library', () => {
        it('should create valid USER tag', () => {
          const params: TTagEventParams = {
            taggerId: TEST_PUBKY.USER_1,
            taggedId: TEST_PUBKY.USER_2,
            label: 'developer',
            taggedKind: TagKind.USER,
          };

          const result = TagNormalizer.from(params);

          expect(result.tagUrl).toMatch(/^pubky:\/\/.+\/pub\/pubky\.app\/tags\/.+/);
          expect(result.label).toBe('developer');
        });
      });

      describe('label normalization', () => {
        it.each([
          ['  spaces  ', 'spaces'],
          ['UPPERCASE', 'uppercase'],
          ['  MixedCASE  ', 'mixedcase'],
        ])('should normalize "%s" to "%s"', (input, expected) => {
          const params: TTagEventParams = {
            taggerId: TEST_PUBKY.USER_1,
            taggedId: TEST_PUBKY.USER_2,
            label: input,
            taggedKind: TagKind.USER,
          };

          const result = TagNormalizer.from(params);

          expect(result.label).toBe(expected);
        });

        /**
         * Note: The pubky-app-specs library rejects labels with internal whitespace.
         */
        it('should throw AppError for label with internal whitespace', () => {
          const params: TTagEventParams = {
            taggerId: TEST_PUBKY.USER_1,
            taggedId: TEST_PUBKY.USER_2,
            label: 'mixed case',
            taggedKind: TagKind.USER,
          };

          expect(() => TagNormalizer.from(params)).toThrow(AppError);
        });
      });
    });
  });
});
