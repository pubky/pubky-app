import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostAttachments } from './PostAttachments';
import { asInvalid } from '@/test-utils/type-assertions';
import { FileController } from '@/controllers/file/file';
import { FileVariant } from '@/services/nexus/file/file.types';
import type { NexusFileDetails } from '@/services/nexus/nexus.types';
// Mock useToast
const mockToast = vi.fn();
vi.mock('@/molecules', () => ({
  useToast: () => ({ toast: mockToast }),
  PostAttachmentsImagesAndVideos: vi.fn(({ imagesAndVideos }) => (
    <div data-testid="post-attachments-images-and-videos" data-count={imagesAndVideos.length}>
      ImagesAndVideos
    </div>
  )),
  PostAttachmentsAudios: vi.fn(({ audios }) => (
    <div data-testid="post-attachments-audios" data-count={audios.length}>
      Audios
    </div>
  )),
  PostAttachmentsGenericFiles: vi.fn(({ genericFiles }) => (
    <div data-testid="post-attachments-generic-files" data-count={genericFiles.length}>
      GenericFiles
    </div>
  )),
}));

// Mock atoms
vi.mock('@/atoms', () => ({
  Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="container" className={className}>
      {children}
    </div>
  ),
}));

// Mock dependencies
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
    SMALL: 'small',
  },
}));

const mockGetMetadata = vi.mocked(FileController.getMetadata);
const mockGetFileUrl = vi.mocked(FileController.getFileUrl);

// Helper to create mock metadata
const createMockFileBase = (id: string, name: string, content_type: string, size: number): NexusFileDetails => ({
  id,
  name,
  content_type,
  size,
  src: `https://example.com/files/${id}`,
  created_at: Date.now(),
  indexed_at: Date.now(),
  metadata: {},
  owner_id: id.split(':')[0],
  uri: `pubky://${id.split(':')[0]}/pub/pubky.app/files/${id.split(':')[1]}`,
  urls: {
    main: `https://example.com/files/${id}/main`,
    feed: `https://example.com/files/${id}/feed`,
    small: `https://example.com/files/${id}/small`,
  },
});

const createMockImageMetadata = (id: string, name = 'image.jpg') => createMockFileBase(id, name, 'image/jpeg', 1024);

const createMockVideoMetadata = (id: string, name = 'video.mp4') => createMockFileBase(id, name, 'video/mp4', 2048);

const createMockAudioMetadata = (id: string, name = 'audio.mp3') => createMockFileBase(id, name, 'audio/mpeg', 512);

const createMockPdfMetadata = (id: string, name = 'document.pdf') =>
  createMockFileBase(id, name, 'application/pdf', 4096);

const createMockGifMetadata = (id: string, name = 'animation.gif') => createMockFileBase(id, name, 'image/gif', 768);

// Helper to create local attachments
const createLocalImageAttachment = (name = 'image.jpg', url = 'blob:http://localhost/image1') => ({
  type: 'image/jpeg',
  name,
  urls: { main: url, feed: `${url}-feed` },
});

const createLocalVideoAttachment = (name = 'video.mp4', url = 'blob:http://localhost/video1') => ({
  type: 'video/mp4',
  name,
  urls: { main: url },
});

const createLocalAudioAttachment = (name = 'audio.mp3', url = 'blob:http://localhost/audio1') => ({
  type: 'audio/mpeg',
  name,
  urls: { main: url },
});

const createLocalPdfAttachment = (name = 'document.pdf', url = 'blob:http://localhost/doc1') => ({
  type: 'application/pdf',
  name,
  urls: { main: url },
});

const createLocalGifAttachment = (name = 'animation.gif', url = 'blob:http://localhost/gif1') => ({
  type: 'image/gif',
  name,
  urls: { main: url, feed: `${url}-feed` },
});

