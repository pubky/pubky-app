import { buildFile } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
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
  const testPubky: Pubky = fakeOwner(1);
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
    const bytes = new Uint8Array([1, 2, 3]);
    const upload = (name = 'test-file.jpg', contentType = 'image/jpeg', data = bytes) => ({
      media: buildFile(testPubky, { bytes: data, type: contentType }),
      bytes: data,
      name,
      contentType,
    });

    it('creates a file record keyed owner:hash from the upload, with the urls hardcoded', async () => {
      const attachment = upload();
      const compositeId = buildCompositeId({ pubky: testPubky, id: attachment.media.id });
      const before = Date.now();

      await LocalFileService.create(attachment);

      const saved = await FileDetailsModel.findById(compositeId);
      expect(saved).toBeDefined();
      expect(saved?.name).toBe('test-file.jpg');
      expect(saved?.src).toBe(attachment.media.url);
      expect(saved?.uri).toBe(attachment.media.url);
      expect(saved?.content_type).toBe('image/jpeg');
      expect(saved?.size).toBe(3);
      expect(saved?.created_at).toBeGreaterThanOrEqual(before);
      expect(saved?.indexed_at).toBe(saved?.created_at);
      expect(saved?.metadata).toEqual({});
      expect(saved?.owner_id).toBe(testPubky);
      expect(saved?.urls).toEqual(buildUrls(compositeId));
    });

    it('replaces the row of the same bytes uploaded again: media is content addressed', async () => {
      await LocalFileService.create(upload('first.jpg'));
      await LocalFileService.create(upload('second.jpg'));

      const rows = await FileDetailsModel.table.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('second.jpg');
    });

    it('propagates database error when the write fails', async () => {
      const dbError = Err.database(DatabaseErrorCode.WRITE_FAILED, 'Database write failed', {
        service: ErrorService.Local,
        operation: 'upsert',
      });
      vi.spyOn(FileDetailsModel, 'upsert').mockRejectedValueOnce(dbError);

      await expect(LocalFileService.create(upload())).rejects.toMatchObject({
        category: ErrorCategory.Database,
        code: DatabaseErrorCode.WRITE_FAILED,
      });
      vi.restoreAllMocks();
    });
  });

  describe('isReferencedElsewhere', () => {
    const mediaUri = buildFile(testPubky, { bytes: new Uint8Array([9]), type: 'image/png' }).url;
    const post = (id: string, attachments: string[] | null, content = 'text') => ({
      id,
      content,
      kind: 'image',
      uri: `pubky://${testPubky}/pub/social/v1/posts/${id.split(':')[1]}`,
      indexed_at: 1,
      attachments,
    });

    it('is true when another cached post attaches the media', async () => {
      await PostDetailsModel.table.bulkPut([post(`${testPubky}:A`, [mediaUri]), post(`${testPubky}:B`, [mediaUri])]);

      expect(await LocalFileService.isReferencedElsewhere({ uri: mediaUri, excludePostId: `${testPubky}:A` })).toBe(
        true,
      );
    });

    it('is false when only the excluded post references it, or no post does', async () => {
      await PostDetailsModel.table.put(post(`${testPubky}:A`, [mediaUri]));

      expect(await LocalFileService.isReferencedElsewhere({ uri: mediaUri, excludePostId: `${testPubky}:A` })).toBe(
        false,
      );
      expect(await LocalFileService.isReferencedElsewhere({ uri: 'pubky://nobody/x.png' })).toBe(false);
    });

    it('counts a reference inside the content: a collection or article cover', async () => {
      await PostDetailsModel.table.put(
        post(`${testPubky}:C`, null, JSON.stringify({ name: 'c', cover_image: mediaUri })),
      );

      expect(await LocalFileService.isReferencedElsewhere({ uri: mediaUri })).toBe(true);
    });
  });
});
