import type { BlobResult, FileResult } from 'pubky-app-specs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import { IMAGE_UPLOAD_SIZE_LIMIT_KIND_CONTEXT_KEY } from '@/libs/image/imageUploadSizeLimit';
import { stripImageMetadata } from '@/libs/image/stripImageMetadata';
import { FileDetailsModel } from '@/models/file/fileDetails';
import { CompositeIdDomain, type Pubky } from '@/models/models.types';
import { buildCompositeId, buildCompositeIdFromPubkyUri } from '@/models/models.utils';
import { FileNormalizer } from '@/pipes/file/file.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalFileService } from '@/services/local/file/file';
import { filesApi } from '@/services/nexus/file/file.api';
import { FileVariant } from '@/services/nexus/file/file.types';
import type { NexusFileDetails } from '@/services/nexus/nexus.types';
import { asOpaque } from '@/test-utils/type-assertions';

// Avoid pulling WASM-heavy deps from type-only modules
vi.mock('pubky-app-specs', () => ({
  getValidMimeTypes: () => ['image/jpeg', 'image/png'],
}));

vi.mock('@/libs/image/stripImageMetadata', () => ({
  stripImageMetadata: vi.fn(),
}));

vi.mock('@/pipes/file/file.normalizer', () => ({
  FileNormalizer: {
    toFileAttachment: vi.fn(),
  },
}));

// Mock HomeserverService methods
vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: {
    putBlob: vi.fn(),
    request: vi.fn(),
    delete: vi.fn(),
    deleteIdempotent: vi.fn(),
  },
}));

// Mock LocalFileService
vi.mock('@/services/local/file/file', () => ({
  LocalFileService: {
    findByIds: vi.fn(),
    createMany: vi.fn(),
    create: vi.fn(),
    read: vi.fn(),
    deleteById: vi.fn(),
    hasOtherBlobReference: vi.fn(),
  },
}));

// Mock NexusFileService
vi.mock('@/services/nexus/file/file', () => ({
  NexusFileService: {
    fetchFiles: vi.fn(),
  },
}));

// Mock file API and model dependencies
vi.mock('@/services/nexus/file/file.api', () => ({
  filesApi: {
    getAvatarUrl: vi.fn(),
    getFileUrl: vi.fn(),
    getFiles: vi.fn(),
  },
}));
vi.mock('@/models/file/fileDetails', () => ({
  FileDetailsModel: {
    findById: vi.fn(),
  },
}));

let FileApplication: typeof import('./file').FileApplication;

const spyOnBuildCompositeIdFromPubkyUri = async () =>
  vi.spyOn(await import('@/models/models.utils'), 'buildCompositeIdFromPubkyUri');
const spyOnParseCompositeId = async () => vi.spyOn(await import('@/models/models.utils'), 'parseCompositeId');

const TEST_PUBKY = 'operrr8wsbpr3ue9d4qj41ge1kcc6r7fdiy6o3ugjrrhi4y77rd0' as Pubky;
const TEST_TIMESTAMP = 1234567890;

const createMockFile = (
  id: string,
  name: string,
  uri: string,
  overrides?: Partial<NexusFileDetails>,
): NexusFileDetails => ({
  id,
  name,
  src: `src-${name}`,
  content_type: 'image/jpeg',
  size: 100,
  created_at: TEST_TIMESTAMP,
  indexed_at: TEST_TIMESTAMP,
  metadata: {},
  owner_id: TEST_PUBKY,
  uri,
  urls: { feed: '', main: '', small: '' },
  ...overrides,
});

const createFileUri = (fileId: string, pubky: Pubky = TEST_PUBKY) => `pubky://${pubky}/pub/pubky.app/files/${fileId}`;

const createMockUrls = (feed: string = 'feed', main: string = 'main', small: string = 'small') =>
  JSON.stringify({ feed, main, small });

const createMockBlobResult = (url: string = 'pubky://user/blob/file') =>
  asOpaque<BlobResult>({
    blob: { data: new Uint8Array([1, 2, 3]) },
    meta: { url },
  });

const createMockFileResult = (
  url: string = 'pubky://user/pub/pubky.app/files/file',
  fileJson: Record<string, unknown> = { id: 'file-1', kind: 'image' },
) =>
  asOpaque<FileResult>({
    file: { toJson: vi.fn(() => fileJson) },
    meta: { url },
  });

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();

  ({ FileApplication } = await import('./file'));

  // Default: no other cached record shares the blob, so deletions proceed
  vi.mocked(LocalFileService.hasOtherBlobReference).mockResolvedValue(false);
});

