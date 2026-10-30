import { buildFile } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    exists: vi.fn(),
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

const TEST_PUBKY = fakeOwner(1) as Pubky;
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

/** A 0.x File object URI, which this client no longer deletes. */
const createFileUri = (fileId: string, pubky: Pubky = TEST_PUBKY) => `pubky://${pubky}/pub/pubky.app/files/${fileId}`;

const createMockUrls = (feed: string = 'feed', main: string = 'main', small: string = 'small') =>
  JSON.stringify({ feed, main, small });

/** An upload as the normalizer returns it: v1 media named by the hash of its bytes. */
const createMockFileAttachment = (byte: number, name = `file-${byte}.png`): TFileAttachmentResult => {
  const bytes = new Uint8Array([byte]);
  return { media: buildFile(TEST_PUBKY, { bytes, type: 'image/png' }), bytes, name, contentType: 'image/png' };
};

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();

  ({ FileApplication } = await import('./file'));

  // Default: the homeserver does not hold the bytes yet, and no other cached post references them
  vi.mocked(HomeserverService.exists).mockResolvedValue(false);
  vi.mocked(LocalFileService.isReferencedElsewhere).mockResolvedValue(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FileApplication', () => {
  describe('toFileAttachment', () => {
    it('sanitizes the file, then hashes the cleaned bytes and normalizes with that id', async () => {
      const rawFile = new File(['raw'], 'photo.jpg', { type: 'image/jpeg' });
      const sanitizedFile = new File(['sanitized'], 'obfuscated.jpg', { type: 'image/jpeg' });
      const fileAttachment = createMockFileAttachment(1);

      vi.mocked(stripImageMetadata).mockResolvedValueOnce(sanitizedFile);
      vi.mocked(FileNormalizer.toFileAttachment).mockReturnValueOnce(fileAttachment);

      const result = await FileApplication.toFileAttachment({ file: rawFile, pubky: TEST_PUBKY });

      expect(stripImageMetadata).toHaveBeenCalledWith(rawFile);
      expect(FileNormalizer.toFileAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          file: sanitizedFile,
          mediaId: buildFile(TEST_PUBKY, { bytes: new TextEncoder().encode('sanitized'), type: 'image/jpeg' }).id,
          pubky: TEST_PUBKY,
        }),
      );
      // The bytes come from Node's realm under jsdom: compare their values, not the array class
      const [{ blobData }] = vi.mocked(FileNormalizer.toFileAttachment).mock.calls[0];
      expect(Array.from(blobData)).toEqual(Array.from(new TextEncoder().encode('sanitized')));
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
    it('checks whether the homeserver holds the bytes, PUTs them, then persists the row', async () => {
      const attachment = createMockFileAttachment(1);

      const existsSpy = vi.mocked(HomeserverService.exists).mockResolvedValue(false);
      const putBlobSpy = vi.mocked(HomeserverService.putBlob).mockResolvedValue(undefined);
      const createSpy = vi.mocked(LocalFileService.create).mockResolvedValue(undefined);

      await FileApplication.commitCreate({ fileAttachments: [attachment] });

      expect(existsSpy).toHaveBeenCalledWith(attachment.media.url);
      expect(putBlobSpy).toHaveBeenCalledWith({ url: attachment.media.url, blob: attachment.bytes });
      expect(createSpy).toHaveBeenCalledWith(attachment);
      expect(attachment.preexisting).toBe(false);
      expect(existsSpy.mock.invocationCallOrder[0]).toBeLessThan(putBlobSpy.mock.invocationCallOrder[0]);
      expect(putBlobSpy.mock.invocationCallOrder[0]).toBeLessThan(createSpy.mock.invocationCallOrder[0]);
    });

    it('marks an upload whose bytes the homeserver already holds as preexisting, and still PUTs it', async () => {
      const attachment = createMockFileAttachment(1);
      vi.mocked(HomeserverService.exists).mockResolvedValue(true);
      vi.mocked(HomeserverService.putBlob).mockResolvedValue(undefined);
      vi.mocked(LocalFileService.create).mockResolvedValue(undefined);

      await FileApplication.commitCreate({ fileAttachments: [attachment] });

      expect(attachment.preexisting).toBe(true);
      expect(HomeserverService.putBlob).toHaveBeenCalledTimes(1);
      expect(LocalFileService.create).toHaveBeenCalledWith(attachment);
    });

    it('propagates errors if the upload fails, without persisting the row', async () => {
      const attachment = createMockFileAttachment(1);
      vi.mocked(HomeserverService.putBlob).mockRejectedValueOnce(new Error('blob upload failed'));

      await expect(FileApplication.commitCreate({ fileAttachments: [attachment] })).rejects.toThrow(
        'blob upload failed',
      );
      expect(HomeserverService.putBlob).toHaveBeenCalledTimes(1);
      expect(LocalFileService.create).not.toHaveBeenCalled();
    });

    it('waits for sibling uploads to settle before rejecting on a partial failure', async () => {
      // On failure the callers sweep the whole batch — rejecting while a
      // sibling upload is still in flight would race the rollback against it
      const failing = createMockFileAttachment(1);
      const slow = createMockFileAttachment(2);

      let resolveSlow: () => void = () => undefined;
      const putBlobSpy = vi.mocked(HomeserverService.putBlob).mockImplementation(({ url }) => {
        if (url === failing.media.url) return Promise.reject(new Error('blob upload failed'));
        return new Promise((resolve) => {
          resolveSlow = () => resolve(undefined);
        });
      });
      const createSpy = vi.mocked(LocalFileService.create).mockResolvedValue(undefined);

      let settled = false;
      const pending = FileApplication.commitCreate({ fileAttachments: [failing, slow] }).catch((error: Error) => {
        settled = true;
        return error;
      });

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(putBlobSpy).toHaveBeenCalledTimes(2);
      expect(settled).toBe(false);

      resolveSlow();
      const error = await pending;

      expect(settled).toBe(true);
      expect((error as Error).message).toBe('blob upload failed');
      // The slow sibling completed its full chain before the rejection surfaced
      expect(createSpy).toHaveBeenCalledWith(slow);
    });

    it('uploads multiple files in parallel', async () => {
      const first = createMockFileAttachment(1);
      const second = createMockFileAttachment(2);
      vi.mocked(HomeserverService.putBlob).mockResolvedValue(undefined);
      vi.mocked(LocalFileService.create).mockResolvedValue(undefined);

      await FileApplication.commitCreate({ fileAttachments: [first, second] });

      expect(HomeserverService.putBlob).toHaveBeenCalledWith({ url: first.media.url, blob: first.bytes });
      expect(HomeserverService.putBlob).toHaveBeenCalledWith({ url: second.media.url, blob: second.bytes });
      expect(LocalFileService.create).toHaveBeenCalledWith(first);
      expect(LocalFileService.create).toHaveBeenCalledWith(second);
      expect(HomeserverService.putBlob).toHaveBeenCalledTimes(2);
    });

    it('propagates errors when LocalFileService.create fails', async () => {
      const attachment = createMockFileAttachment(1);
      vi.mocked(HomeserverService.putBlob).mockResolvedValue(undefined);
      vi.mocked(LocalFileService.create).mockRejectedValue(new Error('Local persistence failed'));

      await expect(FileApplication.commitCreate({ fileAttachments: [attachment] })).rejects.toThrow(
        'Local persistence failed',
      );
      expect(HomeserverService.putBlob).toHaveBeenCalledTimes(1);
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
    const media = (byte: number) => createMockFileAttachment(byte).media;

    it('deletes a v1 media file nothing else references, then its local row', async () => {
      const { url, id } = media(1);
      const compositeId = buildCompositeId({ pubky: TEST_PUBKY, id });
      const deleteIdempotentSpy = vi.mocked(HomeserverService.deleteIdempotent).mockResolvedValue(undefined);
      const deleteLocalSpy = vi.mocked(LocalFileService.deleteById).mockResolvedValue(undefined);

      await FileApplication.commitDelete([url], 'author:post');

      expect(LocalFileService.isReferencedElsewhere).toHaveBeenCalledWith({ uri: url, excludePostId: 'author:post' });
      expect(deleteIdempotentSpy).toHaveBeenCalledExactlyOnceWith(url);
      expect(HomeserverService.delete).not.toHaveBeenCalled();
      expect(deleteLocalSpy).toHaveBeenCalledWith(compositeId);
      expect(deleteIdempotentSpy.mock.invocationCallOrder[0]).toBeLessThan(deleteLocalSpy.mock.invocationCallOrder[0]);
    });

    it('keeps a file another cached post still references: media is content addressed', async () => {
      const { url } = media(1);
      vi.mocked(LocalFileService.isReferencedElsewhere).mockResolvedValue(true);

      await FileApplication.commitDelete([url]);

      expect(HomeserverService.deleteIdempotent).not.toHaveBeenCalled();
      expect(LocalFileService.deleteById).not.toHaveBeenCalled();
    });

    it('leaves a 0.x file URI and anything that is no media URI alone', async () => {
      await FileApplication.commitDelete([createFileUri('0035WQZH789FG'), 'https://example.com/a.png', 'not a uri']);

      expect(HomeserverService.deleteIdempotent).not.toHaveBeenCalled();
      expect(LocalFileService.deleteById).not.toHaveBeenCalled();
    });

    it('deletes several files in parallel, each once', async () => {
      const first = media(1);
      const second = media(2);
      vi.mocked(HomeserverService.deleteIdempotent).mockResolvedValue(undefined);
      vi.mocked(LocalFileService.deleteById).mockResolvedValue(undefined);

      await FileApplication.commitDelete([first.url, second.url, first.url]);

      expect(HomeserverService.deleteIdempotent).toHaveBeenCalledTimes(2);
      expect(HomeserverService.deleteIdempotent).toHaveBeenCalledWith(first.url);
      expect(HomeserverService.deleteIdempotent).toHaveBeenCalledWith(second.url);
    });

    it('propagates a homeserver deletion failure, leaving the local row for a retry', async () => {
      const { url } = media(1);
      vi.mocked(HomeserverService.deleteIdempotent).mockRejectedValue(new Error('Homeserver deletion failed'));

      await expect(FileApplication.commitDelete([url])).rejects.toThrow('Homeserver deletion failed');
      expect(LocalFileService.deleteById).not.toHaveBeenCalled();
    });

    it('propagates errors when local deletion fails', async () => {
      const { url } = media(1);
      vi.mocked(HomeserverService.deleteIdempotent).mockResolvedValue(undefined);
      vi.mocked(LocalFileService.deleteById).mockRejectedValue(new Error('Local deletion failed'));

      await expect(FileApplication.commitDelete([url])).rejects.toThrow('Local deletion failed');
    });
  });

  describe('commitDeleteUploaded', () => {
    it('deletes the files this batch put on the homeserver by their known URLs and removes the rows', async () => {
      const attachment = createMockFileAttachment(1);
      attachment.preexisting = false;
      vi.mocked(HomeserverService.deleteIdempotent).mockResolvedValue(undefined);
      vi.mocked(LocalFileService.deleteById).mockResolvedValue(undefined);

      await FileApplication.commitDeleteUploaded([attachment]);

      expect(HomeserverService.deleteIdempotent).toHaveBeenCalledExactlyOnceWith(attachment.media.url);
      expect(LocalFileService.deleteById).toHaveBeenCalledWith(
        buildCompositeId({ pubky: TEST_PUBKY, id: attachment.media.id }),
      );
      expect(LocalFileService.read).not.toHaveBeenCalled();
    });

    it('never deletes a file the homeserver held before the upload: another post may reference it', async () => {
      const preexisting = createMockFileAttachment(1);
      preexisting.preexisting = true;
      const fresh = createMockFileAttachment(2);
      fresh.preexisting = false;
      vi.mocked(HomeserverService.deleteIdempotent).mockResolvedValue(undefined);
      vi.mocked(LocalFileService.deleteById).mockResolvedValue(undefined);

      await FileApplication.commitDeleteUploaded([preexisting, fresh]);

      expect(HomeserverService.deleteIdempotent).toHaveBeenCalledExactlyOnceWith(fresh.media.url);
    });

    it('keeps a file another cached post references, as commitDelete does', async () => {
      const attachment = createMockFileAttachment(1);
      vi.mocked(LocalFileService.isReferencedElsewhere).mockResolvedValue(true);

      await FileApplication.commitDeleteUploaded([attachment]);

      expect(HomeserverService.deleteIdempotent).not.toHaveBeenCalled();
    });

    it('propagates errors when the deletion fails, leaving the row for a retry', async () => {
      const attachment = createMockFileAttachment(1);
      vi.mocked(HomeserverService.deleteIdempotent).mockRejectedValue(new Error('deletion failed'));

      await expect(FileApplication.commitDeleteUploaded([attachment])).rejects.toThrow('deletion failed');
      expect(LocalFileService.deleteById).not.toHaveBeenCalled();
    });
  });
});
