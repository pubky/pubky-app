import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BlobResult, FileResult } from 'pubky-app-specs';
import * as Core from '@/core';
import { LocalFileService } from './file';
import { asOpaque } from '@/test-utils';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';

describe('LocalFileService', () => {
  const testPubky: Core.Pubky = 'operrr8wsbpr3ue9d4qj41ge1kcc6r7fdiy6o3ugjrrhi4y77rd0';
  const testFileId1 = 'file-test-1';
  const testFileId2 = 'file-test-2';
  const compositeId1 = Core.buildCompositeId({ pubky: testPubky, id: testFileId1 });
  const compositeId2 = Core.buildCompositeId({ pubky: testPubky, id: testFileId2 });

  const createMockFile = (fileId: string, overrides?: Partial<Core.NexusFileDetails>): Core.NexusFileDetails => ({
    id: Core.buildCompositeId({ pubky: testPubky, id: fileId }),
    name: `test-file-${fileId}.jpg`,
    src: `https://example.com/files/${fileId}`,
    content_type: 'image/jpeg',
    size: 102400,
    created_at: 1234567890,
    indexed_at: 1234567890,
    metadata: {},
    owner_id: testPubky,
    uri: `pubky://${testPubky}/pub/pubky.app/files/${fileId}`,
    urls: {
      feed: `https://example.com/files/${fileId}-feed.jpg`,
      main: `https://example.com/files/${fileId}-main.jpg`,
      small: `https://example.com/files/${fileId}-small.jpg`,
    },
    ...overrides,
  });

  beforeEach(async () => {
    await Core.resetDatabase();
  });

  describe('createMany', () => {
    it('saves multiple files', async () => {
      const file1 = createMockFile(testFileId1);
      const file2 = createMockFile(testFileId2);
      await LocalFileService.createMany({ files: [file1, file2] });

      const [saved1, saved2] = await Promise.all([
        Core.FileDetailsModel.findById(compositeId1),
        Core.FileDetailsModel.findById(compositeId2),
      ]);

      expect(saved1?.name).toBe(file1.name);
      expect(saved2?.name).toBe(file2.name);
    });

    it('saves single file', async () => {
      const file = createMockFile(testFileId1);
      await LocalFileService.createMany({ files: [file] });

      const saved = await Core.FileDetailsModel.findById(compositeId1);
      expect(saved?.name).toBe(file.name);
      expect(saved?.content_type).toBe(file.content_type);
    });

    it('handles empty array', async () => {
      await expect(LocalFileService.createMany({ files: [] })).resolves.not.toThrow();
      expect(await Core.FileDetailsModel.table.toArray()).toHaveLength(0);
    });

    it('updates existing files', async () => {
      await LocalFileService.createMany({ files: [createMockFile(testFileId1, { name: 'original.jpg' })] });
      await LocalFileService.createMany({
        files: [createMockFile(testFileId1, { name: 'updated.jpg', size: 204800 })],
      });

      const saved = await Core.FileDetailsModel.findById(compositeId1);
      expect(saved?.name).toBe('updated.jpg');
      expect(saved?.size).toBe(204800);
    });

    it('saves all file properties', async () => {
      const file = createMockFile(testFileId1, {
        content_type: 'image/png',
        size: 204800,
        metadata: { width: '1920', height: '1080' },
      });
      await LocalFileService.createMany({ files: [file] });

      const saved = await Core.FileDetailsModel.findById(compositeId1);
      expect(saved?.content_type).toBe('image/png');
      expect(saved?.size).toBe(204800);
      expect(saved?.metadata).toEqual({ width: '1920', height: '1080' });
    });

    it('propagates database error when bulkSave fails', async () => {
      const file = createMockFile(testFileId1);
      const databaseError = Err.database(
        DatabaseErrorCode.WRITE_FAILED,
        'Failed to bulk save records in file_details',
        {
          service: ErrorService.Local,
          operation: 'bulkSave',
          context: { rowsCount: 1 },
        },
      );

      vi.spyOn(Core.FileDetailsModel, 'bulkSave').mockRejectedValueOnce(databaseError);

      await expect(LocalFileService.createMany({ files: [file] })).rejects.toMatchObject({
        category: ErrorCategory.Database,
        code: DatabaseErrorCode.WRITE_FAILED,
        message: 'Failed to bulk save records in file_details',
      });
    });

    it('propagates generic error when bulkSave throws', async () => {
      const file = createMockFile(testFileId1);
      const error = new Error('Unexpected database error');

      vi.spyOn(Core.FileDetailsModel, 'bulkSave').mockRejectedValueOnce(error);

      await expect(LocalFileService.createMany({ files: [file] })).rejects.toThrow('Unexpected database error');
    });
  });

  describe('findByIds', () => {
    it('returns files for valid IDs', async () => {
      const [file1, file2] = [createMockFile(testFileId1), createMockFile(testFileId2)];
      await LocalFileService.createMany({ files: [file1, file2] });

      const result = await LocalFileService.findByIds([compositeId1, compositeId2]);

      expect(result).toHaveLength(2);
      const ids = result.map((f) => f.id).sort();
      expect(ids).toEqual([compositeId1, compositeId2].sort());
      expect(result.find((f) => f.id === compositeId1)?.name).toBe(file1.name);
    });

    it('returns single file', async () => {
      const file = createMockFile(testFileId1);
      await LocalFileService.createMany({ files: [file] });

      const result = await LocalFileService.findByIds([compositeId1]);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(compositeId1);
      expect(result[0].name).toBe(file.name);
    });

    it('returns empty array for non-existent IDs', async () => {
      const nonExistentId = Core.buildCompositeId({ pubky: testPubky, id: 'non-existent' });
      expect(await LocalFileService.findByIds([nonExistentId])).toEqual([]);
    });

    it('returns only existing files when some IDs are missing', async () => {
      await LocalFileService.createMany({ files: [createMockFile(testFileId1)] });

      const nonExistentId = Core.buildCompositeId({ pubky: testPubky, id: 'non-existent' });
      const result = await LocalFileService.findByIds([compositeId1, nonExistentId]);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(compositeId1);
    });

    it('handles empty array', async () => {
      expect(await LocalFileService.findByIds([])).toEqual([]);
    });

    it('does not preserve order', async () => {
      await LocalFileService.createMany({ files: [createMockFile(testFileId1), createMockFile(testFileId2)] });

      const result = await LocalFileService.findByIds([compositeId2, compositeId1]);

      expect(result).toHaveLength(2);
      expect(result.map((f) => f.id).sort()).toEqual([compositeId1, compositeId2].sort());
    });

    it('returns all file properties', async () => {
      const file = createMockFile(testFileId1, {
        name: 'test-image.png',
        content_type: 'image/png',
        size: 512000,
        metadata: { custom: 'value' },
      });
      await LocalFileService.createMany({ files: [file] });

      const [found] = await LocalFileService.findByIds([compositeId1]);

      expect(found).toMatchObject({
        id: compositeId1,
        name: 'test-image.png',
        content_type: 'image/png',
        size: 512000,
        metadata: { custom: 'value' },
        owner_id: testPubky,
        uri: file.uri,
      });
    });
  });

  describe('create', () => {
    const createMockBlobResult = (url: string): BlobResult =>
      asOpaque<BlobResult>({
        blob: { data: new Uint8Array([1, 2, 3]) },
        meta: { url },
      });

    const createMockFileResult = (
      fileId: string,
      overrides?: Partial<{ name: string; content_type: string; size: number; created_at: string }>,
    ): FileResult => {
      const uri = `pubky://${testPubky}/pub/pubky.app/files/${fileId}`;
      return asOpaque<FileResult>({
        file: {
          name: overrides?.name || `test-file-${fileId}.jpg`,
          content_type: overrides?.content_type || 'image/jpeg',
          size: overrides?.size || 102400,
          created_at: overrides?.created_at || '1234567890',
        },
        meta: { url: uri },
      });
    };

    it('creates a file record with correct properties', async () => {
      const blobResult = createMockBlobResult(`pubky://${testPubky}/pub/pubky.app/blobs/blob-123`);
      const fileResult = createMockFileResult(testFileId1);

      await LocalFileService.create({ blobResult, fileResult });

      const saved = await Core.FileDetailsModel.findById(compositeId1);
      expect(saved).toBeDefined();
      expect(saved?.name).toBe(fileResult.file.name);
      expect(saved?.src).toBe(blobResult.meta.url);
      expect(saved?.uri).toBe(fileResult.meta.url);
      expect(saved?.content_type).toBe(fileResult.file.content_type);
      expect(saved?.size).toBe(fileResult.file.size);
      expect(saved?.created_at).toBe(Number(fileResult.file.created_at));
      expect(saved?.indexed_at).toBe(Number(fileResult.file.created_at));
      expect(saved?.metadata).toEqual({});
      expect(saved?.owner_id).toBe(testPubky);
      expect(saved?.urls).toEqual(Core.buildUrls(compositeId1));
    });

    it('creates file with all provided properties', async () => {
      const blobResult = createMockBlobResult(`pubky://${testPubky}/blobs/blob-456`);
      const fileResult = createMockFileResult(testFileId1, {
        name: 'custom-image.png',
        content_type: 'image/png',
        size: 204800,
        created_at: '9876543210',
      });

      await LocalFileService.create({ blobResult, fileResult });

      const saved = await Core.FileDetailsModel.findById(compositeId1);
      expect(saved?.name).toBe('custom-image.png');
      expect(saved?.content_type).toBe('image/png');
      expect(saved?.size).toBe(204800);
      expect(saved?.created_at).toBe(9876543210);
      expect(saved?.indexed_at).toBe(9876543210);
    });

    it('builds correct URLs from composite ID', async () => {
      const blobResult = createMockBlobResult(`pubky://${testPubky}/blobs/blob-789`);
      const fileResult = createMockFileResult(testFileId1);

      await LocalFileService.create({ blobResult, fileResult });

      const saved = await Core.FileDetailsModel.findById(compositeId1);
      const expectedUrls = Core.buildUrls(compositeId1);
      expect(saved?.urls).toEqual(expectedUrls);
      expect(saved?.urls.feed).toContain('/feed');
      expect(saved?.urls.main).toContain('/main');
      expect(saved?.urls.small).toContain('/small');
    });

    it('does not create file when URI is invalid', async () => {
      const blobResult = createMockBlobResult(`pubky://${testPubky}/blobs/blob-invalid`);
      const fileResult = asOpaque<FileResult>({
        file: {
          name: 'test.jpg',
          content_type: 'image/jpeg',
          size: 102400,
          created_at: '1234567890',
        },
        meta: { url: 'invalid-uri' },
      });

      await LocalFileService.create({ blobResult, fileResult });

      // Should not create any file since buildCompositeIdFromPubkyUri returns null
      const allFiles = await Core.FileDetailsModel.table.toArray();
      expect(allFiles).toHaveLength(0);
    });

    it('propagates database error when create fails', async () => {
      const blobResult = createMockBlobResult(`pubky://${testPubky}/blobs/blob-error`);
      const fileResult = createMockFileResult(testFileId1);
      const databaseError = Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to create record in file_details', {
        service: ErrorService.Local,
        operation: 'create',
        context: { error: 'Database constraint violation' },
      });

      vi.spyOn(Core.FileDetailsModel, 'create').mockRejectedValueOnce(databaseError);

      await expect(LocalFileService.create({ blobResult, fileResult })).rejects.toMatchObject({
        category: ErrorCategory.Database,
        code: DatabaseErrorCode.WRITE_FAILED,
        message: 'Failed to create record in file_details',
      });
    });

    it('propagates generic error when create throws', async () => {
      const blobResult = createMockBlobResult(`pubky://${testPubky}/blobs/blob-generic-error`);
      const fileResult = createMockFileResult(testFileId1);
      const error = new Error('Unexpected database error');

      vi.spyOn(Core.FileDetailsModel, 'create').mockRejectedValueOnce(error);

      await expect(LocalFileService.create({ blobResult, fileResult })).rejects.toThrow('Unexpected database error');
    });

    it('extracts owner_id from composite ID', async () => {
      const blobResult = createMockBlobResult(`pubky://${testPubky}/blobs/blob-owner`);
      const fileResult = createMockFileResult(testFileId1);

      await LocalFileService.create({ blobResult, fileResult });

      const saved = await Core.FileDetailsModel.findById(compositeId1);
      expect(saved?.owner_id).toBe(testPubky);
    });
  });
});