describe('FileApplication', () => {
  describe('toFileAttachment', () => {
    it('sanitizes file before normalizing it', async () => {
      const rawFile = new File(['raw'], 'photo.jpg', { type: 'image/jpeg' });
      const sanitizedFile = new File(['sanitized'], 'obfuscated.jpg', { type: 'image/jpeg' });
      const fileAttachment = {
        blobResult: createMockBlobResult(),
        fileResult: createMockFileResult(),
      };

      vi.mocked(stripImageMetadata).mockResolvedValueOnce(sanitizedFile);
      vi.mocked(FileNormalizer.toFileAttachment).mockReturnValueOnce(fileAttachment);

      const result = await FileApplication.toFileAttachment({ file: rawFile, pubky: TEST_PUBKY });

      expect(stripImageMetadata).toHaveBeenCalledWith(rawFile);
      expect(FileNormalizer.toFileAttachment).toHaveBeenCalledWith({
        file: sanitizedFile,
        blobData: expect.any(Uint8Array),
        pubky: TEST_PUBKY,
      });
      expect(result).toBe(fileAttachment);
    });

    it('wraps sanitization failures as AppError', async () => {
      const rawFile = new File(['raw'], 'photo.jpg', { type: 'image/jpeg' });
      vi.mocked(stripImageMetadata).mockRejectedValueOnce(new Error('sanitize failed'));

      try {
        await FileApplication.toFileAttachment({ file: rawFile, pubky: TEST_PUBKY });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toMatchObject({
          name: 'AppError',
          category: ErrorCategory.Validation,
          code: ValidationErrorCode.INVALID_INPUT,
          service: ErrorService.Local,
          operation: 'toFileAttachment',
          message: 'Image sanitization failed',
        });
      }
      expect(FileNormalizer.toFileAttachment).not.toHaveBeenCalled();
    });

    it('tags size-limit sanitization failures in AppError context', async () => {
      const rawFile = new File(['raw'], 'animated.gif', { type: 'image/gif' });
      vi.mocked(stripImageMetadata).mockRejectedValueOnce(new Error('IMAGE_UPLOAD_SIZE_LIMIT:gif'));

      try {
        await FileApplication.toFileAttachment({ file: rawFile, pubky: TEST_PUBKY });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toMatchObject({
          name: 'AppError',
          category: ErrorCategory.Validation,
          code: ValidationErrorCode.INVALID_INPUT,
          service: ErrorService.Local,
          operation: 'toFileAttachment',
          message: 'Image sanitization failed',
          context: { [IMAGE_UPLOAD_SIZE_LIMIT_KIND_CONTEXT_KEY]: 'gif' },
        });
      }
      expect(FileNormalizer.toFileAttachment).not.toHaveBeenCalled();
    });

    it('wraps file read failures as AppError', async () => {
      const rawFile = new File(['raw'], 'photo.jpg', { type: 'image/jpeg' });
      const sanitizedFile = new File(['sanitized'], 'obfuscated.jpg', { type: 'image/jpeg' });
      const readError = new Error('arrayBuffer failed');
      vi.spyOn(sanitizedFile, 'arrayBuffer').mockRejectedValueOnce(readError);
      vi.mocked(stripImageMetadata).mockResolvedValueOnce(sanitizedFile);

      try {
        await FileApplication.toFileAttachment({ file: rawFile, pubky: TEST_PUBKY });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toMatchObject({
          name: 'AppError',
          category: ErrorCategory.Validation,
          code: ValidationErrorCode.INVALID_INPUT,
          service: ErrorService.Local,
          operation: 'toFileAttachment',
          message: 'Failed to read file content',
          cause: readError,
        });
      }
      expect(FileNormalizer.toFileAttachment).not.toHaveBeenCalled();
    });
  });

  describe('commitCreate', () => {
    it('uploads blob and then file record to homeserver', async () => {
      const fileJson = { id: 'file-1', kind: 'image' };
      const blobResult = createMockBlobResult();
      const fileResult = createMockFileResult(undefined, fileJson);

      const putBlobSpy = vi.spyOn(HomeserverService, 'putBlob').mockResolvedValue(undefined);
      const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);
      const createSpy = vi.spyOn(LocalFileService, 'create').mockResolvedValue(undefined);

      await FileApplication.commitCreate({ fileAttachments: [{ blobResult, fileResult }] });

      expect(putBlobSpy).toHaveBeenCalledWith({ url: blobResult.meta.url, blob: blobResult.blob.data });
      expect(fileResult.file.toJson).toHaveBeenCalledTimes(1);
      expect(requestSpy).toHaveBeenNthCalledWith(1, {
        method: HttpMethod.PUT,
        url: fileResult.meta.url,
        bodyJson: fileJson,
      });
      expect(createSpy).toHaveBeenCalledWith({ blobResult, fileResult });

      // Ensure blob upload happened before file record request
      expect(putBlobSpy.mock.invocationCallOrder[0]).toBeLessThan(requestSpy.mock.invocationCallOrder[0]);
      // Ensure file record request happened before local persistence
      expect(requestSpy.mock.invocationCallOrder[0]).toBeLessThan(createSpy.mock.invocationCallOrder[0]);
    });

    it('propagates errors if the first upload fails', async () => {
      const blobResult = createMockBlobResult();
      const fileResult = createMockFileResult();

      const putBlobSpy = vi.spyOn(HomeserverService, 'putBlob').mockRejectedValueOnce(new Error('blob upload failed'));
      const requestSpy = vi.spyOn(HomeserverService, 'request');
      const createSpy = vi.spyOn(LocalFileService, 'create');

      await expect(FileApplication.commitCreate({ fileAttachments: [{ blobResult, fileResult }] })).rejects.toThrow(
        'blob upload failed',
      );
      expect(putBlobSpy).toHaveBeenCalledTimes(1);
      expect(requestSpy).not.toHaveBeenCalled();
      expect(fileResult.file.toJson).not.toHaveBeenCalled();
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('waits for sibling uploads to settle before rejecting on a partial failure', async () => {
      // On failure the callers sweep the whole batch — rejecting while a
      // sibling upload is still in flight would race the rollback against it
      const failing = {
        blobResult: createMockBlobResult('pubky://user/blob/fail'),
        fileResult: createMockFileResult(),
      };
      const slow = {
        blobResult: createMockBlobResult('pubky://user/blob/slow'),
        fileResult: createMockFileResult('pubky://user/pub/pubky.app/files/slow', { id: 'file-slow', kind: 'image' }),
      };

      let resolveSlowBlob: () => void = () => undefined;
      const putBlobSpy = vi.spyOn(HomeserverService, 'putBlob').mockImplementation(({ url }) => {
        if (url === failing.blobResult.meta.url) {
          return Promise.reject(new Error('blob upload failed'));
        }
        return new Promise((resolve) => {
          resolveSlowBlob = () => resolve(undefined);
        });
      });
      const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);
      const createSpy = vi.spyOn(LocalFileService, 'create').mockResolvedValue(undefined);

      let settled = false;
      const pending = FileApplication.commitCreate({ fileAttachments: [failing, slow] }).catch((error: Error) => {
        settled = true;
        return error;
      });

      // The failing upload has rejected, but the slow sibling is still in
      // flight — commitCreate must NOT have settled yet
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(putBlobSpy).toHaveBeenCalledTimes(2);
      expect(settled).toBe(false);

      resolveSlowBlob();
      const error = await pending;

      expect(settled).toBe(true);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('blob upload failed');
      // The slow sibling completed its full chain before the rejection surfaced
      expect(requestSpy).toHaveBeenCalledWith({
        method: HttpMethod.PUT,
        url: slow.fileResult.meta.url,
        bodyJson: { id: 'file-slow', kind: 'image' },
      });
      expect(createSpy).toHaveBeenCalledWith({ blobResult: slow.blobResult, fileResult: slow.fileResult });
    });

    it('propagates errors if the file record upload fails', async () => {
      const fileJson = { id: 'file-1', kind: 'image' };
      const blobResult = createMockBlobResult();
      const fileResult = createMockFileResult(undefined, fileJson);

      const putBlobSpy = vi.spyOn(HomeserverService, 'putBlob').mockResolvedValue(undefined);
      const requestSpy = vi
        .spyOn(HomeserverService, 'request')
        .mockRejectedValueOnce(new Error('file record upload failed'));
      const createSpy = vi.spyOn(LocalFileService, 'create');

      await expect(FileApplication.commitCreate({ fileAttachments: [{ blobResult, fileResult }] })).rejects.toThrow(
        'file record upload failed',
      );
      expect(putBlobSpy).toHaveBeenCalledTimes(1);
      expect(fileResult.file.toJson).toHaveBeenCalledTimes(1);
      expect(requestSpy).toHaveBeenCalledTimes(1);
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('uploads multiple files in parallel', async () => {
      const fileJson1 = { id: 'file-1', kind: 'image' };
      const fileJson2 = { id: 'file-2', kind: 'video' };
      const blobResult1 = createMockBlobResult('pubky://user/blob/file1');
      const blobResult2 = createMockBlobResult('pubky://user/blob/file2');
      const fileResult1 = createMockFileResult('pubky://user/pub/pubky.app/files/file1', fileJson1);
      const fileResult2 = createMockFileResult('pubky://user/pub/pubky.app/files/file2', fileJson2);

      const putBlobSpy = vi.spyOn(HomeserverService, 'putBlob').mockResolvedValue(undefined);
      const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);
      const createSpy = vi.spyOn(LocalFileService, 'create').mockResolvedValue(undefined);

      await FileApplication.commitCreate({
        fileAttachments: [
          { blobResult: blobResult1, fileResult: fileResult1 },
          { blobResult: blobResult2, fileResult: fileResult2 },
        ],
      });

      // Verify both files were uploaded
      expect(putBlobSpy).toHaveBeenCalledWith({ url: blobResult1.meta.url, blob: blobResult1.blob.data });
      expect(putBlobSpy).toHaveBeenCalledWith({ url: blobResult2.meta.url, blob: blobResult2.blob.data });
      expect(fileResult1.file.toJson).toHaveBeenCalledTimes(1);
      expect(fileResult2.file.toJson).toHaveBeenCalledTimes(1);
      expect(requestSpy).toHaveBeenCalledWith({
        method: HttpMethod.PUT,
        url: fileResult1.meta.url,
        bodyJson: fileJson1,
      });
      expect(requestSpy).toHaveBeenCalledWith({
        method: HttpMethod.PUT,
        url: fileResult2.meta.url,
        bodyJson: fileJson2,
      });
      expect(createSpy).toHaveBeenCalledWith({ blobResult: blobResult1, fileResult: fileResult1 });
      expect(createSpy).toHaveBeenCalledWith({ blobResult: blobResult2, fileResult: fileResult2 });

      // Verify call counts
      expect(putBlobSpy).toHaveBeenCalledTimes(2);
      expect(requestSpy).toHaveBeenCalledTimes(2);
      expect(createSpy).toHaveBeenCalledTimes(2);
    });

    it('propagates errors when LocalFileService.create fails', async () => {
      const fileJson = { id: 'file-1', kind: 'image' };
      const blobResult = createMockBlobResult();
      const fileResult = createMockFileResult(undefined, fileJson);

      const error = new Error('Local persistence failed');
      const putBlobSpy = vi.spyOn(HomeserverService, 'putBlob').mockResolvedValue(undefined);
      const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);
      const createSpy = vi.spyOn(LocalFileService, 'create').mockRejectedValue(error);

      await expect(FileApplication.commitCreate({ fileAttachments: [{ blobResult, fileResult }] })).rejects.toThrow(
        'Local persistence failed',
      );

      expect(putBlobSpy).toHaveBeenCalledWith({ url: blobResult.meta.url, blob: blobResult.blob.data });
      expect(fileResult.file.toJson).toHaveBeenCalledTimes(1);
      expect(requestSpy).toHaveBeenCalledWith({ method: HttpMethod.PUT, url: fileResult.meta.url, bodyJson: fileJson });
      expect(createSpy).toHaveBeenCalledWith({ blobResult, fileResult });

      // Verify all homeserver operations completed before error
      expect(putBlobSpy).toHaveBeenCalledTimes(1);
      expect(requestSpy).toHaveBeenCalledTimes(1);
      expect(createSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('getMetadata', () => {
    it('returns files for valid file attachment URIs', async () => {
      const fileId1 = 'file-123';
      const fileId2 = 'file-456';
      const uri1 = createFileUri(fileId1);
      const uri2 = createFileUri(fileId2);
      const compositeId1 = buildCompositeId({ pubky: TEST_PUBKY, id: fileId1 });
      const compositeId2 = buildCompositeId({ pubky: TEST_PUBKY, id: fileId2 });

      const mockFiles = [
        createMockFile(compositeId1, 'file1.jpg', uri1),
        createMockFile(compositeId2, 'file2.png', uri2, { content_type: 'image/png', size: 200 }),
      ];

      vi.spyOn(LocalFileService, 'findByIds').mockResolvedValue(mockFiles);

      const result = await FileApplication.getMetadata({ fileAttachments: [uri1, uri2] });

      expect(LocalFileService.findByIds).toHaveBeenCalledWith([compositeId1, compositeId2]);
      expect(result).toEqual(mockFiles);
    });

    it('filters out invalid URIs and only queries valid ones', async () => {
      const fileId = 'file-123';
      const validUri = createFileUri(fileId);
      const invalidUri = 'not-a-valid-uri';
      const compositeId = buildCompositeId({ pubky: TEST_PUBKY, id: fileId });

      const mockFiles = [createMockFile(compositeId, 'file1.jpg', validUri)];

      vi.spyOn(LocalFileService, 'findByIds').mockResolvedValue(mockFiles);

      const result = await FileApplication.getMetadata({ fileAttachments: [validUri, invalidUri] });

      expect(LocalFileService.findByIds).toHaveBeenCalledWith([compositeId]);
      expect(result).toEqual(mockFiles);
    });

    it('returns empty array when no valid URIs are provided', async () => {
      vi.spyOn(LocalFileService, 'findByIds').mockResolvedValue([]);

      const result = await FileApplication.getMetadata({ fileAttachments: ['invalid-uri-1', 'invalid-uri-2'] });

      expect(LocalFileService.findByIds).toHaveBeenCalledWith([]);
      expect(result).toEqual([]);
    });

    it('returns empty array when fileAttachments is empty', async () => {
      vi.spyOn(LocalFileService, 'findByIds').mockResolvedValue([]);

      const result = await FileApplication.getMetadata({ fileAttachments: [] });

      expect(LocalFileService.findByIds).toHaveBeenCalledWith([]);
      expect(result).toEqual([]);
    });

    it('propagates errors from LocalFileService', async () => {
      const fileId = 'file-123';
      const uri = createFileUri(fileId);
      const compositeId = buildCompositeId({ pubky: TEST_PUBKY, id: fileId });

      const error = new Error('Database query failed');
      vi.spyOn(LocalFileService, 'findByIds').mockRejectedValue(error);

      await expect(FileApplication.getMetadata({ fileAttachments: [uri] })).rejects.toThrow('Database query failed');
      expect(LocalFileService.findByIds).toHaveBeenCalledWith([compositeId]);
    });
  });

  describe('getAvatarUrl', () => {
    it('delegates to filesApi.getAvatarUrl', () => {
      const expectedUrl = 'https://cdn.example.com/avatar/encoded-pubky';

      vi.spyOn(filesApi, 'getAvatarUrl').mockReturnValue(expectedUrl);

      const result = FileApplication.getAvatarUrl(TEST_PUBKY);

      expect(filesApi.getAvatarUrl).toHaveBeenCalledWith(TEST_PUBKY, undefined);
      expect(result).toBe(expectedUrl);
    });
  });

  describe('getFileUrl', () => {
    it('parses composite ID and delegates to filesApi.getFileUrl', () => {
      const fileId = 'file-123';
      const compositeId = buildCompositeId({ pubky: TEST_PUBKY, id: fileId });
      const variant = FileVariant.SMALL;
      const expectedUrl = 'https://cdn.example.com/files/encoded-pubky/encoded-file-id/small';

      vi.spyOn(filesApi, 'getFileUrl').mockReturnValue(expectedUrl);

      const result = FileApplication.getFileUrl({ fileId: compositeId, variant });

      expect(filesApi.getFileUrl).toHaveBeenCalledWith({ pubky: TEST_PUBKY, file_id: fileId, variant });
      expect(result).toBe(expectedUrl);
    });

    it('propagates errors from parseCompositeId', async () => {
      const invalidCompositeId = 'invalid-id';
      const variant = FileVariant.FEED;

      (await spyOnParseCompositeId()).mockImplementation(() => {
        throw new Error(`Invalid composite id: ${invalidCompositeId}`);
      });

      expect(() => FileApplication.getFileUrl({ fileId: invalidCompositeId, variant })).toThrow(
        `Invalid composite id: ${invalidCompositeId}`,
      );
      expect(filesApi.getFileUrl).not.toHaveBeenCalled();
    });
  });

  describe('persistFiles', () => {
    it('returns early when fileAttachments is empty', async () => {
      const createManySpy = vi.spyOn(LocalFileService, 'createMany');

      await FileApplication.persistFiles([]);

      expect(createManySpy).not.toHaveBeenCalled();
    });

    it('handles urls as JSON string (from file details endpoint)', async () => {
      const fileId = 'file-123';
      const uri = createFileUri(fileId);
      const compositeId = buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.FILES });

      const fileAttachments = [
        {
          ...createMockFile('', 'file1.jpg', uri),
          urls: createMockUrls('feed1', 'main1', 'small1'),
        },
      ];

      const createManySpy = vi.spyOn(LocalFileService, 'createMany').mockResolvedValue(undefined);

      await FileApplication.persistFiles(asOpaque<NexusFileDetails[]>(fileAttachments));

      expect(createManySpy).toHaveBeenCalledWith({
        files: [{ ...fileAttachments[0], id: compositeId, urls: { feed: 'feed1', main: 'main1', small: 'small1' } }],
      });
    });

    it('handles urls as parsed object (from inline attachments_metadata)', async () => {
      const fileId = 'file-456';
      const uri = createFileUri(fileId);
      const compositeId = buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.FILES });

      const urlsObject = { feed: 'feed-url', main: 'main-url', small: 'small-url' };
      const fileAttachments: NexusFileDetails[] = [
        {
          ...createMockFile('', 'file2.png', uri),
          urls: urlsObject,
        },
      ];

      const createManySpy = vi.spyOn(LocalFileService, 'createMany').mockResolvedValue(undefined);

      await FileApplication.persistFiles(fileAttachments);

      expect(createManySpy).toHaveBeenCalledWith({
        files: [{ ...fileAttachments[0], id: compositeId, urls: urlsObject }],
      });
    });
  });

  describe('persistFiles', () => {
    it('returns early when fileAttachments is empty', async () => {
      const createManySpy = vi.spyOn(LocalFileService, 'createMany');

      await FileApplication.persistFiles([]);

      expect(createManySpy).not.toHaveBeenCalled();
    });

    it('handles urls as JSON string (from file details endpoint)', async () => {
      const fileId = 'file-123';
      const uri = createFileUri(fileId);
      const compositeId = buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.FILES });

      const fileAttachments = [
        {
          ...createMockFile('', 'file1.jpg', uri),
          urls: createMockUrls('feed1', 'main1', 'small1'),
        },
      ];

      const createManySpy = vi.spyOn(LocalFileService, 'createMany').mockResolvedValue(undefined);

      await FileApplication.persistFiles(asOpaque<NexusFileDetails[]>(fileAttachments));

      expect(createManySpy).toHaveBeenCalledWith({
        files: [{ ...fileAttachments[0], id: compositeId, urls: { feed: 'feed1', main: 'main1', small: 'small1' } }],
      });
    });

    it('handles urls as parsed object (from inline attachments_metadata)', async () => {
      const fileId = 'file-456';
      const uri = createFileUri(fileId);
      const compositeId = buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.FILES });

      const urlsObject = { feed: 'feed-url', main: 'main-url', small: 'small-url' };
      const fileAttachments: NexusFileDetails[] = [
        {
          ...createMockFile('', 'file2.png', uri),
          urls: urlsObject,
        },
      ];

      const createManySpy = vi.spyOn(LocalFileService, 'createMany').mockResolvedValue(undefined);

      await FileApplication.persistFiles(fileAttachments);

      expect(createManySpy).toHaveBeenCalledWith({
        files: [{ ...fileAttachments[0], id: compositeId, urls: urlsObject }],
      });
    });
  });

  describe('commitDelete', () => {
    it('deletes blob first, then file record, then local row when file exists locally', async () => {
      const fileId = 'file-123';
      const fileUri = createFileUri(fileId);
      const compositeId = buildCompositeId({ pubky: TEST_PUBKY, id: fileId });
      const blobUrl = 'pubky://user/blob/abc123';

      const mockFile = createMockFile(compositeId, 'file1.jpg', fileUri, { src: blobUrl });

      const deleteIdempotentSpy = vi.spyOn(HomeserverService, 'deleteIdempotent').mockResolvedValue(undefined);
      const plainDeleteSpy = vi.spyOn(HomeserverService, 'delete');
      const readSpy = vi.spyOn(LocalFileService, 'read').mockResolvedValue(mockFile);
      const hasOtherBlobReferenceSpy = vi.spyOn(LocalFileService, 'hasOtherBlobReference').mockResolvedValue(false);
      const deleteLocalSpy = vi.spyOn(LocalFileService, 'deleteById').mockResolvedValue(undefined);

      await FileApplication.commitDelete([fileUri]);

      // Verify deletion sequence: blob (shared-check first), then record
      expect(readSpy).toHaveBeenCalledWith(compositeId);
      expect(hasOtherBlobReferenceSpy).toHaveBeenCalledWith({
        blobSrc: blobUrl,
        excludeFileIds: new Set([compositeId]),
      });
      expect(deleteIdempotentSpy).toHaveBeenNthCalledWith(1, blobUrl); // Delete blob
      expect(deleteIdempotentSpy).toHaveBeenNthCalledWith(2, fileUri); // Delete record
      expect(deleteLocalSpy).toHaveBeenCalledWith(compositeId);
      // All homeserver deletes go through the idempotent wrapper
      expect(plainDeleteSpy).not.toHaveBeenCalled();

      // Verify invocation order: the blob is deleted BEFORE the record — if
      // the blob delete fails, the surviving record still points at it, so a
      // retry can find it again (record-first would orphan the blob)
      expect(readSpy.mock.invocationCallOrder[0]).toBeLessThan(deleteIdempotentSpy.mock.invocationCallOrder[0]);
      expect(deleteIdempotentSpy.mock.invocationCallOrder[0]).toBeLessThan(
        deleteIdempotentSpy.mock.invocationCallOrder[1],
      );
      expect(deleteIdempotentSpy.mock.invocationCallOrder[1]).toBeLessThan(deleteLocalSpy.mock.invocationCallOrder[0]);
    });

    it('fetches from homeserver, then deletes blob and record when file not in local storage', async () => {
      const fileId = 'file-123';
      const fileUri = createFileUri(fileId);
      const compositeId = buildCompositeId({ pubky: TEST_PUBKY, id: fileId });
      const blobUrl = 'pubky://user/blob/abc123';

      const deleteIdempotentSpy = vi.spyOn(HomeserverService, 'deleteIdempotent').mockResolvedValue(undefined);
      const readSpy = vi.spyOn(LocalFileService, 'read').mockResolvedValue(null);
      const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(asOpaque<void>({ src: blobUrl }));
      const deleteLocalSpy = vi.spyOn(LocalFileService, 'deleteById');

      await FileApplication.commitDelete([fileUri]);

      // Verify deletion sequence
      expect(readSpy).toHaveBeenCalledWith(compositeId);
      expect(requestSpy).toHaveBeenCalledWith({ method: HttpMethod.GET, url: fileUri }); // Fetch from homeserver
      expect(deleteIdempotentSpy).toHaveBeenNthCalledWith(1, blobUrl); // Delete blob
      expect(deleteIdempotentSpy).toHaveBeenNthCalledWith(2, fileUri); // Delete record
      expect(deleteLocalSpy).not.toHaveBeenCalled(); // No local deletion in fallback path

      // Verify invocation order: the fallback GET resolves the blob src first,
      // then the blob is deleted BEFORE the record
      expect(readSpy.mock.invocationCallOrder[0]).toBeLessThan(requestSpy.mock.invocationCallOrder[0]);
      expect(requestSpy.mock.invocationCallOrder[0]).toBeLessThan(deleteIdempotentSpy.mock.invocationCallOrder[0]);
      expect(deleteIdempotentSpy.mock.invocationCallOrder[0]).toBeLessThan(
        deleteIdempotentSpy.mock.invocationCallOrder[1],
      );
    });

    it('handles multiple file deletions in parallel', async () => {
      const fileId1 = 'file-123';
      const fileId2 = 'file-456';
      const uri1 = createFileUri(fileId1);
      const uri2 = createFileUri(fileId2);
      const compositeId1 = buildCompositeId({ pubky: TEST_PUBKY, id: fileId1 });
      const compositeId2 = buildCompositeId({ pubky: TEST_PUBKY, id: fileId2 });
      const blobUrl1 = 'pubky://user/blob/abc123';
      const blobUrl2 = 'pubky://user/blob/def456';

      const mockFile1 = createMockFile(compositeId1, 'file1.jpg', uri1, { src: blobUrl1 });
      const mockFile2 = createMockFile(compositeId2, 'file2.png', uri2, { src: blobUrl2 });

      const deleteIdempotentSpy = vi.spyOn(HomeserverService, 'deleteIdempotent').mockResolvedValue(undefined);
      const readSpy = vi
        .spyOn(LocalFileService, 'read')
        .mockResolvedValueOnce(mockFile1)
        .mockResolvedValueOnce(mockFile2);
      const deleteLocalSpy = vi.spyOn(LocalFileService, 'deleteById').mockResolvedValue(undefined);

      await FileApplication.commitDelete([uri1, uri2]);

      // Verify both files were processed
      expect(deleteIdempotentSpy).toHaveBeenCalledWith(uri1);
      expect(deleteIdempotentSpy).toHaveBeenCalledWith(uri2);
      expect(deleteIdempotentSpy).toHaveBeenCalledWith(blobUrl1);
      expect(deleteIdempotentSpy).toHaveBeenCalledWith(blobUrl2);
      expect(readSpy).toHaveBeenCalledWith(compositeId1);
      expect(readSpy).toHaveBeenCalledWith(compositeId2);
      expect(deleteLocalSpy).toHaveBeenCalledWith(compositeId1);
      expect(deleteLocalSpy).toHaveBeenCalledWith(compositeId2);
    });

    it('skips deletion gracefully when composite ID cannot be built from invalid URI', async () => {
      const invalidUri = 'not-a-valid-uri';

      (await spyOnBuildCompositeIdFromPubkyUri()).mockReturnValue(null);
      const deleteIdempotentSpy = vi.spyOn(HomeserverService, 'deleteIdempotent').mockResolvedValue(undefined);
      const findByIdSpy = vi.spyOn(FileDetailsModel, 'findById');
      const deleteLocalSpy = vi.spyOn(LocalFileService, 'deleteById');

      await FileApplication.commitDelete([invalidUri]);

      // Verify record deletion still happens
      expect(deleteIdempotentSpy).toHaveBeenCalledWith(invalidUri);
      // But no further operations
      expect(findByIdSpy).not.toHaveBeenCalled();
      expect(deleteLocalSpy).not.toHaveBeenCalled();
    });

    it('propagates errors when homeserver blob deletion fails, leaving the record intact', async () => {
      const fileId = 'file-123';
      const fileUri = createFileUri(fileId);
      const compositeId = buildCompositeId({ pubky: TEST_PUBKY, id: fileId });
      const blobUrl = 'pubky://user/blob/abc123';

      const mockFile = createMockFile(compositeId, 'file1.jpg', fileUri, { src: blobUrl });

      const error = new Error('Blob deletion failed');
      (await spyOnBuildCompositeIdFromPubkyUri()).mockReturnValue(compositeId);
      const deleteIdempotentSpy = vi.spyOn(HomeserverService, 'deleteIdempotent').mockImplementation((uri: string) => {
        return uri === blobUrl ? Promise.reject(error) : Promise.resolve(undefined);
      });
      const readSpy = vi.spyOn(LocalFileService, 'read').mockResolvedValue(mockFile);
      const deleteLocalSpy = vi.spyOn(LocalFileService, 'deleteById');

      await expect(FileApplication.commitDelete([fileUri])).rejects.toThrow('Blob deletion failed');

      expect(readSpy).toHaveBeenCalledWith(compositeId);
      // Blob delete failed, so the record (the only pointer to the blob) and
      // the local row survive for a later retry
      expect(deleteIdempotentSpy).toHaveBeenCalledTimes(1);
      expect(deleteIdempotentSpy).toHaveBeenCalledWith(blobUrl);
      expect(deleteLocalSpy).not.toHaveBeenCalled();
    });

    it('propagates errors when homeserver record deletion fails after the blob delete', async () => {
      const fileId = 'file-123';
      const fileUri = createFileUri(fileId);
      const compositeId = buildCompositeId({ pubky: TEST_PUBKY, id: fileId });
      const blobUrl = 'pubky://user/blob/abc123';

      const mockFile = createMockFile(compositeId, 'file1.jpg', fileUri, { src: blobUrl });

      const error = new Error('Record deletion failed');
      (await spyOnBuildCompositeIdFromPubkyUri()).mockReturnValue(compositeId);
      const deleteIdempotentSpy = vi.spyOn(HomeserverService, 'deleteIdempotent').mockImplementation((uri: string) => {
        return uri === fileUri ? Promise.reject(error) : Promise.resolve(undefined);
      });
      vi.spyOn(LocalFileService, 'read').mockResolvedValue(mockFile);
      const deleteLocalSpy = vi.spyOn(LocalFileService, 'deleteById');

      await expect(FileApplication.commitDelete([fileUri])).rejects.toThrow('Record deletion failed');

      expect(deleteIdempotentSpy).toHaveBeenNthCalledWith(1, blobUrl);
      expect(deleteIdempotentSpy).toHaveBeenNthCalledWith(2, fileUri);
      expect(deleteLocalSpy).not.toHaveBeenCalled(); // Not reached due to error
    });

    it('propagates errors when local deletion fails', async () => {
      const fileId = 'file-123';
      const fileUri = createFileUri(fileId);
      const compositeId = buildCompositeId({ pubky: TEST_PUBKY, id: fileId });
      const blobUrl = 'pubky://user/blob/abc123';

      const mockFile = createMockFile(compositeId, 'file1.jpg', fileUri, { src: blobUrl });

      const error = new Error('Local deletion failed');
      (await spyOnBuildCompositeIdFromPubkyUri()).mockReturnValue(compositeId);
      vi.spyOn(HomeserverService, 'deleteIdempotent').mockResolvedValue(undefined);
      vi.spyOn(LocalFileService, 'read').mockResolvedValue(mockFile);
      const deleteLocalSpy = vi.spyOn(LocalFileService, 'deleteById').mockRejectedValue(error);

      await expect(FileApplication.commitDelete([fileUri])).rejects.toThrow('Local deletion failed');

      expect(HomeserverService.deleteIdempotent).toHaveBeenNthCalledWith(1, blobUrl);
      expect(LocalFileService.read).toHaveBeenCalledWith(compositeId);
      expect(HomeserverService.deleteIdempotent).toHaveBeenNthCalledWith(2, fileUri);
      expect(deleteLocalSpy).toHaveBeenCalledWith(compositeId);
    });

    it('propagates errors when fetching from homeserver fails in fallback path', async () => {
      const fileId = 'file-123';
      const fileUri = createFileUri(fileId);
      const compositeId = buildCompositeId({ pubky: TEST_PUBKY, id: fileId });

      const error = new Error('Homeserver fetch failed');
      (await spyOnBuildCompositeIdFromPubkyUri()).mockReturnValue(compositeId);
      vi.spyOn(HomeserverService, 'deleteIdempotent').mockResolvedValue(undefined);
      vi.spyOn(LocalFileService, 'read').mockResolvedValue(null);
      const requestSpy = vi.spyOn(HomeserverService, 'request').mockRejectedValue(error);

      await expect(FileApplication.commitDelete([fileUri])).rejects.toThrow('Homeserver fetch failed');

      expect(LocalFileService.read).toHaveBeenCalledWith(compositeId);
      expect(requestSpy).toHaveBeenCalledWith({ method: HttpMethod.GET, url: fileUri });
      // Nothing deleted: the blob src could not be resolved, so the record is
      // preserved (deleting it would orphan the blob); a retry can succeed later
      expect(HomeserverService.deleteIdempotent).not.toHaveBeenCalled();
    });

    it('resolves without deleting anything when the fallback GET 404s (record and local row both gone)', async () => {
      const fileId = 'file-123';
      const fileUri = createFileUri(fileId);
      const compositeId = buildCompositeId({ pubky: TEST_PUBKY, id: fileId });

      // Built via dynamic import so the AppError comes from the same module
      // graph as the re-imported FileApplication (the beforeEach
      // `vi.resetModules()` would otherwise break its `instanceof` check)
      const { Err } = await import('@/libs/error/error.factories');
      const notFoundError = Err.client(ClientErrorCode.NOT_FOUND, 'Not found', {
        service: ErrorService.Homeserver,
        operation: 'request',
        context: { statusCode: HttpStatusCode.NOT_FOUND },
      });

      (await spyOnBuildCompositeIdFromPubkyUri()).mockReturnValue(compositeId);
      const deleteIdempotentSpy = vi.spyOn(HomeserverService, 'deleteIdempotent').mockResolvedValue(undefined);
      vi.spyOn(LocalFileService, 'read').mockResolvedValue(null);
      vi.spyOn(HomeserverService, 'request').mockRejectedValue(notFoundError);

      await expect(FileApplication.commitDelete([fileUri])).resolves.toBeUndefined();

      expect(deleteIdempotentSpy).not.toHaveBeenCalled();
    });

    describe('shared blobs (content-addressed, referenced by other cached records)', () => {
      it('skips the blob delete but still deletes the record and local row when the blob is shared', async () => {
        const fileId = 'file-123';
        const fileUri = createFileUri(fileId);
        const compositeId = buildCompositeId({ pubky: TEST_PUBKY, id: fileId });
        const blobUrl = 'pubky://user/blob/abc123';

        const mockFile = createMockFile(compositeId, 'file1.jpg', fileUri, { src: blobUrl });

        const deleteIdempotentSpy = vi.spyOn(HomeserverService, 'deleteIdempotent').mockResolvedValue(undefined);
        vi.spyOn(LocalFileService, 'read').mockResolvedValue(mockFile);
        vi.spyOn(LocalFileService, 'hasOtherBlobReference').mockResolvedValue(true);
        const deleteLocalSpy = vi.spyOn(LocalFileService, 'deleteById').mockResolvedValue(undefined);

        await FileApplication.commitDelete([fileUri]);

        // Blob survives (another cached record still points at it); the record
        // and local row are removed as usual
        expect(deleteIdempotentSpy).not.toHaveBeenCalledWith(blobUrl);
        expect(deleteIdempotentSpy).toHaveBeenCalledWith(fileUri);
        expect(deleteIdempotentSpy).toHaveBeenCalledTimes(1);
        expect(deleteLocalSpy).toHaveBeenCalledWith(compositeId);
      });

      it('excludes every record in the batch from the shared-reference check', async () => {
        const fileId1 = 'file-123';
        const fileId2 = 'file-456';
        const uri1 = createFileUri(fileId1);
        const uri2 = createFileUri(fileId2);
        const compositeId1 = buildCompositeId({ pubky: TEST_PUBKY, id: fileId1 });
        const compositeId2 = buildCompositeId({ pubky: TEST_PUBKY, id: fileId2 });
        // Byte-identical uploads share the same content-addressed blob
        const sharedBlobUrl = 'pubky://user/blob/shared123';

        const mockFile1 = createMockFile(compositeId1, 'file1.jpg', uri1, { src: sharedBlobUrl });
        const mockFile2 = createMockFile(compositeId2, 'file2.jpg', uri2, { src: sharedBlobUrl });

        vi.spyOn(HomeserverService, 'deleteIdempotent').mockResolvedValue(undefined);
        vi.spyOn(LocalFileService, 'read').mockResolvedValueOnce(mockFile1).mockResolvedValueOnce(mockFile2);
        const hasOtherBlobReferenceSpy = vi.spyOn(LocalFileService, 'hasOtherBlobReference').mockResolvedValue(false);
        vi.spyOn(LocalFileService, 'deleteById').mockResolvedValue(undefined);

        await FileApplication.commitDelete([uri1, uri2]);

        // Both rows being deleted in this batch are excluded — otherwise each
        // sibling would see the other and neither blob would ever be deleted
        expect(hasOtherBlobReferenceSpy).toHaveBeenCalledTimes(2);
        for (const call of hasOtherBlobReferenceSpy.mock.calls) {
          expect(call[0]).toEqual({ blobSrc: sharedBlobUrl, excludeFileIds: new Set([compositeId1, compositeId2]) });
        }
      });
    });
  });

  describe('commitDeleteUploaded', () => {
    const blobUrl = 'pubky://user/blob/upload123';
    const fileUrl = 'pubky://user/pub/pubky.app/files/upload123';
    const compositeId = 'user:upload123';

    const createUploadedAttachment = (blob: string = blobUrl, file: string = fileUrl) => ({
      blobResult: createMockBlobResult(blob),
      fileResult: createMockFileResult(file),
    });

    it('deletes blob then record by their known URLs and removes the local row', async () => {
      const attachment = createUploadedAttachment();

      const deleteIdempotentSpy = vi.spyOn(HomeserverService, 'deleteIdempotent').mockResolvedValue(undefined);
      const plainDeleteSpy = vi.spyOn(HomeserverService, 'delete');
      const requestSpy = vi.spyOn(HomeserverService, 'request');
      const readSpy = vi.spyOn(LocalFileService, 'read');
      const hasOtherBlobReferenceSpy = vi.spyOn(LocalFileService, 'hasOtherBlobReference').mockResolvedValue(false);
      const deleteLocalSpy = vi.spyOn(LocalFileService, 'deleteById').mockResolvedValue(undefined);

      await FileApplication.commitDeleteUploaded([attachment]);

      expect(hasOtherBlobReferenceSpy).toHaveBeenCalledWith({
        blobSrc: blobUrl,
        excludeFileIds: new Set([compositeId]),
      });
      expect(deleteIdempotentSpy).toHaveBeenNthCalledWith(1, blobUrl); // Delete blob
      expect(deleteIdempotentSpy).toHaveBeenNthCalledWith(2, fileUrl); // Delete record
      expect(deleteLocalSpy).toHaveBeenCalledWith(compositeId);

      // The URLs are already known from the normalized upload results — no
      // record GET (or local read) is ever needed, which is what lets this
      // clean up a partial upload whose record PUT failed
      expect(requestSpy).not.toHaveBeenCalled();
      expect(readSpy).not.toHaveBeenCalled();
      expect(plainDeleteSpy).not.toHaveBeenCalled();

      // Blob before record (retriability), record before local row
      expect(deleteIdempotentSpy.mock.invocationCallOrder[0]).toBeLessThan(
        deleteIdempotentSpy.mock.invocationCallOrder[1],
      );
      expect(deleteIdempotentSpy.mock.invocationCallOrder[1]).toBeLessThan(deleteLocalSpy.mock.invocationCallOrder[0]);
    });

    it('skips the blob delete but still deletes the record when the blob is shared', async () => {
      const attachment = createUploadedAttachment();

      const deleteIdempotentSpy = vi.spyOn(HomeserverService, 'deleteIdempotent').mockResolvedValue(undefined);
      vi.spyOn(LocalFileService, 'hasOtherBlobReference').mockResolvedValue(true);
      const deleteLocalSpy = vi.spyOn(LocalFileService, 'deleteById').mockResolvedValue(undefined);

      await FileApplication.commitDeleteUploaded([attachment]);

      expect(deleteIdempotentSpy).not.toHaveBeenCalledWith(blobUrl);
      expect(deleteIdempotentSpy).toHaveBeenCalledWith(fileUrl);
      expect(deleteIdempotentSpy).toHaveBeenCalledTimes(1);
      expect(deleteLocalSpy).toHaveBeenCalledWith(compositeId);
    });

    it('excludes every uploaded record in the batch from the shared-reference check', async () => {
      const attachment1 = createUploadedAttachment('pubky://user/blob/up1', 'pubky://user/pub/pubky.app/files/up1');
      const attachment2 = createUploadedAttachment('pubky://user/blob/up2', 'pubky://user/pub/pubky.app/files/up2');

      vi.spyOn(HomeserverService, 'deleteIdempotent').mockResolvedValue(undefined);
      const hasOtherBlobReferenceSpy = vi.spyOn(LocalFileService, 'hasOtherBlobReference').mockResolvedValue(false);
      vi.spyOn(LocalFileService, 'deleteById').mockResolvedValue(undefined);

      await FileApplication.commitDeleteUploaded([attachment1, attachment2]);

      expect(hasOtherBlobReferenceSpy).toHaveBeenCalledTimes(2);
      for (const call of hasOtherBlobReferenceSpy.mock.calls) {
        expect(call[0].excludeFileIds).toEqual(new Set(['user:up1', 'user:up2']));
      }
    });

    it('still deletes the homeserver resources when the record URL cannot be parsed to a local row id', async () => {
      const unparsableFileUrl = 'not-a-valid-uri';
      const attachment = createUploadedAttachment(blobUrl, unparsableFileUrl);

      const deleteIdempotentSpy = vi.spyOn(HomeserverService, 'deleteIdempotent').mockResolvedValue(undefined);
      const deleteLocalSpy = vi.spyOn(LocalFileService, 'deleteById');

      await FileApplication.commitDeleteUploaded([attachment]);

      expect(deleteIdempotentSpy).toHaveBeenNthCalledWith(1, blobUrl);
      expect(deleteIdempotentSpy).toHaveBeenNthCalledWith(2, unparsableFileUrl);
      // No composite id → no local row to delete (there may be none anyway
      // when the rollback fires before local persistence)
      expect(deleteLocalSpy).not.toHaveBeenCalled();
    });

    it('propagates errors when the blob deletion fails, leaving the record for a retry', async () => {
      const attachment = createUploadedAttachment();

      const error = new Error('Blob deletion failed');
      const deleteIdempotentSpy = vi.spyOn(HomeserverService, 'deleteIdempotent').mockImplementation((uri: string) => {
        return uri === blobUrl ? Promise.reject(error) : Promise.resolve(undefined);
      });
      const deleteLocalSpy = vi.spyOn(LocalFileService, 'deleteById');

      await expect(FileApplication.commitDeleteUploaded([attachment])).rejects.toThrow('Blob deletion failed');

      expect(deleteIdempotentSpy).toHaveBeenCalledTimes(1);
      expect(deleteIdempotentSpy).toHaveBeenCalledWith(blobUrl);
      expect(deleteLocalSpy).not.toHaveBeenCalled();
    });
  });
});
