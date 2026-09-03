import { TextEncoder } from 'util';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pubky } from '@/models/models.types';
import { FileVariant } from '@/services/nexus/file/file.types';

const mockFileApplication = {
  toFileAttachment: vi.fn(),
  commitCreate: vi.fn(),
  commitDelete: vi.fn(),
  fetchFiles: vi.fn(),
  getAvatarUrl: vi.fn(),
  getFileUrl: vi.fn(),
  getMetadata: vi.fn(),
};

vi.mock('@/application/file/file', () => ({
  FileApplication: mockFileApplication,
}));

class MockFile extends File {
  private readonly rawContent: string;

  constructor(content: string[], filename: string, options?: FilePropertyBag) {
    super(content, filename, options);
    this.rawContent = content.join('');
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    const view = encoder.encode(this.rawContent);
    return view.buffer.slice(0);
  }
}

const testPubky = 'o4dksfbqk85ogzdb5osziw6befigbuxmuxkuxq8434q89uj56uyy' as Pubky;

let FileController: typeof import('./file').FileController;

// Helper functions
const createMockFile = () => new MockFile(['file content'], 'image.png', { type: 'image/png' });

const createMockBlobResult = () => ({
  blob: { data: new Uint8Array([1, 2, 3]) },
  meta: { url: 'blob-url' },
});

const createMockFileResult = () => ({
  file: { toJson: vi.fn() },
  meta: { url: 'file-url' },
});

const createMockMetadata = () => ({
  id: 'user1:file1',
  name: 'test-file.png',
  src: 'https://example.com/file1',
  content_type: 'image/png',
  size: 1024,
  created_at: Date.now(),
  indexed_at: Date.now(),
  metadata: {},
  owner_id: 'user1',
  uri: 'pubky://user1/pub/pubky.app/files/file1',
  urls: { feed: 'url1', main: 'url2', small: 'url3' },
});

