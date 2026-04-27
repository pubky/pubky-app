import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Core from '@/core';
import { BlobResult, FileResult } from 'pubky-app-specs';
import { asOpaque } from '@/test-utils';
import {
  TEST_PUBKY,
  setupUnitTestMocks,
  setupIntegrationTestMocks,
  restoreMocks,
  buildPubkyUri,
} from '../pipes.test-utils';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';

// File-specific test data
const FILE_TEST_DATA = {
  name: 'test-image.png',
  type: 'image/png',
  size: 1024,
  content: new Uint8Array([1, 2, 3, 4, 5]),
  blobUrl: buildPubkyUri(TEST_PUBKY.USER_1, 'blobs/0032BLOBID123'),
};

// Helper to create mock File objects
const createMockFile = (
  name = FILE_TEST_DATA.name,
  type = FILE_TEST_DATA.type,
  size = FILE_TEST_DATA.size,
  content = FILE_TEST_DATA.content,
): File =>
  asOpaque<File>({
    name,
    type,
    size,
    arrayBuffer: vi.fn().mockResolvedValue(content.buffer),
  });

describe('FileNormalizer', () => {
  const createMockBuilder = (
    overrides?: Partial<{
      createBlob: ReturnType<typeof vi.fn>;
      createFile: ReturnType<typeof vi.fn>;
    }>,
  ) => ({
    createBlob: vi.fn((blobData: Uint8Array) =>
      asOpaque<BlobResult>({
        blob: { data: blobData, toJson: vi.fn(() => ({ data: Array.from(blobData) })) },
        meta: { url: FILE_TEST_DATA.blobUrl },
      }),
    ),
    createFile: vi.fn((name: string, src: string, contentType: string, size: number) =>
      asOpaque<FileResult>({
        file: {
          name,
          src,
          content_type: contentType,
          size,
          toJson: vi.fn(() => ({ name, src, content_type: contentType, size })),
        },
        meta: { url: buildPubkyUri(TEST_PUBKY.USER_1, `files/${Date.now()}`) },
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

    describe('toFileAttachment - successful creation', () => {
      it('should create file attachment with blobResult and fileResult', async () => {
        const file = createMockFile();
        const result = await Core.FileNormalizer.toFileAttachment({ file, pubky: TEST_PUBKY.USER_1 });

        expect(result).toHaveProperty('blobResult');
        expect(result).toHaveProperty('fileResult');
      });

      it('should read file content and call createBlob with Uint8Array', async () => {
        const file = createMockFile();
        await Core.FileNormalizer.toFileAttachment({ file, pubky: TEST_PUBKY.USER_1 });

        expect(file.arrayBuffer).toHaveBeenCalled();
        expect(mockBuilder.createBlob).toHaveBeenCalledWith(expect.any(Uint8Array));
      });

      it('should call createFile with correct parameters using blob URL', async () => {
        const file = createMockFile();
        await Core.FileNormalizer.toFileAttachment({ file, pubky: TEST_PUBKY.USER_1 });

        expect(mockBuilder.createFile).toHaveBeenCalledWith(
          FILE_TEST_DATA.name,
          FILE_TEST_DATA.blobUrl,
          FILE_TEST_DATA.type,
          FILE_TEST_DATA.size,
        );
      });

      it('should return correct structure with blobResult and fileResult', async () => {
        const file = createMockFile();
        const result = await Core.FileNormalizer.toFileAttachment({ file, pubky: TEST_PUBKY.USER_1 });

        expect(result.blobResult.blob).toBeDefined();
        expect(result.blobResult.meta.url).toBeDefined();
        expect(result.fileResult.file).toBeDefined();
        expect(result.fileResult.meta.url).toBeDefined();
      });
    });

    describe('toFileAttachment - different inputs', () => {
      it.each([
        ['different name/type', 'doc.pdf', 'application/pdf', 2048],
        ['image/jpeg', 'photo.jpg', 'image/jpeg', 5000],
        ['binary', 'data.bin', 'application/octet-stream', 10_000_000],
      ])('should handle %s', async (_, name, type, size) => {
        const file = createMockFile(name, type, size);
        await Core.FileNormalizer.toFileAttachment({ file, pubky: TEST_PUBKY.USER_1 });

        expect(mockBuilder.createFile).toHaveBeenCalledWith(name, expect.any(String), type, size);
      });

      it.each([
        ['USER_1', TEST_PUBKY.USER_1],
        ['USER_2', TEST_PUBKY.USER_2],
      ])('should handle pubky: %s', async (_, pubky) => {
        const file = createMockFile();
        await Core.FileNormalizer.toFileAttachment({ file, pubky });

        expect(Core.PubkySpecsSingleton.get).toHaveBeenCalledWith(pubky);
      });
    });

    describe('toFileAttachment - error handling', () => {
      it('should throw AppError with correct properties when createBlob fails', async () => {
        const errorMessage = 'Invalid blob data';
        mockBuilder.createBlob.mockImplementation(() => {
          throw errorMessage;
        });
        const file = createMockFile();

        try {
          await Core.FileNormalizer.toFileAttachment({ file, pubky: TEST_PUBKY.USER_1 });
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          expect(appError.category).toBe(ErrorCategory.Validation);
          expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
          expect(appError.service).toBe(ErrorService.PubkyAppSpecs);
          expect(appError.operation).toBe('toFileAttachment');
        }
      });

      it('should throw AppError with correct properties when createFile fails', async () => {
        const errorMessage = 'Invalid file metadata';
        mockBuilder.createFile.mockImplementation(() => {
          throw errorMessage;
        });
        const file = createMockFile();

        try {
          await Core.FileNormalizer.toFileAttachment({ file, pubky: TEST_PUBKY.USER_1 });
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          expect(appError.category).toBe(ErrorCategory.Validation);
          expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
          expect(appError.service).toBe(ErrorService.PubkyAppSpecs);
          expect(appError.operation).toBe('toFileAttachment');
        }
      });

      it('should throw AppError when file.arrayBuffer fails', async () => {
        const file = createMockFile();
        (file.arrayBuffer as ReturnType<typeof vi.fn>).mockRejectedValue('Read error');

        try {
          await Core.FileNormalizer.toFileAttachment({ file, pubky: TEST_PUBKY.USER_1 });
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          expect(appError.category).toBe(ErrorCategory.Validation);
          expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
          expect(appError.service).toBe(ErrorService.PubkyAppSpecs);
          expect(appError.operation).toBe('toFileAttachment');
        }
      });

      it('should not call createFile when createBlob throws', async () => {
        mockBuilder.createBlob.mockImplementation(() => {
          throw 'Blob error';
        });
        const file = createMockFile();

        await expect(Core.FileNormalizer.toFileAttachment({ file, pubky: TEST_PUBKY.USER_1 })).rejects.toThrow(
          AppError,
        );
        expect(mockBuilder.createFile).not.toHaveBeenCalled();
      });
    });

    describe('toFileAttachment - edge cases', () => {
      it.each([
        ['empty name', '', 'image/png', 100],
        ['empty type', 'file.bin', '', 100],
        ['special chars', 'test file (1) [copy].png', 'image/png', 100],
        ['unicode', '图片-测试-🎉.png', 'image/png', 100],
      ])('should handle %s in file metadata', async (_, name, type, size) => {
        const file = createMockFile(name, type, size);
        await Core.FileNormalizer.toFileAttachment({ file, pubky: TEST_PUBKY.USER_1 });

        expect(mockBuilder.createFile).toHaveBeenCalledWith(name, expect.any(String), type, size);
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
      it('should create valid result with correct URL formats', async () => {
        const file = createMockFile();
        const result = await Core.FileNormalizer.toFileAttachment({ file, pubky: TEST_PUBKY.USER_1 });

        expect(result.blobResult.meta.url).toMatch(/^pubky:\/\/.+\/pub\/pubky\.app\/blobs\/.+/);
        expect(result.fileResult.meta.url).toMatch(/^pubky:\/\/.+\/pub\/pubky\.app\/files\/.+/);
      });

      it('should link file to blob via src property', async () => {
        const file = createMockFile();
        const result = await Core.FileNormalizer.toFileAttachment({ file, pubky: TEST_PUBKY.USER_1 });

        expect(result.fileResult.file.toJson().src).toBe(result.blobResult.meta.url);
      });

      it('should store correct file metadata', async () => {
        const file = createMockFile('my-image.png', 'image/png', 2048);
        const result = await Core.FileNormalizer.toFileAttachment({ file, pubky: TEST_PUBKY.USER_1 });

        const fileJson = result.fileResult.file.toJson();
        expect(fileJson.name).toBe('my-image.png');
        expect(fileJson.content_type).toBe('image/png');
        expect(fileJson.size).toBe(2048);
      });

      it('should create unique URLs for files with different content (content-addressed)', async () => {
        const file1 = createMockFile('f1.png', 'image/png', 5, new Uint8Array([1, 2, 3, 4, 5]));
        const file2 = createMockFile('f2.png', 'image/png', 5, new Uint8Array([6, 7, 8, 9, 10]));

        const result1 = await Core.FileNormalizer.toFileAttachment({ file: file1, pubky: TEST_PUBKY.USER_1 });
        const result2 = await Core.FileNormalizer.toFileAttachment({ file: file2, pubky: TEST_PUBKY.USER_1 });

        expect(result1.blobResult.meta.url).not.toBe(result2.blobResult.meta.url);
      });
    });

    describe('validation with real library', () => {
      /**
       * Note: The pubky-app-specs library validates that file size must be > 0.
       */
      it('should throw AppError for empty file content (size validation)', async () => {
        const emptyFile = createMockFile('empty.txt', 'text/plain', 0, new Uint8Array([]));

        try {
          await Core.FileNormalizer.toFileAttachment({ file: emptyFile, pubky: TEST_PUBKY.USER_1 });
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          const appError = error as AppError;
          expect(appError.category).toBe(ErrorCategory.Validation);
          expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
          expect(appError.service).toBe(ErrorService.PubkyAppSpecs);
        }
      });

      it('should handle minimum valid file size', async () => {
        const tinyFile = createMockFile('tiny.bin', 'application/octet-stream', 1, new Uint8Array([1]));
        const result = await Core.FileNormalizer.toFileAttachment({ file: tinyFile, pubky: TEST_PUBKY.USER_1 });

        expect(result.fileResult.file.toJson().size).toBe(1);
      });

      it('should handle moderate file content (10KB)', async () => {
        const moderateContent = new Uint8Array(10000).fill(255);
        const moderateFile = createMockFile(
          'moderate.bin',
          'application/octet-stream',
          moderateContent.length,
          moderateContent,
        );
        const result = await Core.FileNormalizer.toFileAttachment({ file: moderateFile, pubky: TEST_PUBKY.USER_1 });

        expect(result.fileResult.file.toJson().size).toBe(moderateContent.length);
      });

      it('should handle large file size (10MB)', async () => {
        const tenMB = 10 * 1024 * 1024;
        const largeContent = new Uint8Array(tenMB).fill(255);
        const largeFile = createMockFile('large.bin', 'application/octet-stream', largeContent.length, largeContent);
        const result = await Core.FileNormalizer.toFileAttachment({ file: largeFile, pubky: TEST_PUBKY.USER_1 });

        expect(result.fileResult.file.toJson().size).toBe(largeContent.length);
      }, 20000);
    });
  });
});
