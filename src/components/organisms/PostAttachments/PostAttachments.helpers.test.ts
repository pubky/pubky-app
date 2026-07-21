import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileController } from '@/controllers/file/file';
import { FileVariant } from '@/services/nexus/file/file.types';
import { categorizeAttachments, splitAttachmentsByMediaType } from './PostAttachments.helpers';
import type { AttachmentConstructed } from './PostAttachments.types';

vi.mock('@/controllers/file/file', () => ({
  FileController: { getFileUrl: vi.fn() },
}));

const mockGetFileUrl = vi.mocked(FileController.getFileUrl);

const meta = (id: string, content_type: string) =>
  ({ id, name: `${id}.bin`, content_type }) as Parameters<typeof splitAttachmentsByMediaType>[0][number];

describe('categorizeAttachments', () => {
  it('buckets attachments by media type', () => {
    const attachments: AttachmentConstructed[] = [
      { type: 'image/png', name: 'a', urls: { main: 'm' } },
      { type: 'video/mp4', name: 'b', urls: { main: 'm' } },
      { type: 'audio/mpeg', name: 'c', urls: { main: 'm' } },
      { type: 'application/pdf', name: 'd', urls: { main: 'm' } },
    ];

    const result = categorizeAttachments(attachments);

    expect(result.imagesAndVideos.map((a) => a.name)).toEqual(['a', 'b']);
    expect(result.audios.map((a) => a.name)).toEqual(['c']);
    expect(result.genericFiles.map((a) => a.name)).toEqual(['d']);
  });
});

describe('splitAttachmentsByMediaType', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFileUrl.mockImplementation(({ fileId, variant }) => `${fileId}/${variant}`);
  });

  it('sets a feed url only for images, not videos', () => {
    const { imagesAndVideos } = splitAttachmentsByMediaType([meta('img', 'image/png'), meta('vid', 'video/mp4')]);

    const image = imagesAndVideos.find((a) => a.type === 'image/png');
    const video = imagesAndVideos.find((a) => a.type === 'video/mp4');

    expect(image?.urls.feed).toBe(`img/${FileVariant.FEED}`);
    expect(video?.urls.feed).toBeUndefined();
    expect(video?.urls.main).toBe(`vid/${FileVariant.MAIN}`);
  });
});