describe('FileController', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    mockFileApplication.toFileAttachment.mockReset();
    mockFileApplication.commitCreate.mockReset();
    mockFileApplication.fetchFiles.mockReset();
    mockFileApplication.getAvatarUrl.mockReset();
    mockFileApplication.getFileUrl.mockReset();
    mockFileApplication.getMetadata.mockReset();

    ({ FileController } = await import('./file'));
  });

  describe('commitCreate', () => {
    it('normalizes file and uploads it', async () => {
      const file = createMockFile();
      const blobResult = createMockBlobResult();
      const fileResult = createMockFileResult();
      const fileAttachment = { blobResult, fileResult };

      mockFileApplication.toFileAttachment.mockResolvedValue(fileAttachment);
      mockFileApplication.commitCreate.mockResolvedValue(undefined);

      const result = await FileController.commitCreate({ file, pubky: testPubky });

      expect(mockFileApplication.toFileAttachment).toHaveBeenCalledWith({ file, pubky: testPubky });
      expect(mockFileApplication.commitCreate).toHaveBeenCalledWith({ fileAttachments: [fileAttachment] });
      expect(result).toBe(fileResult.meta.url);
    });

    it('propagates errors when file attachment preparation fails', async () => {
      const file = createMockFile();
      mockFileApplication.toFileAttachment.mockRejectedValue(new Error('normalizer failed'));

      await expect(FileController.commitCreate({ file, pubky: testPubky })).rejects.toThrow('normalizer failed');
      expect(mockFileApplication.commitCreate).not.toHaveBeenCalled();
    });

    it('propagates errors when attachment preparation fails', async () => {
      const file = createMockFile();
      mockFileApplication.toFileAttachment.mockRejectedValue(new Error('file failed'));

      await expect(FileController.commitCreate({ file, pubky: testPubky })).rejects.toThrow('file failed');
      expect(mockFileApplication.commitCreate).not.toHaveBeenCalled();
    });

    it('propagates errors when homeserver upload fails', async () => {
      const file = createMockFile();
      const blobResult = createMockBlobResult();
      const fileResult = createMockFileResult();
      mockFileApplication.toFileAttachment.mockResolvedValue({ blobResult, fileResult });
      mockFileApplication.commitCreate.mockRejectedValue(new Error('upload failed'));

      await expect(FileController.commitCreate({ file, pubky: testPubky })).rejects.toThrow('upload failed');
    });

    it('propagates errors when file.arrayBuffer() fails', async () => {
      const file = createMockFile();
      vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new Error('arrayBuffer failed'));
      mockFileApplication.toFileAttachment.mockRejectedValue(new Error('arrayBuffer failed'));

      await expect(FileController.commitCreate({ file, pubky: testPubky })).rejects.toThrow('arrayBuffer failed');
      expect(mockFileApplication.toFileAttachment).toHaveBeenCalledWith({ file, pubky: testPubky });
      expect(mockFileApplication.commitCreate).not.toHaveBeenCalled();
    });
  });

  describe('commitDelete', () => {
    it('delegates to FileApplication.commitDelete', async () => {
      const fileUris = ['pubky://user1/pub/pubky.app/files/file1', 'pubky://user2/pub/pubky.app/files/file2'];
      mockFileApplication.commitDelete.mockResolvedValue(undefined);

      await FileController.commitDelete({ fileUris });

      expect(mockFileApplication.commitDelete).toHaveBeenCalledWith(fileUris);
    });

    it('propagates deletion errors to the caller', async () => {
      mockFileApplication.commitDelete.mockRejectedValue(new Error('delete failed'));

      await expect(
        FileController.commitDelete({ fileUris: ['pubky://user1/pub/pubky.app/files/file1'] }),
      ).rejects.toThrow('delete failed');
    });
  });

  describe('getAvatarUrl', () => {
    it('delegates to FileApplication.getAvatarUrl', () => {
      const expectedUrl = 'https://cdn.example.com/avatar/test-pubky';
      mockFileApplication.getAvatarUrl.mockReturnValue(expectedUrl);

      const result = FileController.getAvatarUrl(testPubky);

      expect(mockFileApplication.getAvatarUrl).toHaveBeenCalledWith(testPubky, undefined);
      expect(result).toBe(expectedUrl);
    });
  });

  describe('fetchFiles', () => {
    it('delegates to FileApplication.fetchFiles', async () => {
      const fileUris = ['pubky://user1/pub/pubky.app/files/file1', 'pubky://user2/pub/pubky.app/files/file2'];
      mockFileApplication.fetchFiles.mockResolvedValue(undefined);

      await FileController.fetchFiles({ fileUris });

      expect(mockFileApplication.fetchFiles).toHaveBeenCalledWith(fileUris);
    });

    it('passes through empty file uri arrays', async () => {
      mockFileApplication.fetchFiles.mockResolvedValue(undefined);

      await FileController.fetchFiles({ fileUris: [] });

      expect(mockFileApplication.fetchFiles).toHaveBeenCalledWith([]);
    });
  });

  describe('getFileUrl', () => {
    it('delegates to FileApplication.getFileUrl with correct parameters', () => {
      const fileId = 'user123:file456';
      const variant = FileVariant.SMALL;
      const expectedUrl = 'https://cdn.example.com/files/user123/file456/small';

      mockFileApplication.getFileUrl.mockReturnValue(expectedUrl);

      const result = FileController.getFileUrl({
        fileId,
        variant,
      });

      expect(mockFileApplication.getFileUrl).toHaveBeenCalledWith({
        fileId,
        variant,
      });
      expect(result).toBe(expectedUrl);
    });

    it('propagates errors when FileApplication.getFileUrl fails (e.g., invalid fileId)', () => {
      const invalidFileId = 'invalid-file-id';
      const variant = FileVariant.SMALL;
      const error = new Error('Invalid composite id: invalid-file-id');

      mockFileApplication.getFileUrl.mockImplementation(() => {
        throw error;
      });

      expect(() => FileController.getFileUrl({ fileId: invalidFileId, variant })).toThrow(
        'Invalid composite id: invalid-file-id',
      );
    });
  });

  describe('getMetadata', () => {
    it('delegates to FileApplication.getMetadata', async () => {
      const fileAttachments = ['pubky://user1/pub/pubky.app/files/file1', 'pubky://user2/pub/pubky.app/files/file2'];
      const expectedMetadata = [createMockMetadata()];

      mockFileApplication.getMetadata.mockResolvedValue(expectedMetadata);

      const result = await FileController.getMetadata({ fileAttachments });

      expect(mockFileApplication.getMetadata).toHaveBeenCalledWith({ fileAttachments });
      expect(result).toEqual(expectedMetadata);
    });

    it('propagates errors when FileApplication.getMetadata fails', async () => {
      mockFileApplication.getMetadata.mockRejectedValue(new Error('metadata fetch failed'));

      await expect(
        FileController.getMetadata({ fileAttachments: ['pubky://user1/pub/pubky.app/files/file1'] }),
      ).rejects.toThrow('metadata fetch failed');
    });

    it('handles empty array of fileAttachments', async () => {
      mockFileApplication.getMetadata.mockResolvedValue([]);

      const result = await FileController.getMetadata({ fileAttachments: [] });

      expect(mockFileApplication.getMetadata).toHaveBeenCalledWith({ fileAttachments: [] });
      expect(result).toEqual([]);
    });
  });
});
