import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Core from '@/core';
import { FollowResult } from 'pubky-app-specs';
import { asOpaque } from '@/test-utils';
import {
  TEST_PUBKY,
  INVALID_INPUTS,
  setupUnitTestMocks,
  setupIntegrationTestMocks,
  restoreMocks,
  buildPubkyUri,
} from '../pipes.test-utils';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';

describe('FollowNormalizer', () => {
  const createMockBuilder = (overrides?: Partial<{ createFollow: ReturnType<typeof vi.fn> }>) => ({
    createFollow: vi.fn((followee: string) =>
      asOpaque<FollowResult>({
        follow: { followee, toJson: vi.fn(() => ({})) },
        meta: { url: buildPubkyUri(TEST_PUBKY.USER_1, `follows/${followee}`) },
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
      it('should create follow with follow and meta properties', () => {
        const result = Core.FollowNormalizer.to({ follower: TEST_PUBKY.USER_1, followee: TEST_PUBKY.USER_2 });

        expect(result).toHaveProperty('follow');
        expect(result).toHaveProperty('meta');
      });

      it('should call PubkySpecsSingleton.get with follower and createFollow with followee', () => {
        Core.FollowNormalizer.to({ follower: TEST_PUBKY.USER_1, followee: TEST_PUBKY.USER_2 });

        expect(Core.PubkySpecsSingleton.get).toHaveBeenCalledWith(TEST_PUBKY.USER_1);
        expect(mockBuilder.createFollow).toHaveBeenCalledWith(TEST_PUBKY.USER_2);
      });

      it('should return correct structure with follow and meta URL', () => {
        const result = Core.FollowNormalizer.to({ follower: TEST_PUBKY.USER_1, followee: TEST_PUBKY.USER_2 });

        expect(result.follow).toHaveProperty('toJson');
        expect(result.meta.url).toContain('pubky://');
        expect(result.meta.url).toContain('/pub/pubky.app/follows/');
      });
    });

    describe('to - different inputs', () => {
      it('should handle different follower/followee combinations', () => {
        Core.FollowNormalizer.to({ follower: TEST_PUBKY.USER_1, followee: TEST_PUBKY.USER_2 });
        expect(mockBuilder.createFollow).toHaveBeenCalledWith(TEST_PUBKY.USER_2);

        Core.FollowNormalizer.to({ follower: TEST_PUBKY.USER_2, followee: TEST_PUBKY.USER_1 });
        expect(Core.PubkySpecsSingleton.get).toHaveBeenCalledWith(TEST_PUBKY.USER_2);
      });

      it('should handle self-follow scenario', () => {
        Core.FollowNormalizer.to({ follower: TEST_PUBKY.USER_1, followee: TEST_PUBKY.USER_1 });

        expect(Core.PubkySpecsSingleton.get).toHaveBeenCalledWith(TEST_PUBKY.USER_1);
        expect(mockBuilder.createFollow).toHaveBeenCalledWith(TEST_PUBKY.USER_1);
      });
    });

    describe('to - error handling', () => {
      it('should throw AppError with correct properties when createFollow fails', () => {
        const errorMessage = 'Invalid followee';
        mockBuilder.createFollow.mockImplementation(() => {
          throw errorMessage;
        });

        try {
          Core.FollowNormalizer.to({ follower: TEST_PUBKY.USER_1, followee: TEST_PUBKY.USER_2 });
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          expect(appError.category).toBe(ErrorCategory.Validation);
          expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
          expect(appError.service).toBe(ErrorService.PubkyAppSpecs);
          expect(appError.operation).toBe('createFollow');
          expect(appError.context).toEqual({ follower: TEST_PUBKY.USER_1, followee: TEST_PUBKY.USER_2 });
          expect(appError.message).toBe(errorMessage);
        }
      });

      it('should throw AppError when PubkySpecsSingleton.get fails', () => {
        vi.spyOn(Core.PubkySpecsSingleton, 'get').mockImplementation(() => {
          throw 'Singleton error';
        });

        expect(() => Core.FollowNormalizer.to({ follower: TEST_PUBKY.USER_1, followee: TEST_PUBKY.USER_2 })).toThrow(
          AppError,
        );
      });
    });

    describe('to - edge cases', () => {
      it.each([
        ['empty followee', { follower: TEST_PUBKY.USER_1, followee: INVALID_INPUTS.EMPTY }],
        ['empty follower', { follower: INVALID_INPUTS.EMPTY, followee: TEST_PUBKY.USER_2 }],
      ])('should pass %s to builder (unit test)', (_, params) => {
        Core.FollowNormalizer.to(params);
        // In unit tests, mocks don't validate - just verify calls
        expect(mockBuilder.createFollow).toHaveBeenCalled();
      });
    });
  });

  /**
   * Integration Tests - Real pubky-app-specs library
   */
  describe('Integration Tests', () => {
    beforeEach(setupIntegrationTestMocks);
    afterEach(restoreMocks);

    describe('successful creation with real library', () => {
      it('should create valid result with correct URL format', () => {
        const result = Core.FollowNormalizer.to({ follower: TEST_PUBKY.USER_1, followee: TEST_PUBKY.USER_2 });

        expect(result.follow).toBeDefined();
        expect(result.meta.url).toMatch(/^pubky:\/\/.+\/pub\/pubky\.app\/follows\/.+/);
        expect(result.meta.url).toContain(TEST_PUBKY.USER_2);
      });

      it('should create unique URLs for different followees', () => {
        const result1 = Core.FollowNormalizer.to({ follower: TEST_PUBKY.USER_1, followee: TEST_PUBKY.USER_2 });
        const result2 = Core.FollowNormalizer.to({ follower: TEST_PUBKY.USER_1, followee: TEST_PUBKY.USER_1 });

        expect(result1.meta.url).not.toBe(result2.meta.url);
      });

      it('should allow self-follow at specs level', () => {
        const result = Core.FollowNormalizer.to({ follower: TEST_PUBKY.USER_1, followee: TEST_PUBKY.USER_1 });

        expect(result).toBeDefined();
        expect(result.meta.url).toContain(TEST_PUBKY.USER_1);
      });

      it('should produce valid JSON from follow object', () => {
        const result = Core.FollowNormalizer.to({ follower: TEST_PUBKY.USER_1, followee: TEST_PUBKY.USER_2 });

        expect(typeof result.follow.toJson).toBe('function');
        expect(result.follow.toJson()).toBeDefined();
      });

      it('should handle followee with "pubky" prefix by stripping it', () => {
        const prefixedFollowee = `pubky${TEST_PUBKY.USER_2}`;
        const result = Core.FollowNormalizer.to({ follower: TEST_PUBKY.USER_1, followee: prefixedFollowee });

        expect(result.follow).toBeDefined();
        expect(result.meta.url).toContain(TEST_PUBKY.USER_2);
      });

      it('should handle followee with "pk:" prefix by stripping it', () => {
        const prefixedFollowee = `pk:${TEST_PUBKY.USER_2}`;
        const result = Core.FollowNormalizer.to({ follower: TEST_PUBKY.USER_1, followee: prefixedFollowee });

        expect(result.follow).toBeDefined();
        expect(result.meta.url).toContain(TEST_PUBKY.USER_2);
      });
    });

    describe('validation with real library', () => {
      /**
       * Note: createFollow(followee) validates the followee parameter.
       * Unlike LastRead, invalid followees throw because the method takes a parameter.
       */
      it.each([
        ['empty', INVALID_INPUTS.EMPTY],
        ['null', INVALID_INPUTS.NULL],
        ['undefined', INVALID_INPUTS.UNDEFINED],
        ['invalid format', INVALID_INPUTS.INVALID_FORMAT],
      ])('should throw AppError for %s followee', (_, invalidFollowee) => {
        try {
          Core.FollowNormalizer.to({ follower: TEST_PUBKY.USER_1, followee: invalidFollowee });
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          expect(appError.category).toBe(ErrorCategory.Validation);
          expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
          expect(appError.service).toBe(ErrorService.PubkyAppSpecs);
          expect(appError.operation).toBe('createFollow');
        }
      });
    });
  });
});
