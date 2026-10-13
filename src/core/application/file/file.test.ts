import { buildFile } from 'pubky-social-specs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { IMAGE_UPLOAD_SIZE_LIMIT_KIND_CONTEXT_KEY } from '@/libs/image/imageUploadSizeLimit';
import { stripImageMetadata } from '@/libs/image/stripImageMetadata';
import { CompositeIdDomain, type Pubky } from '@/models/models.types';
import { buildCompositeId, buildCompositeIdFromPubkyUri } from '@/models/models.utils';
import { FileNormalizer } from '@/pipes/file/file.normalizer';
import type { TFileAttachmentResult } from '@/pipes/file/file.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalFileService } from '@/services/local/file/file';
import { filesApi } from '@/services/nexus/file/file.api';
import { FileVariant } from '@/services/nexus/file/file.types';
import type { NexusFileDetails } from '@/services/nexus/nexus.types';
import { asOpaque } from '@/test-utils/type-assertions';

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
    isReferencedElsewhere: vi.fn(),
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

const VALID_OWNER = 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy' as Pubky;

/** A real upload: media built by the package from its bytes. */
const createAttachment = (byte = 1, type = 'image/png'): TFileAttachmentResult => {
  const bytes = Uint8Array.of(byte);
  return { media: buildFile(VALID_OWNER, { bytes, type }), bytes, name: `photo-${byte}.png`, contentType: type };
};

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();

  ({ FileApplication } = await import('./file'));

  // Default: no other cached post references the media, so deletions proceed
  vi.mocked(LocalFileService.isReferencedElsewhere).mockResolvedValue(false);
});

