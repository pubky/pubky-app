import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BlobResult, FileResult } from 'pubky-app-specs';
import { asOpaque } from '@/test-utils/type-assertions';
import { HttpMethod } from '@/libs/http/http.types';
import { FileVariant } from '@/services/nexus/file/file.types';
import type { NexusFileDetails } from '@/services/nexus/nexus.types';
import { FileDetailsModel } from '@/models/file/fileDetails';
import { CompositeIdDomain, type Pubky } from '@/models/models.types';
import { buildCompositeId, buildCompositeIdFromPubkyUri } from '@/models/models.utils';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalFileService } from '@/services/local/file/file';
import { filesApi } from '@/services/nexus/file/file.api';
// Avoid pulling WASM-heavy deps from type-only modules
vi.mock('pubky-app-specs', () => ({
  getValidMimeTypes: () => ['image/jpeg', 'image/png'],
}));

// Mock HomeserverService methods
vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: {
    putBlob: vi.fn(),
    request: vi.fn(),
    delete: vi.fn(),
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
});

describe('FileApplication', () => {
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
    it('deletes file metadata, blob, and local record when file exists locally', async () => {
      const fileId = 'file-123';
      const fileUri = createFileUri(fileId);
      const compositeId = buildCompositeId({ pubky: TEST_PUBKY, id: fileId });
      const blobUrl = 'pubky://user/blob/abc123';

      const mockFile = createMockFile(compositeId, 'file1.jpg', fileUri, { src: blobUrl });

      const deleteMetadataSpy = vi.spyOn(HomeserverService, 'delete').mockResolvedValue(undefined);
      const readSpy = vi.spyOn(LocalFileService, 'read').mockResolvedValue(mockFile);
      const deleteLocalSpy = vi.spyOn(LocalFileService, 'deleteById').mockResolvedValue(undefined);

      await FileApplication.commitDelete([fileUri]);

      // Verify deletion sequence
      expect(deleteMetadataSpy).toHaveBeenNthCalledWith(1, fileUri); // Delete metadata
      expect(readSpy).toHaveBeenCalledWith(compositeId);
      expect(deleteMetadataSpy).toHaveBeenNthCalledWith(2, blobUrl); // Delete blob
      expect(deleteLocalSpy).toHaveBeenCalledWith(compositeId);

      // Verify invocation order
      expect(deleteMetadataSpy.mock.invocationCallOrder[0]).toBeLessThan(readSpy.mock.invocationCallOrder[0]);
      expect(readSpy.mock.invocationCallOrder[0]).toBeLessThan(deleteMetadataSpy.mock.invocationCallOrder[1]);
      expect(deleteMetadataSpy.mock.invocationCallOrder[1]).toBeLessThan(deleteLocalSpy.mock.invocationCallOrder[0]);
    });

    it('deletes file metadata, fetches from homeserver, and deletes blob when file not in local storage', async () => {
      const fileId = 'file-123';
      const fileUri = createFileUri(fileId);
      const compositeId = buildCompositeId({ pubky: TEST_PUBKY, id: fileId });
      const blobUrl = 'pubky://user/blob/abc123';

      const deleteMetadataSpy = vi.spyOn(HomeserverService, 'delete').mockResolvedValue(undefined);
      const readSpy = vi.spyOn(LocalFileService, 'read').mockResolvedValue(null);
      const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(asOpaque<void>({ src: blobUrl }));
      const deleteLocalSpy = vi.spyOn(LocalFileService, 'deleteById');

      await FileApplication.commitDelete([fileUri]);

      // Verify deletion sequence
      expect(deleteMetadataSpy).toHaveBeenNthCalledWith(1, fileUri); // Delete metadata
      expect(readSpy).toHaveBeenCalledWith(compositeId);
      expect(requestSpy).toHaveBeenCalledWith({ method: HttpMethod.GET, url: fileUri }); // Fetch from homeserver
      expect(deleteMetadataSpy).toHaveBeenNthCalledWith(2, blobUrl); // Delete blob
      expect(deleteLocalSpy).not.toHaveBeenCalled(); // No local deletion in fallback path

      // Verify invocation order
      expect(deleteMetadataSpy.mock.invocationCallOrder[0]).toBeLessThan(readSpy.mock.invocationCallOrder[0]);
      expect(readSpy.mock.invocationCallOrder[0]).toBeLessThan(requestSpy.mock.invocationCallOrder[0]);
      expect(requestSpy.mock.invocationCallOrder[0]).toBeLessThan(deleteMetadataSpy.mock.invocationCallOrder[1]);
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

      const deleteMetadataSpy = vi.spyOn(HomeserverService, 'delete').mockResolvedValue(undefined);
      const readSpy = vi
        .spyOn(LocalFileService, 'read')
        .mockResolvedValueOnce(mockFile1)
        .mockResolvedValueOnce(mockFile2);
      const deleteLocalSpy = vi.spyOn(LocalFileService, 'deleteById').mockResolvedValue(undefined);

      await FileApplication.commitDelete([uri1, uri2]);

      // Verify both files were processed
      expect(deleteMetadataSpy).toHaveBeenCalledWith(uri1);
      expect(deleteMetadataSpy).toHaveBeenCalledWith(uri2);
      expect(deleteMetadataSpy).toHaveBeenCalledWith(blobUrl1);
      expect(deleteMetadataSpy).toHaveBeenCalledWith(blobUrl2);
      expect(readSpy).toHaveBeenCalledWith(compositeId1);
      expect(readSpy).toHaveBeenCalledWith(compositeId2);
      expect(deleteLocalSpy).toHaveBeenCalledWith(compositeId1);
      expect(deleteLocalSpy).toHaveBeenCalledWith(compositeId2);
    });

    it('skips deletion gracefully when composite ID cannot be built from invalid URI', async () => {
      const invalidUri = 'not-a-valid-uri';

      (await spyOnBuildCompositeIdFromPubkyUri()).mockReturnValue(null);
      const deleteMetadataSpy = vi.spyOn(HomeserverService, 'delete').mockResolvedValue(undefined);
      const findByIdSpy = vi.spyOn(FileDetailsModel, 'findById');
      const deleteLocalSpy = vi.spyOn(LocalFileService, 'deleteById');

      await FileApplication.commitDelete([invalidUri]);

      // Verify metadata deletion still happens
      expect(deleteMetadataSpy).toHaveBeenCalledWith(invalidUri);
      // But no further operations
      expect(findByIdSpy).not.toHaveBeenCalled();
      expect(deleteLocalSpy).not.toHaveBeenCalled();
    });

    it('propagates errors when homeserver metadata deletion fails', async () => {
      const fileId = 'file-123';
      const fileUri = createFileUri(fileId);

      const error = new Error('Metadata deletion failed');
      const deleteMetadataSpy = vi.spyOn(HomeserverService, 'delete').mockRejectedValue(error);
      const findByIdSpy = vi.spyOn(FileDetailsModel, 'findById');
      const deleteLocalSpy = vi.spyOn(LocalFileService, 'deleteById');

      await expect(FileApplication.commitDelete([fileUri])).rejects.toThrow('Metadata deletion failed');

      expect(deleteMetadataSpy).toHaveBeenCalledWith(fileUri);
      expect(findByIdSpy).not.toHaveBeenCalled();
      expect(deleteLocalSpy).not.toHaveBeenCalled();
    });

    it('propagates errors when homeserver blob deletion fails', async () => {
      const fileId = 'file-123';
      const fileUri = createFileUri(fileId);
      const compositeId = buildCompositeId({ pubky: TEST_PUBKY, id: fileId });
      const blobUrl = 'pubky://user/blob/abc123';

      const mockFile = createMockFile(compositeId, 'file1.jpg', fileUri, { src: blobUrl });

      const error = new Error('Blob deletion failed');
      (await spyOnBuildCompositeIdFromPubkyUri()).mockReturnValue(compositeId);
      const deleteMetadataSpy = vi.spyOn(HomeserverService, 'delete').mockImplementation((uri: string) => {
        if (uri === fileUri) {
          return Promise.resolve(undefined); // Metadata deletion succeeds
        }
        if (uri === blobUrl) {
          return Promise.reject(error); // Blob deletion fails
        }
        return Promise.resolve(undefined);
      });
      const readSpy = vi.spyOn(LocalFileService, 'read').mockResolvedValue(mockFile);
      const deleteLocalSpy = vi.spyOn(LocalFileService, 'deleteById');

      await expect(FileApplication.commitDelete([fileUri])).rejects.toThrow('Blob deletion failed');

      expect(deleteMetadataSpy).toHaveBeenNthCalledWith(1, fileUri);
      expect(readSpy).toHaveBeenCalledWith(compositeId);
      expect(deleteMetadataSpy).toHaveBeenNthCalledWith(2, blobUrl);
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
      vi.spyOn(HomeserverService, 'delete').mockResolvedValue(undefined);
      vi.spyOn(LocalFileService, 'read').mockResolvedValue(mockFile);
      const deleteLocalSpy = vi.spyOn(LocalFileService, 'deleteById').mockRejectedValue(error);

      await expect(FileApplication.commitDelete([fileUri])).rejects.toThrow('Local deletion failed');

      expect(HomeserverService.delete).toHaveBeenNthCalledWith(1, fileUri);
      expect(LocalFileService.read).toHaveBeenCalledWith(compositeId);
      expect(HomeserverService.delete).toHaveBeenNthCalledWith(2, blobUrl);
      expect(deleteLocalSpy).toHaveBeenCalledWith(compositeId);
    });

    it('propagates errors when fetching from homeserver fails in fallback path', async () => {
      const fileId = 'file-123';
      const fileUri = createFileUri(fileId);
      const compositeId = buildCompositeId({ pubky: TEST_PUBKY, id: fileId });

      const error = new Error('Homeserver fetch failed');
      (await spyOnBuildCompositeIdFromPubkyUri()).mockReturnValue(compositeId);
      vi.spyOn(HomeserverService, 'delete').mockResolvedValue(undefined);
      vi.spyOn(LocalFileService, 'read').mockResolvedValue(null);
      const requestSpy = vi.spyOn(HomeserverService, 'request').mockRejectedValue(error);

      await expect(FileApplication.commitDelete([fileUri])).rejects.toThrow('Homeserver fetch failed');

      expect(HomeserverService.delete).toHaveBeenNthCalledWith(1, fileUri);
      expect(LocalFileService.read).toHaveBeenCalledWith(compositeId);
      expect(requestSpy).toHaveBeenCalledWith({ method: HttpMethod.GET, url: fileUri });
      expect(HomeserverService.delete).toHaveBeenCalledTimes(1); // Blob deletion not reached
    });
  });
});
