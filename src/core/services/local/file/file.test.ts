import { buildFile } from 'pubky-social-specs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDatabase } from '@/database/franky/franky.helpers';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { FileDetailsModel } from '@/models/file/fileDetails';
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import { buildUrls } from '@/services/local/file/file.utils';
import type { NexusFileDetails } from '@/services/nexus/nexus.types';
import { LocalFileService } from './file';

describe('LocalFileService', () => {
  const testPubky: Pubky = 'operrr8wsbpr3ue9d4qj41ge1kcc6r7fdiy6o3ugjrrhi4y77rd0';
  const testFileId1 = 'file-test-1';
  const testFileId2 = 'file-test-2';
  const compositeId1 = buildCompositeId({ pubky: testPubky, id: testFileId1 });
  const compositeId2 = buildCompositeId({ pubky: testPubky, id: testFileId2 });

  const createMockFile = (fileId: string, overrides?: Partial<NexusFileDetails>): NexusFileDetails => ({
    id: buildCompositeId({ pubky: testPubky, id: fileId }),
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
    await resetDatabase();
  });

  describe('createMany', () => {
    it('saves multiple files', async () => {
      const file1 = createMockFile(testFileId1);
      const file2 = createMockFile(testFileId2);
      await LocalFileService.createMany({ files: [file1, file2] });

      const [saved1, saved2] = await Promise.all([
        FileDetailsModel.findById(compositeId1),
        FileDetailsModel.findById(compositeId2),
      ]);

      expect(saved1?.name).toBe(file1.name);
      expect(saved2?.name).toBe(file2.name);
    });

    it('saves single file', async () => {
      const file = createMockFile(testFileId1);
      await LocalFileService.createMany({ files: [file] });

      const saved = await FileDetailsModel.findById(compositeId1);
      expect(saved?.name).toBe(file.name);
      expect(saved?.content_type).toBe(file.content_type);
    });

    it('handles empty array', async () => {
      await expect(LocalFileService.createMany({ files: [] })).resolves.not.toThrow();
      expect(await FileDetailsModel.table.toArray()).toHaveLength(0);
    });

    it('updates existing files', async () => {
      await LocalFileService.createMany({ files: [createMockFile(testFileId1, { name: 'original.jpg' })] });
      await LocalFileService.createMany({
        files: [createMockFile(testFileId1, { name: 'updated.jpg', size: 204800 })],
      });

      const saved = await FileDetailsModel.findById(compositeId1);
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

      const saved = await FileDetailsModel.findById(compositeId1);
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

      vi.spyOn(FileDetailsModel, 'bulkSave').mockRejectedValueOnce(databaseError);

      await expect(LocalFileService.createMany({ files: [file] })).rejects.toMatchObject({
        category: ErrorCategory.Database,
        code: DatabaseErrorCode.WRITE_FAILED,
        message: 'Failed to bulk save records in file_details',
      });
    });

    it('propagates generic error when bulkSave throws', async () => {
      const file = createMockFile(testFileId1);
      const error = new Error('Unexpected database error');

      vi.spyOn(FileDetailsModel, 'bulkSave').mockRejectedValueOnce(error);

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
      const nonExistentId = buildCompositeId({ pubky: testPubky, id: 'non-existent' });
      expect(await LocalFileService.findByIds([nonExistentId])).toEqual([]);
    });

    it('returns only existing files when some IDs are missing', async () => {
      await LocalFileService.createMany({ files: [createMockFile(testFileId1)] });

      const nonExistentId = buildCompositeId({ pubky: testPubky, id: 'non-existent' });
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
    const owner = 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy' as Pubky;
    const bytes = Uint8Array.of(1, 2, 3);
    const media = buildFile(owner, { bytes, type: 'image/png' });
    const compositeId = buildCompositeId({ pubky: owner, id: media.id });

    it('creates the media row from the upload, named by the file the user picked', async () => {
      await LocalFileService.create({ media, bytes, name: 'cat.png', contentType: 'image/png' });

      expect(await FileDetailsModel.findById(compositeId)).toMatchObject({
        id: compositeId,
        name: 'cat.png',
        src: media.url,
        uri: media.url,
        content_type: 'image/png',
        size: 3,
        owner_id: owner,
        urls: buildUrls(compositeId),
      });
    });

    it('propagates database error when create fails', async () => {
      const dbError = Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to create file', {
        service: ErrorService.Local,
        operation: 'create',
      });
      vi.spyOn(FileDetailsModel, 'create').mockRejectedValueOnce(dbError);

      await expect(
        LocalFileService.create({ media, bytes, name: 'cat.png', contentType: 'image/png' }),
      ).rejects.toMatchObject({ category: ErrorCategory.Database });
    });
  });

  describe('isReferencedElsewhere', () => {
    const uri = 'pubky://owner/pub/social/v1/files/AKSZ57W2RFKHV1EHK007FQQ8TW.png';
    const post = (id: string, overrides: Partial<{ attachments: string[] | null; content: string }> = {}) => ({
      id,
      content: 'hello',
      kind: 'short',
      uri: `pubky://owner/pub/social/v1/posts/${id}`,
      indexed_at: 1,
      attachments: null,
      ...overrides,
    });

    it('sees a cached post outside the excluded one attaching the media', async () => {
      await PostDetailsModel.create(post('a:1', { attachments: [uri] }));
      await PostDetailsModel.create(post('a:2', { attachments: [uri] }));

      expect(await LocalFileService.isReferencedElsewhere({ uri, excludePostId: 'a:1' })).toBe(true);
    });

    it('sees a collection whose envelope holds the media as its cover', async () => {
      await PostDetailsModel.create(post('a:3', { content: JSON.stringify({ name: 'C', cover_image: uri }) }));

      expect(await LocalFileService.isReferencedElsewhere({ uri })).toBe(true);
    });

    it('is false when only the excluded post references it', async () => {
      await PostDetailsModel.create(post('a:1', { attachments: [uri] }));

      expect(await LocalFileService.isReferencedElsewhere({ uri, excludePostId: 'a:1' })).toBe(false);
    });
  });
});
