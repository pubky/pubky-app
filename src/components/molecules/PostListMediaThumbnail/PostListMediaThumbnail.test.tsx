import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { FileController } from '@/controllers/file/file';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import { FileVariant } from '@/services/nexus/file/file.types';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import type { LocalFilesStore } from '@/stores/localFiles/localFiles.types';
import { PostListMediaThumbnail } from './PostListMediaThumbnail';

vi.mock('@/atoms/Image/Image', () => ({
  Image: ({
    src,
    alt,
    fill,
    className,
    sizes,
  }: {
    src: string;
    alt: string;
    fill?: boolean;
    className?: string;
    sizes?: string;
  }) => <img data-testid="image" src={src} alt={alt} data-fill={fill} className={className} sizes={sizes} />,
}));

vi.mock('@/atoms/Video/Video', () => ({
  Video: ({
    src,
    controls,
    muted,
    playsInline,
    pauseVideo,
    className,
  }: {
    src: string;
    controls?: boolean;
    muted?: boolean;
    playsInline?: boolean;
    pauseVideo?: boolean;
    className?: string;
  }) => (
    <video
      data-testid="video"
      src={src}
      controls={controls}
      muted={muted}
      playsInline={playsInline}
      data-pause-video={pauseVideo}
      className={className}
    />
  ),
}));

vi.mock('@/molecules/PostAttachmentsImagesAndVideos/PostAttachmentsImagesAndVideos', () => ({
  PostAttachmentsImagesAndVideos: ({
    imagesAndVideos,
    renderTrigger,
  }: {
    imagesAndVideos: AttachmentConstructed[];
    renderTrigger: (props: {
      imagesAndVideos: AttachmentConstructed[];
      openPreview: (index: number, event?: React.MouseEvent) => void;
    }) => React.ReactNode;
  }) => (
    <div data-testid="media-dialog" data-count={imagesAndVideos.length}>
      {renderTrigger({ imagesAndVideos, openPreview: vi.fn() })}
    </div>
  ),
}));

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

const selectLocalFiles = (posts: LocalFilesStore['posts']) =>
  mockUseLocalFilesStore.mockImplementation((selector) =>
    selector({
      profile: null,
      posts,
      collections: {},
      setProfile: vi.fn(),
      setPostAttachments: vi.fn(),
      setCollectionCover: vi.fn(),
      reset: vi.fn(),
    }),
  );

describe('PostListMediaThumbnail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectLocalFiles({});
    mockUsePostDetails.mockReturnValue({ postDetails: createPostDetails(null), isLoading: false });
    mockGetFileUrl.mockImplementation(({ fileId, variant }) => `https://cdn.example.com/${fileId}/${variant}`);
  });

  it('renders an image thumbnail from local attachments', async () => {
    selectLocalFiles({
      'pk:test:post': [
        {
          type: 'image/jpeg',
          name: 'photo.jpg',
          urls: { main: 'blob:http://localhost/photo', feed: 'blob:http://localhost/photo-feed' },
        },
      ],
    });

    render(<PostListMediaThumbnail postId="pk:test:post" />);

    const image = await screen.findByTestId('image');
    expect(image).toHaveAttribute('src', 'blob:http://localhost/photo-feed');
  });

  it('renders a video thumbnail from local attachments', async () => {
    selectLocalFiles({
      'pk:test:post': [
        {
          type: 'video/mp4',
          name: 'clip.mp4',
          urls: { main: 'blob:http://localhost/clip', feed: 'blob:http://localhost/clip-feed' },
        },
      ],
    });

    render(<PostListMediaThumbnail postId="pk:test:post" />);

    const video = await screen.findByTestId('video');
    expect(video).toHaveAttribute('src', 'blob:http://localhost/clip');
    expect(video).not.toHaveAttribute('controls');
    expect(screen.queryByTestId('image')).not.toBeInTheDocument();
  });

  it('renders a video thumbnail from remote metadata', async () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createPostDetails(['pubky://pk:test/pub/pubky.app/files/video']),
      isLoading: false,
    });
    mockGetMetadata.mockResolvedValue([
      {
        id: 'pk:test:video',
        name: 'remote-video.mp4',
        content_type: 'video/mp4',
        size: 2048,
        src: 'https://example.com/video.mp4',
        created_at: 1_700_000_000,
        indexed_at: 1_700_000_000,
        metadata: {},
        owner_id: 'pk:test',
        uri: 'pubky://pk:test/pub/pubky.app/files/video',
        urls: {
          main: 'https://example.com/video.mp4',
          feed: 'https://example.com/video-feed.mp4',
          small: 'https://example.com/video-small.mp4',
        },
      },
    ]);

    render(<PostListMediaThumbnail postId="pk:test:post" />);

    const video = await screen.findByTestId('video');
    expect(video).toHaveAttribute('src', 'https://cdn.example.com/pk:test:video/main');
    expect(mockGetFileUrl).toHaveBeenCalledWith({ fileId: 'pk:test:video', variant: FileVariant.MAIN });
    expect(mockGetFileUrl).not.toHaveBeenCalledWith({ fileId: 'pk:test:video', variant: FileVariant.FEED });
  });

  it('renders nothing when no image or video preview is available', async () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createPostDetails(['pubky://pk:test/pub/pubky.app/files/audio']),
      isLoading: false,
    });
    mockGetMetadata.mockResolvedValue([
      {
        id: 'pk:test:audio',
        name: 'audio.mp3',
        content_type: 'audio/mpeg',
        size: 1024,
        src: 'https://example.com/audio.mp3',
        created_at: 1_700_000_000,
        indexed_at: 1_700_000_000,
        metadata: {},
        owner_id: 'pk:test',
        uri: 'pubky://pk:test/pub/pubky.app/files/audio',
        urls: {
          main: 'https://example.com/audio.mp3',
          feed: 'https://example.com/audio-feed.mp3',
          small: 'https://example.com/audio-small.mp3',
        },
      },
    ]);

    const { container } = render(<PostListMediaThumbnail postId="pk:test:post" />);

    await waitFor(() => {
      expect(mockGetMetadata).toHaveBeenCalled();
    });
    expect(container.firstChild).toBeNull();
  });
});
