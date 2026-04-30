import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabase } from '@/database/franky/franky.helpers';
import { FileDetailsModel } from '@/models/file/fileDetails';
import type { Pubky } from '@/models/models.types';
import type { NexusFileDetails } from '@/services/nexus/nexus.types';
describe('FileDetailsModel', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  const testFileId1 = 'file-test-1';
  const testFileId2 = 'file-test-2';
  const testPubky: Pubky = 'operrr8wsbpr3ue9d4qj41ge1kcc6r7fdiy6o3ugjrrhi4y77rd0';

  const MOCK_FILE_DETAILS: NexusFileDetails = {
    id: testFileId1,
    name: 'test-image.jpg',
    src: 'https://example.com/files/test-image.jpg',
    content_type: 'image/jpeg',
    size: 102400,
    created_at: 1234567890,
    indexed_at: 1234567890,
    metadata: {},
    owner_id: testPubky,
    uri: `pubky://${testPubky}/pub/pubky.app/files/${testFileId1}`,
    urls: {
      feed: 'https://example.com/files/test-image-feed.jpg',
      main: 'https://example.com/files/test-image-main.jpg',
      small: 'https://example.com/files/test-image-small.jpg',
    },
  };

  describe('Constructor', () => {
    it('should create FileDetailsModel instance with all properties', () => {
      const fileDetails = new FileDetailsModel(MOCK_FILE_DETAILS);

      expect(fileDetails.id).toBe(MOCK_FILE_DETAILS.id);
      expect(fileDetails.name).toBe(MOCK_FILE_DETAILS.name);
      expect(fileDetails.content_type).toBe(MOCK_FILE_DETAILS.content_type);
      expect(fileDetails.size).toBe(MOCK_FILE_DETAILS.size);
      expect(fileDetails.urls).toEqual(MOCK_FILE_DETAILS.urls);
    });
  });

  describe('Static Methods', () => {
    it('should create file details', async () => {
      const result = await FileDetailsModel.create(MOCK_FILE_DETAILS);
      expect(result).toBe(MOCK_FILE_DETAILS.id);
    });

    it('should find file details by id', async () => {
      await FileDetailsModel.create(MOCK_FILE_DETAILS);
      const result = await FileDetailsModel.findById(testFileId1);

      expect(result).not.toBeNull();
      expect(result!).toBeInstanceOf(FileDetailsModel);
      expect(result!.id).toBe(testFileId1);
      expect(result!.name).toBe(MOCK_FILE_DETAILS.name);
    });

    it('should return null for non-existent file details', async () => {
      const result = await FileDetailsModel.findById('non-existent-file-999');
      expect(result).toBeNull();
    });

    it('should bulk save file details', async () => {
      const fileDetails2 = {
        ...MOCK_FILE_DETAILS,
        id: testFileId2,
        name: 'test-image-2.jpg',
        size: 204800,
        uri: `pubky://${testPubky}/pub/pubky.app/files/${testFileId2}`,
      };

      const result = await FileDetailsModel.bulkSave([MOCK_FILE_DETAILS, fileDetails2]);
      expect(result).toBeDefined();

      const file1 = await FileDetailsModel.findById(testFileId1);
      const file2 = await FileDetailsModel.findById(testFileId2);

      expect(file1).not.toBeNull();
      expect(file2).not.toBeNull();
      expect(file1!.name).toBe('test-image.jpg');
      expect(file2!.name).toBe('test-image-2.jpg');
    });

    it('should handle empty array in bulk save', async () => {
      const result = await FileDetailsModel.bulkSave([]);
      expect(result).toBeUndefined();
    });
  });
});