describe('PostAttachments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFileUrl.mockImplementation(({ fileId, variant }) => `https://cdn.example.com/${fileId}/${variant}`);
  });

  describe('Rendering', () => {
    it('renders nothing when attachments is null', () => {
      const { container } = render(<PostAttachments attachments={null} localAttachments={undefined} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when attachments is undefined', () => {
      const { container } = render(
        <PostAttachments attachments={asInvalid<string[] | null>(undefined)} localAttachments={undefined} />,
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when attachments is empty array', () => {
      const { container } = render(<PostAttachments attachments={[]} localAttachments={undefined} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders container when attachments are loaded', async () => {
      const attachments = ['pubky://user1/pub/pubky.app/files/file1'];
      mockGetMetadata.mockResolvedValue([createMockImageMetadata('user1:file1')]);

      render(<PostAttachments attachments={attachments} localAttachments={undefined} />);

      await waitFor(() => {
        expect(screen.getByTestId('container')).toBeInTheDocument();
      });
    });

    it('applies correct className to container', async () => {
      const attachments = ['pubky://user1/pub/pubky.app/files/file1'];
      mockGetMetadata.mockResolvedValue([createMockImageMetadata('user1:file1')]);

      render(<PostAttachments attachments={attachments} localAttachments={undefined} />);

      await waitFor(() => {
        expect(screen.getByTestId('container')).toHaveClass('gap-3');
      });
    });
  });

  describe('Media type categorization', () => {
    it('renders images in PostAttachmentsImagesAndVideos', async () => {
      const attachments = ['pubky://user1/pub/pubky.app/files/image1'];
      mockGetMetadata.mockResolvedValue([createMockImageMetadata('user1:image1')]);

      render(<PostAttachments attachments={attachments} localAttachments={undefined} />);

      await waitFor(() => {
        expect(screen.getByTestId('post-attachments-images-and-videos')).toBeInTheDocument();
        expect(screen.getByTestId('post-attachments-images-and-videos')).toHaveAttribute('data-count', '1');
      });
    });

    it('renders videos in PostAttachmentsImagesAndVideos', async () => {
      const attachments = ['pubky://user1/pub/pubky.app/files/video1'];
      mockGetMetadata.mockResolvedValue([createMockVideoMetadata('user1:video1')]);

      render(<PostAttachments attachments={attachments} localAttachments={undefined} />);

      await waitFor(() => {
        expect(screen.getByTestId('post-attachments-images-and-videos')).toBeInTheDocument();
        expect(screen.getByTestId('post-attachments-images-and-videos')).toHaveAttribute('data-count', '1');
      });
    });

    it('renders audios in PostAttachmentsAudios', async () => {
      const attachments = ['pubky://user1/pub/pubky.app/files/audio1'];
      mockGetMetadata.mockResolvedValue([createMockAudioMetadata('user1:audio1')]);

      render(<PostAttachments attachments={attachments} localAttachments={undefined} />);

      await waitFor(() => {
        expect(screen.getByTestId('post-attachments-audios')).toBeInTheDocument();
        expect(screen.getByTestId('post-attachments-audios')).toHaveAttribute('data-count', '1');
      });
    });

    it('renders generic files in PostAttachmentsGenericFiles', async () => {
      const attachments = ['pubky://user1/pub/pubky.app/files/doc1'];
      mockGetMetadata.mockResolvedValue([createMockPdfMetadata('user1:doc1')]);

      render(<PostAttachments attachments={attachments} localAttachments={undefined} />);

      await waitFor(() => {
        expect(screen.getByTestId('post-attachments-generic-files')).toBeInTheDocument();
        expect(screen.getByTestId('post-attachments-generic-files')).toHaveAttribute('data-count', '1');
      });
    });

    it('categorizes mixed attachment types correctly', async () => {
      const attachments = [
        'pubky://user1/pub/pubky.app/files/image1',
        'pubky://user1/pub/pubky.app/files/video1',
        'pubky://user1/pub/pubky.app/files/audio1',
        'pubky://user1/pub/pubky.app/files/doc1',
      ];
      mockGetMetadata.mockResolvedValue([
        createMockImageMetadata('user1:image1'),
        createMockVideoMetadata('user1:video1'),
        createMockAudioMetadata('user1:audio1'),
        createMockPdfMetadata('user1:doc1'),
      ]);

      render(<PostAttachments attachments={attachments} localAttachments={undefined} />);

      await waitFor(() => {
        expect(screen.getByTestId('post-attachments-images-and-videos')).toHaveAttribute('data-count', '2');
        expect(screen.getByTestId('post-attachments-audios')).toHaveAttribute('data-count', '1');
        expect(screen.getByTestId('post-attachments-generic-files')).toHaveAttribute('data-count', '1');
      });
    });

    it('handles multiple images correctly', async () => {
      const attachments = [
        'pubky://user1/pub/pubky.app/files/image1',
        'pubky://user1/pub/pubky.app/files/image2',
        'pubky://user1/pub/pubky.app/files/image3',
      ];
      mockGetMetadata.mockResolvedValue([
        createMockImageMetadata('user1:image1'),
        createMockImageMetadata('user1:image2'),
        createMockImageMetadata('user1:image3'),
      ]);

      render(<PostAttachments attachments={attachments} localAttachments={undefined} />);

      await waitFor(() => {
        expect(screen.getByTestId('post-attachments-images-and-videos')).toHaveAttribute('data-count', '3');
      });
    });

    it('handles GIF images correctly (categorized with images)', async () => {
      const attachments = ['pubky://user1/pub/pubky.app/files/gif1'];
      mockGetMetadata.mockResolvedValue([createMockGifMetadata('user1:gif1')]);

      render(<PostAttachments attachments={attachments} localAttachments={undefined} />);

      await waitFor(() => {
        expect(screen.getByTestId('post-attachments-images-and-videos')).toBeInTheDocument();
        expect(screen.getByTestId('post-attachments-images-and-videos')).toHaveAttribute('data-count', '1');
      });
    });
  });

  describe('URL generation', () => {
    it('generates main URL for images', async () => {
      const attachments = ['pubky://user1/pub/pubky.app/files/image1'];
      mockGetMetadata.mockResolvedValue([createMockImageMetadata('user1:image1')]);

      render(<PostAttachments attachments={attachments} localAttachments={undefined} />);

      await waitFor(() => {
        expect(mockGetFileUrl).toHaveBeenCalledWith({ fileId: 'user1:image1', variant: FileVariant.MAIN });
        expect(mockGetFileUrl).toHaveBeenCalledWith({ fileId: 'user1:image1', variant: FileVariant.FEED });
      });
    });

    it('generates only main URL for videos (no feed variant)', async () => {
      const attachments = ['pubky://user1/pub/pubky.app/files/video1'];
      mockGetMetadata.mockResolvedValue([createMockVideoMetadata('user1:video1')]);

      render(<PostAttachments attachments={attachments} localAttachments={undefined} />);

      await waitFor(() => {
        expect(mockGetFileUrl).toHaveBeenCalledWith({ fileId: 'user1:video1', variant: FileVariant.MAIN });
      });

      // Videos should not have feed variant
      const feedCalls = mockGetFileUrl.mock.calls.filter(
        (call) => call[0].fileId === 'user1:video1' && call[0].variant === FileVariant.FEED,
      );
      expect(feedCalls).toHaveLength(0);
    });

    it('generates only main URL for audio files', async () => {
      const attachments = ['pubky://user1/pub/pubky.app/files/audio1'];
      mockGetMetadata.mockResolvedValue([createMockAudioMetadata('user1:audio1')]);

      render(<PostAttachments attachments={attachments} localAttachments={undefined} />);

      await waitFor(() => {
        expect(mockGetFileUrl).toHaveBeenCalledWith({ fileId: 'user1:audio1', variant: FileVariant.MAIN });
      });
    });

    it('generates only main URL for generic files', async () => {
      const attachments = ['pubky://user1/pub/pubky.app/files/doc1'];
      mockGetMetadata.mockResolvedValue([createMockPdfMetadata('user1:doc1')]);

      render(<PostAttachments attachments={attachments} localAttachments={undefined} />);

      await waitFor(() => {
        expect(mockGetFileUrl).toHaveBeenCalledWith({ fileId: 'user1:doc1', variant: FileVariant.MAIN });
      });
    });
  });

  describe('FileController integration', () => {
    it('calls getMetadata with correct fileAttachments', async () => {
      const attachments = ['pubky://user1/pub/pubky.app/files/file1', 'pubky://user2/pub/pubky.app/files/file2'];
      mockGetMetadata.mockResolvedValue([
        createMockImageMetadata('user1:file1'),
        createMockImageMetadata('user2:file2'),
      ]);

      render(<PostAttachments attachments={attachments} localAttachments={undefined} />);

      await waitFor(() => {
        expect(mockGetMetadata).toHaveBeenCalledWith({ fileAttachments: attachments });
      });
    });

    it('does not call getMetadata when attachments is empty', () => {
      render(<PostAttachments attachments={[]} localAttachments={undefined} />);

      expect(mockGetMetadata).not.toHaveBeenCalled();
    });

    it('does not call getMetadata when attachments is null', () => {
      render(<PostAttachments attachments={null} localAttachments={undefined} />);

      expect(mockGetMetadata).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('shows toast error when getMetadata fails', async () => {
      const attachments = ['pubky://user1/pub/pubky.app/files/file1'];
      mockGetMetadata.mockRejectedValue(new Error('Network error'));

      render(<PostAttachments attachments={attachments} localAttachments={undefined} />);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Error',
          description: 'Failed to load post attachments',
        });
      });
    });

    it('renders nothing when error occurs', async () => {
      const attachments = ['pubky://user1/pub/pubky.app/files/file1'];
      mockGetMetadata.mockRejectedValue(new Error('Network error'));

      const { container } = render(<PostAttachments attachments={attachments} localAttachments={undefined} />);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalled();
      });

      // Should not render anything after error
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Conditional rendering of sub-components', () => {
    it('does not render PostAttachmentsImagesAndVideos when no images or videos', async () => {
      const attachments = ['pubky://user1/pub/pubky.app/files/audio1'];
      mockGetMetadata.mockResolvedValue([createMockAudioMetadata('user1:audio1')]);

      render(<PostAttachments attachments={attachments} localAttachments={undefined} />);

      await waitFor(() => {
        expect(screen.getByTestId('post-attachments-audios')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('post-attachments-images-and-videos')).not.toBeInTheDocument();
    });

    it('does not render PostAttachmentsAudios when no audios', async () => {
      const attachments = ['pubky://user1/pub/pubky.app/files/image1'];
      mockGetMetadata.mockResolvedValue([createMockImageMetadata('user1:image1')]);

      render(<PostAttachments attachments={attachments} localAttachments={undefined} />);

      await waitFor(() => {
        expect(screen.getByTestId('post-attachments-images-and-videos')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('post-attachments-audios')).not.toBeInTheDocument();
    });

    it('does not render PostAttachmentsGenericFiles when no generic files', async () => {
      const attachments = ['pubky://user1/pub/pubky.app/files/image1'];
      mockGetMetadata.mockResolvedValue([createMockImageMetadata('user1:image1')]);

      render(<PostAttachments attachments={attachments} localAttachments={undefined} />);

      await waitFor(() => {
        expect(screen.getByTestId('post-attachments-images-and-videos')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('post-attachments-generic-files')).not.toBeInTheDocument();
    });
  });

  describe('Re-fetching on attachments change', () => {
    it('re-fetches metadata when attachments prop changes', async () => {
      const initialAttachments = ['pubky://user1/pub/pubky.app/files/file1'];
      const newAttachments = ['pubky://user2/pub/pubky.app/files/file2'];

      mockGetMetadata.mockResolvedValue([createMockImageMetadata('user1:file1')]);

      const { rerender } = render(<PostAttachments attachments={initialAttachments} localAttachments={undefined} />);

      await waitFor(() => {
        expect(mockGetMetadata).toHaveBeenCalledWith({ fileAttachments: initialAttachments });
      });

      mockGetMetadata.mockResolvedValue([createMockImageMetadata('user2:file2')]);

      rerender(<PostAttachments attachments={newAttachments} localAttachments={undefined} />);

      await waitFor(() => {
        expect(mockGetMetadata).toHaveBeenCalledWith({ fileAttachments: newAttachments });
      });
    });
  });

  describe('Local attachments', () => {
    it('renders local image attachments without calling getMetadata', async () => {
      const localAttachments = [createLocalImageAttachment()];

      render(<PostAttachments attachments={null} localAttachments={localAttachments} />);

      await waitFor(() => {
        expect(screen.getByTestId('post-attachments-images-and-videos')).toBeInTheDocument();
        expect(screen.getByTestId('post-attachments-images-and-videos')).toHaveAttribute('data-count', '1');
      });

      expect(mockGetMetadata).not.toHaveBeenCalled();
    });

    it('renders local video attachments without calling getMetadata', async () => {
      const localAttachments = [createLocalVideoAttachment()];

      render(<PostAttachments attachments={null} localAttachments={localAttachments} />);

      await waitFor(() => {
        expect(screen.getByTestId('post-attachments-images-and-videos')).toBeInTheDocument();
        expect(screen.getByTestId('post-attachments-images-and-videos')).toHaveAttribute('data-count', '1');
      });

      expect(mockGetMetadata).not.toHaveBeenCalled();
    });

    it('renders local audio attachments without calling getMetadata', async () => {
      const localAttachments = [createLocalAudioAttachment()];

      render(<PostAttachments attachments={null} localAttachments={localAttachments} />);

      await waitFor(() => {
        expect(screen.getByTestId('post-attachments-audios')).toBeInTheDocument();
        expect(screen.getByTestId('post-attachments-audios')).toHaveAttribute('data-count', '1');
      });

      expect(mockGetMetadata).not.toHaveBeenCalled();
    });

    it('renders local generic file attachments without calling getMetadata', async () => {
      const localAttachments = [createLocalPdfAttachment()];

      render(<PostAttachments attachments={null} localAttachments={localAttachments} />);

      await waitFor(() => {
        expect(screen.getByTestId('post-attachments-generic-files')).toBeInTheDocument();
        expect(screen.getByTestId('post-attachments-generic-files')).toHaveAttribute('data-count', '1');
      });

      expect(mockGetMetadata).not.toHaveBeenCalled();
    });

    it('categorizes mixed local attachment types correctly', async () => {
      const localAttachments = [
        createLocalImageAttachment(),
        createLocalVideoAttachment(),
        createLocalAudioAttachment(),
        createLocalPdfAttachment(),
      ];

      render(<PostAttachments attachments={null} localAttachments={localAttachments} />);

      await waitFor(() => {
        expect(screen.getByTestId('post-attachments-images-and-videos')).toHaveAttribute('data-count', '2');
        expect(screen.getByTestId('post-attachments-audios')).toHaveAttribute('data-count', '1');
        expect(screen.getByTestId('post-attachments-generic-files')).toHaveAttribute('data-count', '1');
      });

      expect(mockGetMetadata).not.toHaveBeenCalled();
    });

    it('handles local GIF images correctly (categorized with images)', async () => {
      const localAttachments = [createLocalGifAttachment()];

      render(<PostAttachments attachments={null} localAttachments={localAttachments} />);

      await waitFor(() => {
        expect(screen.getByTestId('post-attachments-images-and-videos')).toBeInTheDocument();
        expect(screen.getByTestId('post-attachments-images-and-videos')).toHaveAttribute('data-count', '1');
      });

      expect(mockGetMetadata).not.toHaveBeenCalled();
    });

    it('prioritizes localAttachments over remote attachments', async () => {
      const attachments = ['pubky://user1/pub/pubky.app/files/image1'];
      const localAttachments = [createLocalAudioAttachment()];
      mockGetMetadata.mockResolvedValue([createMockImageMetadata('user1:image1')]);

      render(<PostAttachments attachments={attachments} localAttachments={localAttachments} />);

      await waitFor(() => {
        // Should render audio (from local), not images (from remote)
        expect(screen.getByTestId('post-attachments-audios')).toBeInTheDocument();
      });

      // Should not call getMetadata when localAttachments is provided
      expect(mockGetMetadata).not.toHaveBeenCalled();
      expect(screen.queryByTestId('post-attachments-images-and-videos')).not.toBeInTheDocument();
    });

    it('renders nothing when localAttachments is empty array', () => {
      const { container } = render(<PostAttachments attachments={null} localAttachments={[]} />);
      expect(container.firstChild).toBeNull();
    });

    it('handles multiple local images correctly', async () => {
      const localAttachments = [
        createLocalImageAttachment('image1.jpg', 'blob:http://localhost/image1'),
        createLocalImageAttachment('image2.jpg', 'blob:http://localhost/image2'),
        createLocalImageAttachment('image3.jpg', 'blob:http://localhost/image3'),
      ];

      render(<PostAttachments attachments={null} localAttachments={localAttachments} />);

      await waitFor(() => {
        expect(screen.getByTestId('post-attachments-images-and-videos')).toHaveAttribute('data-count', '3');
      });
    });

    it('re-renders when localAttachments prop changes', async () => {
      const initialLocalAttachments = [createLocalImageAttachment()];
      const newLocalAttachments = [createLocalAudioAttachment()];

      const { rerender } = render(<PostAttachments attachments={null} localAttachments={initialLocalAttachments} />);

      await waitFor(() => {
        expect(screen.getByTestId('post-attachments-images-and-videos')).toBeInTheDocument();
      });

      rerender(<PostAttachments attachments={null} localAttachments={newLocalAttachments} />);

      await waitFor(() => {
        expect(screen.getByTestId('post-attachments-audios')).toBeInTheDocument();
        expect(screen.queryByTestId('post-attachments-images-and-videos')).not.toBeInTheDocument();
      });
    });

    it('does not render sub-components that have no matching local attachments', async () => {
      const localAttachments = [createLocalImageAttachment()];

      render(<PostAttachments attachments={null} localAttachments={localAttachments} />);

      await waitFor(() => {
        expect(screen.getByTestId('post-attachments-images-and-videos')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('post-attachments-audios')).not.toBeInTheDocument();
      expect(screen.queryByTestId('post-attachments-generic-files')).not.toBeInTheDocument();
    });
  });
});

describe('PostAttachments - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFileUrl.mockImplementation(({ fileId, variant }) => `https://cdn.example.com/${fileId}/${variant}`);
  });

  it('matches snapshot with images only', async () => {
    const attachments = ['pubky://user1/pub/pubky.app/files/image1', 'pubky://user1/pub/pubky.app/files/image2'];
    mockGetMetadata.mockResolvedValue([
      createMockImageMetadata('user1:image1'),
      createMockImageMetadata('user1:image2'),
    ]);

    const { container } = render(<PostAttachments attachments={attachments} localAttachments={undefined} />);

    await waitFor(() => {
      expect(screen.getByTestId('post-attachments-images-and-videos')).toBeInTheDocument();
    });

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with videos only', async () => {
    const attachments = ['pubky://user1/pub/pubky.app/files/video1', 'pubky://user1/pub/pubky.app/files/video2'];
    mockGetMetadata.mockResolvedValue([
      createMockVideoMetadata('user1:video1'),
      createMockVideoMetadata('user1:video2'),
    ]);

    const { container } = render(<PostAttachments attachments={attachments} localAttachments={undefined} />);

    await waitFor(() => {
      expect(screen.getByTestId('post-attachments-images-and-videos')).toBeInTheDocument();
    });

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with audios only', async () => {
    const attachments = ['pubky://user1/pub/pubky.app/files/audio1'];
    mockGetMetadata.mockResolvedValue([createMockAudioMetadata('user1:audio1')]);

    const { container } = render(<PostAttachments attachments={attachments} localAttachments={undefined} />);

    await waitFor(() => {
      expect(screen.getByTestId('post-attachments-audios')).toBeInTheDocument();
    });

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with generic files only', async () => {
    const attachments = ['pubky://user1/pub/pubky.app/files/doc1'];
    mockGetMetadata.mockResolvedValue([createMockPdfMetadata('user1:doc1')]);

    const { container } = render(<PostAttachments attachments={attachments} localAttachments={undefined} />);

    await waitFor(() => {
      expect(screen.getByTestId('post-attachments-generic-files')).toBeInTheDocument();
    });

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with mixed attachment types', async () => {
    const attachments = [
      'pubky://user1/pub/pubky.app/files/image1',
      'pubky://user1/pub/pubky.app/files/video1',
      'pubky://user1/pub/pubky.app/files/audio1',
      'pubky://user1/pub/pubky.app/files/doc1',
    ];
    mockGetMetadata.mockResolvedValue([
      createMockImageMetadata('user1:image1'),
      createMockVideoMetadata('user1:video1'),
      createMockAudioMetadata('user1:audio1'),
      createMockPdfMetadata('user1:doc1'),
    ]);

    const { container } = render(<PostAttachments attachments={attachments} localAttachments={undefined} />);

    await waitFor(() => {
      expect(screen.getByTestId('post-attachments-images-and-videos')).toBeInTheDocument();
      expect(screen.getByTestId('post-attachments-audios')).toBeInTheDocument();
      expect(screen.getByTestId('post-attachments-generic-files')).toBeInTheDocument();
    });

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with null attachments', () => {
    const { container } = render(<PostAttachments attachments={null} localAttachments={undefined} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with empty attachments', () => {
    const { container } = render(<PostAttachments attachments={[]} localAttachments={undefined} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with local attachments only', async () => {
    const localAttachments = [
      createLocalImageAttachment('image1.jpg', 'blob:http://localhost/image1'),
      createLocalAudioAttachment('audio1.mp3', 'blob:http://localhost/audio1'),
    ];

    const { container } = render(<PostAttachments attachments={null} localAttachments={localAttachments} />);

    await waitFor(() => {
      expect(screen.getByTestId('post-attachments-images-and-videos')).toBeInTheDocument();
      expect(screen.getByTestId('post-attachments-audios')).toBeInTheDocument();
    });

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with mixed local attachment types', async () => {
    const localAttachments = [
      createLocalImageAttachment(),
      createLocalVideoAttachment(),
      createLocalAudioAttachment(),
      createLocalPdfAttachment(),
    ];

    const { container } = render(<PostAttachments attachments={null} localAttachments={localAttachments} />);

    await waitFor(() => {
      expect(screen.getByTestId('post-attachments-images-and-videos')).toBeInTheDocument();
      expect(screen.getByTestId('post-attachments-audios')).toBeInTheDocument();
      expect(screen.getByTestId('post-attachments-generic-files')).toBeInTheDocument();
    });

    expect(container.firstChild).toMatchSnapshot();
  });
});
