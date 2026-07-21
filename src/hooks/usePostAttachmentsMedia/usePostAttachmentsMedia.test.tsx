import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { FileController } from '@/controllers/file/file';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { FileVariant } from '@/services/nexus/file/file.types';
import type { NexusFileDetails } from '@/services/nexus/nexus.types';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import type { LocalFilesStore } from '@/stores/localFiles/localFiles.types';
import { mockLocalFilesStore } from '@/test-utils/stores';
import { usePostAttachmentsMedia } from './usePostAttachmentsMedia';

vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getMetadata: vi.fn(),
    getFileUrl: vi.fn(),
  },
}));

vi.mock('@/services/nexus/file/file.types', () => ({
  FileVariant: {
    MAIN: 'main',
    FEED: 'feed',
  },
}));

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: vi.fn(),
}));

vi.mock('@/stores/localFiles/localFiles.store', () => ({
  useLocalFilesStore: vi.fn(),
}));

const mockUsePostDetails = vi.mocked(usePostDetails);
const mockUseLocalFilesStore = vi.mocked(useLocalFilesStore);
const mockGetMetadata = vi.mocked(FileController.getMetadata);
const mockGetFileUrl = vi.mocked(FileController.getFileUrl);

const createPostDetails = (attachments: string[] | null): EnrichedPostDetails => ({
  id: 'pk:test:post',
  content: '',
  indexed_at: 1_700_000_000,
  kind: 'short',
  uri: 'pubky://pk:test/pub/pubky.app/posts/post',
  attachments,
  is_moderated: false,
  is_blurred: false,
});

const createFileMetadata = (overrides: Partial<NexusFileDetails>): NexusFileDetails => ({
  id: 'pk:test:file',
  name: 'file.jpg',
  src: 'https://example.com/file.jpg',
  content_type: 'image/jpeg',
  size: 1024,
  created_at: 1_700_000_000,
  indexed_at: 1_700_000_000,
  metadata: {},
  owner_id: 'pk:test',
  uri: 'pubky://pk:test/pub/pubky.app/files/file',
  urls: {
    feed: 'https://example.com/file-feed.jpg',
    main: 'https://example.com/file-main.jpg',
    small: 'https://example.com/file-small.jpg',
  },
  ...overrides,
});

const selectLocalFiles = (posts: LocalFilesStore['posts']) => {
  mockUseLocalFilesStore.mockImplementation((selector) =>
    selector(
      mockLocalFilesStore({
        profile: null,
        posts,
        collections: {},
      }),
    ),
  );
};

describe('usePostAttachmentsMedia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectLocalFiles({});
    mockUsePostDetails.mockReturnValue({ postDetails: createPostDetails(null), isLoading: false });
    mockGetFileUrl.mockImplementation(({ fileId, variant }) => `https://cdn.example.com/${fileId}/${variant}`);
  });

  it('returns local image and video attachments before remote metadata', async () => {
    selectLocalFiles({
      'pk:test:post': [
        {
          type: 'image/jpeg',
          name: 'local-photo.jpg',
          urls: { main: 'blob:http://localhost/photo', feed: 'blob:http://localhost/photo-feed' },
        },
        {
          type: 'audio/mpeg',
          name: 'local-audio.mp3',
          urls: { main: 'blob:http://localhost/audio' },
        },
        {
          type: 'video/mp4',
          name: 'local-video.mp4',
          urls: { main: 'blob:http://localhost/video' },
        },
      ],
    });
    mockUsePostDetails.mockReturnValue({
      postDetails: createPostDetails(['pubky://pk:test/pub/pubky.app/files/remote']),
      isLoading: false,
    });

    const { result } = renderHook(() => usePostAttachmentsMedia('pk:test:post'));

    await waitFor(() => {
      expect(result.current.mediaItems).toHaveLength(2);
    });
    expect(result.current.mediaItems.map((attachment) => attachment.name)).toEqual([
      'local-photo.jpg',
      'local-video.mp4',
    ]);
    expect(mockGetMetadata).not.toHaveBeenCalled();
  });

  it('returns an empty list when no attachments are available', async () => {
    const { result } = renderHook(() => usePostAttachmentsMedia('pk:test:post'));

    await waitFor(() => {
      expect(result.current.mediaItems).toEqual([]);
    });
    expect(mockGetMetadata).not.toHaveBeenCalled();
  });

  it('fetches remote metadata and keeps only image and video attachments', async () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createPostDetails([
        'pubky://pk:test/pub/pubky.app/files/photo',
        'pubky://pk:test/pub/pubky.app/files/audio',
        'pubky://pk:test/pub/pubky.app/files/video',
      ]),
      isLoading: false,
    });
    mockGetMetadata.mockResolvedValue([
      createFileMetadata({
        id: 'pk:test:photo',
        name: 'remote-photo.jpg',
        content_type: 'image/jpeg',
      }),
      createFileMetadata({
        id: 'pk:test:audio',
        name: 'remote-audio.mp3',
        content_type: 'audio/mpeg',
      }),
      createFileMetadata({
        id: 'pk:test:video',
        name: 'remote-video.mp4',
        content_type: 'video/mp4',
      }),
    ]);

    const { result } = renderHook(() => usePostAttachmentsMedia('pk:test:post'));

    await waitFor(() => {
      expect(result.current.mediaItems.map((attachment) => attachment.name)).toEqual([
        'remote-photo.jpg',
        'remote-video.mp4',
      ]);
    });
    expect(mockGetMetadata).toHaveBeenCalledWith({
      fileAttachments: [
        'pubky://pk:test/pub/pubky.app/files/photo',
        'pubky://pk:test/pub/pubky.app/files/audio',
        'pubky://pk:test/pub/pubky.app/files/video',
      ],
    });
    expect(result.current.mediaItems[0].urls).toEqual({
      main: 'https://cdn.example.com/pk:test:photo/main',
      feed: 'https://cdn.example.com/pk:test:photo/feed',
    });
    expect(result.current.mediaItems[1].urls).toEqual({
      main: 'https://cdn.example.com/pk:test:video/main',
      feed: undefined,
    });
    expect(mockGetFileUrl).toHaveBeenCalledWith({ fileId: 'pk:test:photo', variant: FileVariant.MAIN });
    expect(mockGetFileUrl).toHaveBeenCalledWith({ fileId: 'pk:test:photo', variant: FileVariant.FEED });
    expect(mockGetFileUrl).toHaveBeenCalledWith({ fileId: 'pk:test:video', variant: FileVariant.MAIN });
  });

  it('falls back to an empty list when remote metadata fails', async () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createPostDetails(['pubky://pk:test/pub/pubky.app/files/photo']),
      isLoading: false,
    });
    mockGetMetadata.mockRejectedValue(new Error('metadata failed'));

    const { result } = renderHook(() => usePostAttachmentsMedia('pk:test:post'));

    await waitFor(() => {
      expect(mockGetMetadata).toHaveBeenCalledTimes(1);
    });
    expect(result.current.mediaItems).toEqual([]);
  });
});
