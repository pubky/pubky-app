import { BookmarkResult, postUriBuilder } from 'pubky-app-specs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import { BookmarkNormalizer } from '@/pipes/bookmark/bookmark.normalizer';
import { PubkySpecsSingleton } from '@/pipes/pipes.builder';
import { asOpaque } from '@/test-utils/type-assertions';
import {
  buildPubkyUri,
  createPostUri,
  INVALID_INPUTS,
  restoreMocks,
  setupIntegrationTestMocks,
  setupUnitTestMocks,
  TEST_POST_IDS,
  TEST_PUBKY,
} from '../pipes.test-utils';

describe('BookmarkNormalizer', () => {
  const createMockBuilder = (overrides?: Partial<{ createBookmark: ReturnType<typeof vi.fn> }>) => ({
    createBookmark: vi.fn((uri: string) =>
      asOpaque<BookmarkResult>({
        bookmark: { uri, toJson: vi.fn(() => ({ uri })) },
        meta: { url: buildPubkyUri(TEST_PUBKY.USER_1, `bookmarks/${Date.now()}`) },
      }),
    ),
    ...overrides,
  });

  /**
   * Unit Tests
   */
  describe('Unit Tests', () => {
    let mockBuilder: ReturnType<typeof createMockBuilder>;

    beforeEach(() => {
      mockBuilder = createMockBuilder();
      setupUnitTestMocks(mockBuilder);
    });

    afterEach(restoreMocks);

    describe('to - successful creation', () => {
      it('should create bookmark and log debug message', () => {
        const postUri = createPostUri();
        const result = BookmarkNormalizer.to(postUri, TEST_PUBKY.USER_1);

        expect(result).toHaveProperty('bookmark');
        expect(result).toHaveProperty('meta');
        expect(Logger.debug).toHaveBeenCalledWith('Bookmark validated', { result });
      });

      it('should call PubkySpecsSingleton.get with userId and createBookmark with postUri', () => {
        const postUri = createPostUri();
        BookmarkNormalizer.to(postUri, TEST_PUBKY.USER_1);

        expect(PubkySpecsSingleton.get).toHaveBeenCalledWith(TEST_PUBKY.USER_1);
        expect(mockBuilder.createBookmark).toHaveBeenCalledWith(postUri);
      });

      it('should return correct structure with bookmark and meta URL', () => {
        const postUri = createPostUri();
        const result = BookmarkNormalizer.to(postUri, TEST_PUBKY.USER_1);

        expect(result.bookmark).toHaveProperty('toJson');
        expect(result.bookmark.toJson().uri).toBe(postUri);
        expect(result.meta.url).toContain('pubky://');
        expect(result.meta.url).toContain('/pub/pubky.app/bookmarks/');
      });
    });

    describe('to - different inputs', () => {
      it.each([
        ['author 1, post 1', TEST_PUBKY.USER_1, TEST_POST_IDS.POST_1],
        ['author 2, post 2', TEST_PUBKY.USER_2, TEST_POST_IDS.POST_2],
        ['author 1, post 3', TEST_PUBKY.USER_1, TEST_POST_IDS.POST_3],
      ])('should handle %s', (_, author, postId) => {
        const uri = createPostUri(author, postId);
        BookmarkNormalizer.to(uri, TEST_PUBKY.USER_1);
        expect(mockBuilder.createBookmark).toHaveBeenCalledWith(uri);
      });

      it.each([
        ['USER_1', TEST_PUBKY.USER_1],
        ['USER_2', TEST_PUBKY.USER_2],
      ])('should handle different userId: %s', (_, userId) => {
        BookmarkNormalizer.to(createPostUri(), userId);
        expect(PubkySpecsSingleton.get).toHaveBeenCalledWith(userId);
      });
    });

    describe('to - error handling', () => {
      it('should throw AppError with correct properties when createBookmark fails', () => {
        const errorMessage = 'Invalid bookmark URI';
        mockBuilder.createBookmark.mockImplementation(() => {
          throw errorMessage;
        });
        const postUri = createPostUri();

        try {
          BookmarkNormalizer.to(postUri, TEST_PUBKY.USER_1);
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          expect(appError.category).toBe(ErrorCategory.Validation);
          expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
          expect(appError.service).toBe(ErrorService.PubkyAppSpecs);
          expect(appError.operation).toBe('createBookmark');
          expect(appError.context).toEqual({ postUri, userId: TEST_PUBKY.USER_1 });
          expect(appError.message).toBe(errorMessage);
        }
      });

      it('should throw AppError when PubkySpecsSingleton.get fails', () => {
        const errorMessage = 'Singleton initialization failed';
        vi.spyOn(PubkySpecsSingleton, 'get').mockImplementation(() => {
          throw errorMessage;
        });
        const postUri = createPostUri();

        try {
          BookmarkNormalizer.to(postUri, TEST_PUBKY.USER_1);
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          expect(appError.category).toBe(ErrorCategory.Validation);
          expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
          expect(appError.service).toBe(ErrorService.PubkyAppSpecs);
          expect(appError.operation).toBe('createBookmark');
        }
      });

      it('should not call logger when error occurs', () => {
        mockBuilder.createBookmark.mockImplementation(() => {
          throw 'Error';
        });

        expect(() => BookmarkNormalizer.to(createPostUri(), TEST_PUBKY.USER_1)).toThrow(AppError);
        expect(Logger.debug).not.toHaveBeenCalled();
      });
    });

    describe('to - edge cases', () => {
      it.each([
        ['empty string', INVALID_INPUTS.EMPTY],
        ['special characters', 'pubky://author/pub/pubky.app/posts/post-123_test.456'],
        ['query parameters', `${createPostUri()}?param=value`],
        ['very long URI', createPostUri(TEST_PUBKY.USER_1, 'a'.repeat(1000))],
      ])('should pass %s postUri to builder', (_, uri) => {
        BookmarkNormalizer.to(uri, TEST_PUBKY.USER_1);
        expect(mockBuilder.createBookmark).toHaveBeenCalledWith(uri);
      });

      it.each([
        ['empty userId', INVALID_INPUTS.EMPTY],
        ['null userId', INVALID_INPUTS.NULL],
        ['undefined userId', INVALID_INPUTS.UNDEFINED],
        ['invalid format userId', INVALID_INPUTS.INVALID_FORMAT],
      ])('should pass %s to PubkySpecsSingleton.get (unit test)', (_, invalidUserId) => {
        // In unit tests, mocks don't validate - just verify calls
        BookmarkNormalizer.to(createPostUri(), invalidUserId);
        expect(PubkySpecsSingleton.get).toHaveBeenCalledWith(invalidUserId);
      });
    });
  });

  /**
   * Integration Tests - Real pubky-app-specs library
   */
  describe('Integration Tests', () => {
    // Use real postUriBuilder for integration tests
    const createRealPostUri = (author = TEST_PUBKY.USER_1, postId = TEST_POST_IDS.POST_1) =>
      postUriBuilder(author, postId);

    beforeEach(setupIntegrationTestMocks);
    afterEach(restoreMocks);

    describe('successful creation with real library', () => {
      it('should create valid result with correct URL format', () => {
        const postUri = createRealPostUri();
        const result = BookmarkNormalizer.to(postUri, TEST_PUBKY.USER_1);

        expect(result.bookmark).toBeDefined();
        expect(result.meta.url).toMatch(/^pubky:\/\/.+\/pub\/pubky\.app\/bookmarks\/.+/);
        expect(result.meta.url).toContain(TEST_PUBKY.USER_1);
      });

      it('should store correct post URI in bookmark JSON', () => {
        const postUri = createRealPostUri();
        const result = BookmarkNormalizer.to(postUri, TEST_PUBKY.USER_1);

        expect(result.bookmark.toJson().uri).toBe(postUri);
      });

      it('should create unique URLs for different posts', () => {
        const uri1 = createRealPostUri(TEST_PUBKY.USER_1, TEST_POST_IDS.POST_1);
        const uri2 = createRealPostUri(TEST_PUBKY.USER_1, TEST_POST_IDS.POST_2);

        const result1 = BookmarkNormalizer.to(uri1, TEST_PUBKY.USER_1);
        const result2 = BookmarkNormalizer.to(uri2, TEST_PUBKY.USER_1);

        expect(result1.meta.url).not.toBe(result2.meta.url);
      });
    });

    describe('validation with real library', () => {
      it.each([
        ['empty', INVALID_INPUTS.EMPTY],
        ['null', INVALID_INPUTS.NULL],
        ['undefined', INVALID_INPUTS.UNDEFINED],
        ['invalid format', INVALID_INPUTS.INVALID_FORMAT],
      ])('should throw AppError for %s post URI', (_, invalidUri) => {
        try {
          BookmarkNormalizer.to(invalidUri, TEST_PUBKY.USER_1);
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          expect(appError.category).toBe(ErrorCategory.Validation);
          expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
          expect(appError.service).toBe(ErrorService.PubkyAppSpecs);
          expect(appError.operation).toBe('createBookmark');
          expect(appError.context).toHaveProperty('postUri', invalidUri);
          expect(appError.context).toHaveProperty('userId', TEST_PUBKY.USER_1);
        }
      });

      /**
       * Note: The pubky-app-specs library is permissive with URI validation.
       * URIs are stored as-is without strict protocol or structure validation.
       */
      it.each([
        ['http protocol', 'http://example/pub/pubky.app/posts/post123'],
        ['incomplete structure', 'pubky://somevalue'],
      ])('should accept %s (library is permissive)', (_, permissiveUri) => {
        const result = BookmarkNormalizer.to(permissiveUri, TEST_PUBKY.USER_1);
        expect(result).toBeDefined();
        expect(result.bookmark.toJson().uri).toBe(permissiveUri);
      });
    });
  });
});