describe('FileApplication', () => {
  describe('toFileAttachment', () => {
    it('sanitizes file before normalizing it', async () => {
      const rawFile = new File(['raw'], 'photo.jpg', { type: 'image/jpeg' });
      const sanitizedFile = new File(['sanitized'], 'obfuscated.jpg', { type: 'image/jpeg' });
      const fileAttachment = createAttachment();

      vi.mocked(stripImageMetadata).mockResolvedValueOnce(sanitizedFile);
      vi.mocked(FileNormalizer.toFileAttachment).mockReturnValueOnce(fileAttachment);

      const result = await FileApplication.toFileAttachment({ file: rawFile, pubky: TEST_PUBKY });

      expect(stripImageMetadata).toHaveBeenCalledWith(rawFile);
      expect(FileNormalizer.toFileAttachment).toHaveBeenCalledWith({
        file: sanitizedFile,
        // The id `hashMedia` reads from the sanitized file, as buildFile would derive it
        mediaId: buildFile(VALID_OWNER, { bytes: new TextEncoder().encode('sanitized'), type: 'image/jpeg' }).id,
        blobData: expect.toSatisfy(ArrayBuffer.isView),
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
    it('uploads the media bytes and then persists the local row', async () => {
      const attachment = createAttachment();
      const putBlobSpy = vi.spyOn(HomeserverService, 'putBlob').mockResolvedValue(undefined);
      const createSpy = vi.spyOn(LocalFileService, 'create').mockResolvedValue(undefined);

      await FileApplication.commitCreate({ fileAttachments: [attachment] });

      expect(putBlobSpy).toHaveBeenCalledExactlyOnceWith({ url: attachment.media.url, blob: attachment.bytes });
      expect(createSpy).toHaveBeenCalledWith(attachment);
      expect(putBlobSpy.mock.invocationCallOrder[0]).toBeLessThan(createSpy.mock.invocationCallOrder[0]);
    });

    it('propagates an upload failure without persisting', async () => {
      vi.spyOn(HomeserverService, 'putBlob').mockRejectedValueOnce(new Error('upload failed'));
      const createSpy = vi.spyOn(LocalFileService, 'create');

      await expect(FileApplication.commitCreate({ fileAttachments: [createAttachment()] })).rejects.toThrow(
        'upload failed',
      );
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('waits for sibling uploads to settle before rejecting on a partial failure', async () => {
      let releaseSlow!: () => void;
      const [failing, slow] = [createAttachment(1), createAttachment(2)];
      vi.spyOn(HomeserverService, 'putBlob').mockImplementation(({ url }) =>
        url === failing.media.url
          ? Promise.reject(new Error('first failed'))
          : new Promise<undefined>((resolve) => {
              releaseSlow = () => resolve(undefined);
            }),
      );
      const createSpy = vi.spyOn(LocalFileService, 'create').mockResolvedValue(undefined);

      let settled = false;
      const commit = FileApplication.commitCreate({ fileAttachments: [failing, slow] }).finally(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);

      releaseSlow();
      await expect(commit).rejects.toThrow('first failed');
      expect(createSpy).toHaveBeenCalledExactlyOnceWith(slow);
    });

    it('propagates errors when LocalFileService.create fails', async () => {
      vi.spyOn(HomeserverService, 'putBlob').mockResolvedValue(undefined);
      vi.spyOn(LocalFileService, 'create').mockRejectedValue(new Error('db failed'));

      await expect(FileApplication.commitCreate({ fileAttachments: [createAttachment()] })).rejects.toThrow(
        'db failed',
      );
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
    it.each([{ uri: 'invalid-file-uri' }, { urls: '{invalid json' }])(
      'keeps valid attachments when a peer has malformed metadata: %j',
      async (invalid) => {
        const valid = createMockFile('', 'valid.png', createFileUri('valid'));
        const malformed = asOpaque<NexusFileDetails>({ ...valid, ...invalid });
        const createMany = vi.spyOn(LocalFileService, 'createMany').mockResolvedValue(undefined);
        await FileApplication.persistFiles([malformed, valid]);
        expect(createMany).toHaveBeenCalledWith({
          files: [
            {
              ...valid,
              id: buildCompositeId({ pubky: TEST_PUBKY, id: 'valid' }),
            },
          ],
        });
      },
    );

    it('propagates a storage failure so an incomplete refresh can retry', async () => {
      const failure = new Error('file storage unavailable');
      vi.spyOn(LocalFileService, 'createMany').mockRejectedValue(failure);
      await expect(
        FileApplication.persistFiles([createMockFile('', 'valid.png', createFileUri('valid'))]),
      ).rejects.toBe(failure);
    });

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
    it('deletes the media and its local row', async () => {
      const { media } = createAttachment();
      const deleteSpy = vi.spyOn(HomeserverService, 'deleteIdempotent').mockResolvedValue(undefined);
      const deleteLocalSpy = vi.spyOn(LocalFileService, 'deleteById').mockResolvedValue(undefined);

      await FileApplication.commitDelete([media.url], 'author:post');

      expect(LocalFileService.isReferencedElsewhere).toHaveBeenCalledWith({
        uri: media.url,
        excludePostId: 'author:post',
      });
      expect(deleteSpy).toHaveBeenCalledExactlyOnceWith(media.url);
      expect(deleteLocalSpy).toHaveBeenCalledWith(
        buildCompositeIdFromPubkyUri({ uri: media.url, domain: CompositeIdDomain.FILES }),
      );
    });

    it('keeps media another cached post still references: identical bytes share one URL', async () => {
      const { media } = createAttachment();
      vi.mocked(LocalFileService.isReferencedElsewhere).mockResolvedValue(true);
      const deleteSpy = vi.spyOn(HomeserverService, 'deleteIdempotent');

      await FileApplication.commitDelete([media.url]);

      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('leaves a 0.x file URI and an unparsable URI alone', async () => {
      const deleteSpy = vi.spyOn(HomeserverService, 'deleteIdempotent');

      await FileApplication.commitDelete([createFileUri('0035S78QPP4S0'), 'not-a-uri']);

      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('propagates a homeserver delete failure and keeps the local row', async () => {
      const { media } = createAttachment();
      vi.spyOn(HomeserverService, 'deleteIdempotent').mockRejectedValue(new Error('delete failed'));
      const deleteLocalSpy = vi.spyOn(LocalFileService, 'deleteById');

      await expect(FileApplication.commitDelete([media.url])).rejects.toThrow('delete failed');
      expect(deleteLocalSpy).not.toHaveBeenCalled();
    });
  });

  describe('commitDeleteUploaded', () => {
    it('deletes each freshly uploaded media by its URL', async () => {
      const attachments = [createAttachment(1), createAttachment(2)];
      const deleteSpy = vi.spyOn(HomeserverService, 'deleteIdempotent').mockResolvedValue(undefined);

      await FileApplication.commitDeleteUploaded(attachments);

      expect(deleteSpy.mock.calls).toEqual(attachments.map(({ media }) => [media.url]));
    });
  });
});
