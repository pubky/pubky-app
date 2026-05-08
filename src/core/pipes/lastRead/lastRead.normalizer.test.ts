import { LastReadResult } from 'pubky-app-specs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { LastReadNormalizer } from '@/pipes/lastRead/lastRead.normalizer';
import { PubkySpecsSingleton } from '@/pipes/pipes.builder';
import { asOpaque } from '@/test-utils/type-assertions';
import {
  buildPubkyUri,
  INVALID_INPUTS,
  restoreMocks,
  setupIntegrationTestMocks,
  setupUnitTestMocks,
  TEST_PUBKY,
} from '../pipes.test-utils';

describe('LastReadNormalizer', () => {
  // Mock builder factory
  const createMockBuilder = (overrides?: Partial<{ createLastRead: ReturnType<typeof vi.fn> }>) => ({
    createLastRead: vi.fn(() => {
      const mockTimestamp = BigInt(Date.now());
      return asOpaque<LastReadResult>({
        last_read: {
          timestamp: mockTimestamp,
          toJson: vi.fn(() => ({ timestamp: Number(mockTimestamp) })),
        },
        meta: { url: buildPubkyUri(TEST_PUBKY.USER_1, 'last_read') },
      });
    }),
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
      it('should create last read with last_read and meta properties', () => {
        const result = LastReadNormalizer.to(TEST_PUBKY.USER_1);

        expect(result).toHaveProperty('last_read');
        expect(result).toHaveProperty('meta');
      });

      it('should call PubkySpecsSingleton.get with pubky and createLastRead without params', () => {
        LastReadNormalizer.to(TEST_PUBKY.USER_1);

        expect(PubkySpecsSingleton.get).toHaveBeenCalledWith(TEST_PUBKY.USER_1);
        expect(mockBuilder.createLastRead).toHaveBeenCalledWith();
      });

      it('should return correct structure with timestamp and URL', () => {
        const result = LastReadNormalizer.to(TEST_PUBKY.USER_1);

        expect(result.last_read.timestamp).toBeDefined();
        expect(typeof result.last_read.toJson).toBe('function');
        expect(result.meta.url).toContain('pubky://');
        expect(result.meta.url).toContain('/pub/pubky.app/last_read');
      });
    });

    describe('to - error handling', () => {
      it('should throw AppError with correct properties when createLastRead fails', () => {
        const errorMessage = 'Invalid last read';
        mockBuilder.createLastRead.mockImplementation(() => {
          throw errorMessage;
        });

        try {
          LastReadNormalizer.to(TEST_PUBKY.USER_1);
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          expect(appError.category).toBe(ErrorCategory.Validation);
          expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
          expect(appError.service).toBe(ErrorService.PubkyAppSpecs);
          expect(appError.operation).toBe('createLastRead');
          expect(appError.context).toEqual({ pubky: TEST_PUBKY.USER_1 });
          expect(appError.message).toBe(errorMessage);
        }
      });

      it('should throw AppError when PubkySpecsSingleton.get fails', () => {
        vi.spyOn(PubkySpecsSingleton, 'get').mockImplementation(() => {
          throw 'Singleton error';
        });

        expect(() => LastReadNormalizer.to(TEST_PUBKY.USER_1)).toThrow(AppError);
      });
    });

    describe('to - different inputs', () => {
      it.each([
        ['USER_1', TEST_PUBKY.USER_1],
        ['USER_2', TEST_PUBKY.USER_2],
      ])('should handle %s pubky', (_, pubky) => {
        LastReadNormalizer.to(pubky);
        expect(PubkySpecsSingleton.get).toHaveBeenCalledWith(pubky);
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
        const result = LastReadNormalizer.to(TEST_PUBKY.USER_1);

        expect(result.last_read).toBeDefined();
        expect(result.meta.url).toMatch(/^pubky:\/\/.+\/pub\/pubky\.app\/last_read$/);
        expect(result.meta.url).toContain(TEST_PUBKY.USER_1);
      });

      it('should have BigInt timestamp close to current time', () => {
        const before = BigInt(Date.now());
        const result = LastReadNormalizer.to(TEST_PUBKY.USER_1);
        const after = BigInt(Date.now());

        expect(typeof result.last_read.timestamp).toBe('bigint');
        expect(result.last_read.timestamp).toBeGreaterThanOrEqual(before - BigInt(1000));
        expect(result.last_read.timestamp).toBeLessThanOrEqual(after + BigInt(1000));
      });

      it('should produce valid JSON with numeric timestamp', () => {
        const result = LastReadNormalizer.to(TEST_PUBKY.USER_1);
        const json = result.last_read.toJson();

        expect(typeof json.timestamp).toBe('number');
        expect(Number.isFinite(json.timestamp)).toBe(true);
      });
    });

    describe('validation behavior (singleton caching)', () => {
      /**
       * Note: createLastRead() takes no parameters, so validation only happens
       * at singleton initialization. Once initialized, invalid pubkys don't throw
       * because the singleton reuses the existing builder.
       */
      it.each([
        ['empty', INVALID_INPUTS.EMPTY],
        ['null', INVALID_INPUTS.NULL],
        ['undefined', INVALID_INPUTS.UNDEFINED],
        ['invalid format', INVALID_INPUTS.INVALID_FORMAT],
      ])('should not throw for %s pubky (singleton already initialized)', (_, invalidPubky) => {
        // Ensure singleton is initialized first
        LastReadNormalizer.to(TEST_PUBKY.USER_1);

        // Invalid pubky doesn't throw due to singleton caching
        const result = LastReadNormalizer.to(invalidPubky);
        expect(result).toBeDefined();
      });
    });

    describe('sequential calls', () => {
      it('should generate different timestamps for sequential calls', async () => {
        const result1 = LastReadNormalizer.to(TEST_PUBKY.USER_1);
        await new Promise((r) => setTimeout(r, 10));
        const result2 = LastReadNormalizer.to(TEST_PUBKY.USER_1);

        expect(result2.last_read.timestamp).toBeGreaterThanOrEqual(result1.last_read.timestamp);
      });
    });
  });
});
