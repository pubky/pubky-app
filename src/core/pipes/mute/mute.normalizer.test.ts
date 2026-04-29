import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MuteResult } from 'pubky-app-specs';
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
import { MuteNormalizer } from '@/pipes/mute/mute.normalizer';
import { PubkySpecsSingleton } from '@/pipes/pipes.builder';
describe('MuteNormalizer', () => {
  const createMockBuilder = (overrides?: Partial<{ createMute: ReturnType<typeof vi.fn> }>) => ({
    createMute: vi.fn((mutee: string) =>
      asOpaque<MuteResult>({
        mute: { mutee, toJson: vi.fn(() => ({})) },
        meta: { url: buildPubkyUri(TEST_PUBKY.USER_1, `mutes/${mutee}`) },
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
      it('should create mute with mute and meta properties', () => {
        const result = MuteNormalizer.to({ muter: TEST_PUBKY.USER_1, mutee: TEST_PUBKY.USER_2 });

        expect(result).toHaveProperty('mute');
        expect(result).toHaveProperty('meta');
      });

      it('should call PubkySpecsSingleton.get with muter and createMute with mutee', () => {
        MuteNormalizer.to({ muter: TEST_PUBKY.USER_1, mutee: TEST_PUBKY.USER_2 });

        expect(PubkySpecsSingleton.get).toHaveBeenCalledWith(TEST_PUBKY.USER_1);
        expect(mockBuilder.createMute).toHaveBeenCalledWith(TEST_PUBKY.USER_2);
      });

      it('should return correct structure with mute and meta URL', () => {
        const result = MuteNormalizer.to({ muter: TEST_PUBKY.USER_1, mutee: TEST_PUBKY.USER_2 });

        expect(result.mute).toHaveProperty('toJson');
        expect(result.meta.url).toContain('pubky://');
        expect(result.meta.url).toContain('/pub/pubky.app/mutes/');
      });
    });

    describe('to - different inputs', () => {
      it('should handle different muter/mutee combinations', () => {
        MuteNormalizer.to({ muter: TEST_PUBKY.USER_1, mutee: TEST_PUBKY.USER_2 });
        expect(mockBuilder.createMute).toHaveBeenCalledWith(TEST_PUBKY.USER_2);

        MuteNormalizer.to({ muter: TEST_PUBKY.USER_2, mutee: TEST_PUBKY.USER_1 });
        expect(PubkySpecsSingleton.get).toHaveBeenCalledWith(TEST_PUBKY.USER_2);
      });

      it('should handle self-mute scenario', () => {
        MuteNormalizer.to({ muter: TEST_PUBKY.USER_1, mutee: TEST_PUBKY.USER_1 });

        expect(PubkySpecsSingleton.get).toHaveBeenCalledWith(TEST_PUBKY.USER_1);
        expect(mockBuilder.createMute).toHaveBeenCalledWith(TEST_PUBKY.USER_1);
      });
    });

    describe('to - error handling', () => {
      it('should throw AppError with correct properties when createMute fails', () => {
        const errorMessage = 'Invalid mutee';
        mockBuilder.createMute.mockImplementation(() => {
          throw errorMessage;
        });

        try {
          MuteNormalizer.to({ muter: TEST_PUBKY.USER_1, mutee: TEST_PUBKY.USER_2 });
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          expect(appError.category).toBe(ErrorCategory.Validation);
          expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
          expect(appError.service).toBe(ErrorService.PubkyAppSpecs);
          expect(appError.operation).toBe('createMute');
          expect(appError.context).toEqual({ muter: TEST_PUBKY.USER_1, mutee: TEST_PUBKY.USER_2 });
          expect(appError.message).toBe(errorMessage);
        }
      });

      it('should throw AppError when PubkySpecsSingleton.get fails', () => {
        vi.spyOn(PubkySpecsSingleton, 'get').mockImplementation(() => {
          throw 'Singleton error';
        });

        expect(() => MuteNormalizer.to({ muter: TEST_PUBKY.USER_1, mutee: TEST_PUBKY.USER_2 })).toThrow(AppError);
      });
    });

    describe('to - edge cases', () => {
      it.each([
        ['empty mutee', { muter: TEST_PUBKY.USER_1, mutee: INVALID_INPUTS.EMPTY }],
        ['empty muter', { muter: INVALID_INPUTS.EMPTY, mutee: TEST_PUBKY.USER_2 }],
      ])('should pass %s to builder (unit test)', (_, params) => {
        MuteNormalizer.to(params);
        expect(mockBuilder.createMute).toHaveBeenCalled();
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
        const result = MuteNormalizer.to({ muter: TEST_PUBKY.USER_1, mutee: TEST_PUBKY.USER_2 });

        expect(result.mute).toBeDefined();
        expect(result.meta.url).toMatch(/^pubky:\/\/.+\/pub\/pubky\.app\/mutes\/.+/);
        expect(result.meta.url).toContain(TEST_PUBKY.USER_2);
      });

      it('should create unique URLs for different mutees', () => {
        const result1 = MuteNormalizer.to({ muter: TEST_PUBKY.USER_1, mutee: TEST_PUBKY.USER_2 });
        const result2 = MuteNormalizer.to({ muter: TEST_PUBKY.USER_1, mutee: TEST_PUBKY.USER_1 });

        expect(result1.meta.url).not.toBe(result2.meta.url);
      });

      it('should allow self-mute at specs level', () => {
        const result = MuteNormalizer.to({ muter: TEST_PUBKY.USER_1, mutee: TEST_PUBKY.USER_1 });

        expect(result).toBeDefined();
        expect(result.meta.url).toContain(TEST_PUBKY.USER_1);
      });

      it('should produce valid JSON from mute object', () => {
        const result = MuteNormalizer.to({ muter: TEST_PUBKY.USER_1, mutee: TEST_PUBKY.USER_2 });

        expect(typeof result.mute.toJson).toBe('function');
        expect(result.mute.toJson()).toBeDefined();
      });

      it('should handle mutee with "pubky" prefix by stripping it', () => {
        const prefixedMutee = `pubky${TEST_PUBKY.USER_2}`;
        const result = MuteNormalizer.to({ muter: TEST_PUBKY.USER_1, mutee: prefixedMutee });

        expect(result.mute).toBeDefined();
        expect(result.meta.url).toContain(TEST_PUBKY.USER_2);
      });

      it('should handle mutee with "pk:" prefix by stripping it', () => {
        const prefixedMutee = `pk:${TEST_PUBKY.USER_2}`;
        const result = MuteNormalizer.to({ muter: TEST_PUBKY.USER_1, mutee: prefixedMutee });

        expect(result.mute).toBeDefined();
        expect(result.meta.url).toContain(TEST_PUBKY.USER_2);
      });
    });

    describe('validation with real library', () => {
      /**
       * Note: createMute(mutee) validates the mutee parameter.
       * Invalid mutees throw because the method takes a parameter.
       */
      it.each([
        ['empty', INVALID_INPUTS.EMPTY],
        ['null', INVALID_INPUTS.NULL],
        ['undefined', INVALID_INPUTS.UNDEFINED],
        ['invalid format', INVALID_INPUTS.INVALID_FORMAT],
      ])('should throw AppError for %s mutee', (_, invalidMutee) => {
        try {
          MuteNormalizer.to({ muter: TEST_PUBKY.USER_1, mutee: invalidMutee });
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          expect(appError.category).toBe(ErrorCategory.Validation);
          expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
          expect(appError.service).toBe(ErrorService.PubkyAppSpecs);
          expect(appError.operation).toBe('createMute');
        }
      });
    });
  });
});
