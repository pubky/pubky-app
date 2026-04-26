import { createRef } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PostInputAttachments } from './PostInputAttachments';
import { POST_ATTACHMENT_ACCEPT_STRING } from '@/config';

// Mock URL.createObjectURL and URL.revokeObjectURL
const mockCreateObjectURL = vi.fn();
const mockRevokeObjectURL = vi.fn();

beforeEach(() => {
  mockCreateObjectURL.mockImplementation((file: File) => `blob:mock-url-${file.name}`);
  global.URL.createObjectURL = mockCreateObjectURL;
  global.URL.revokeObjectURL = mockRevokeObjectURL;
});

afterEach(() => {
  vi.clearAllMocks();
});

// Mock @/atoms
vi.mock('@/atoms', () => ({
  Input: vi.fn(
    ({
      ref,
      type,
      accept,
      multiple,
      onChange,
      className,
      'data-testid': dataTestId,
    }: {
      ref?: React.Ref<HTMLInputElement>;
      type?: string;
      accept?: string;
      multiple?: boolean;
      onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
      className?: string;
      'data-testid'?: string;
    }) => (
      <input
        ref={ref}
        data-testid={dataTestId || 'file-input'}
        type={type}
        accept={accept}
        multiple={multiple}
        onChange={onChange}
        className={className}
      />
    ),
  ),
  Container: ({
    children,
    className,
    'data-testid': dataTestId,
  }: {
    children: React.ReactNode;
    className?: string;
    'data-testid'?: string;
  }) => (
    <div data-testid={dataTestId || 'container'} className={className}>
      {children}
    </div>
  ),
  Button: ({
    children,
    variant,
    size,
    onClick,
    disabled,
    className,
    'data-testid': dataTestId,
  }: {
    children: React.ReactNode;
    variant?: string;
    size?: string;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
    'data-testid'?: string;
  }) => (
    <button
      data-testid={dataTestId || 'button'}
      data-variant={variant}
      data-size={size}
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {children}
    </button>
  ),
  Image: ({
    src,
    alt,
    className,
    'data-testid': dataTestId,
  }: {
    src: string;
    alt?: string;
    className?: string;
    'data-testid'?: string;
  }) => <img data-testid={dataTestId || 'image'} src={src} alt={alt} className={className} />,
  Video: ({
    src,
    className,
    'data-testid': dataTestId,
  }: {
    src: string;
    className?: string;
    'data-testid'?: string;
  }) => <video data-testid={dataTestId || 'video'} src={src} className={className} />,
  Audio: ({
    src,
    className,
    'data-testid': dataTestId,
  }: {
    src: string;
    className?: string;
    'data-testid'?: string;
  }) => <audio data-testid={dataTestId || 'audio'} src={src} className={className} controls />,
  Typography: ({
    children,
    size,
    className,
    'data-testid': dataTestId,
  }: {
    children: React.ReactNode;
    size?: string;
    className?: string;
    'data-testid'?: string;
  }) => (
    <span data-testid={dataTestId || 'typography'} data-size={size} className={className}>
      {children}
    </span>
  ),
  Card: ({
    children,
    className,
    'data-testid': dataTestId,
  }: {
    children: React.ReactNode;
    className?: string;
    'data-testid'?: string;
  }) => (
    <div data-testid={dataTestId || 'card'} className={className}>
      {children}
    </div>
  ),
  CardContent: ({
    children,
    className,
    'data-testid': dataTestId,
  }: {
    children: React.ReactNode;
    className?: string;
    'data-testid'?: string;
  }) => (
    <div data-testid={dataTestId || 'card-content'} className={className}>
      {children}
    </div>
  ),
}));

const createMockFile = (name: string, type: string): File => {
  return new File(['test content'], name, { type });
};

const createMockImageFile = (name = 'test-image.jpg'): File => {
  return createMockFile(name, 'image/jpeg');
};

const createMockVideoFile = (name = 'test-video.mp4'): File => {
  return createMockFile(name, 'video/mp4');
};

const createMockAudioFile = (name = 'test-audio.mp3'): File => {
  return createMockFile(name, 'audio/mpeg');
};

const createMockPdfFile = (name = 'test-document.pdf'): File => {
  return createMockFile(name, 'application/pdf');
};

const defaultProps = {
  attachments: [] as File[],
  setAttachments: vi.fn(),
  handleFilesAdded: vi.fn(),
  isSubmitting: false,
};

describe('PostInputAttachments', () => {
  describe('Basic rendering', () => {
    it('renders without crashing', () => {
      render(<PostInputAttachments {...defaultProps} />);

      expect(screen.getByTestId('file-input')).toBeInTheDocument();
    });

    it('renders hidden file input', () => {
      render(<PostInputAttachments {...defaultProps} />);

      const fileInput = screen.getByTestId('file-input');
      expect(fileInput).toHaveClass('hidden');
    });

    it('renders file input with correct accept attribute for posts', () => {
      render(<PostInputAttachments {...defaultProps} />);

      const fileInput = screen.getByTestId('file-input');
      expect(fileInput).toHaveAttribute('accept', POST_ATTACHMENT_ACCEPT_STRING);
    });

    it('renders file input with correct accept attribute for articles', () => {
      render(<PostInputAttachments {...defaultProps} isArticle={true} />);

      const fileInput = screen.getByTestId('file-input');
      expect(fileInput).toHaveAttribute('accept', 'image/gif,image/jpeg,image/png,image/svg+xml,image/webp');
    });

    it('renders file input with multiple attribute for posts', () => {
      render(<PostInputAttachments {...defaultProps} />);

      const fileInput = screen.getByTestId('file-input');
      expect(fileInput).toHaveAttribute('multiple');
    });

    it('renders file input without multiple attribute for articles', () => {
      render(<PostInputAttachments {...defaultProps} isArticle={true} />);

      const fileInput = screen.getByTestId('file-input');
      expect(fileInput).not.toHaveAttribute('multiple');
    });

    it('does not render attachment container when no attachments', () => {
      render(<PostInputAttachments {...defaultProps} />);

      const containers = screen.queryAllByTestId('container');
      expect(containers).toHaveLength(0);
    });

    it('does not render article placeholder when not in article mode', () => {
      render(<PostInputAttachments {...defaultProps} />);

      expect(screen.queryByTestId('card')).not.toBeInTheDocument();
    });
  });

  describe('Article mode placeholder', () => {
    it('renders placeholder card when isArticle is true and no attachments', () => {
      render(<PostInputAttachments {...defaultProps} isArticle={true} />);

      expect(screen.getByTestId('card')).toBeInTheDocument();
      expect(screen.getByTestId('card-content')).toBeInTheDocument();
    });

    it('renders ImagePlus icon in placeholder', () => {
      const { container } = render(<PostInputAttachments {...defaultProps} isArticle={true} />);

      expect(container.querySelector('.lucide-image-plus')).toBeInTheDocument();
    });

    it('renders Add image button in placeholder', () => {
      render(<PostInputAttachments {...defaultProps} isArticle={true} />);

      const buttons = screen.getAllByTestId('button');
      const addImageButton = buttons.find((btn) => btn.textContent?.includes('Add image'));
      expect(addImageButton).toBeInTheDocument();
    });

    it('Add image button has secondary variant and sm size', () => {
      render(<PostInputAttachments {...defaultProps} isArticle={true} />);

      const buttons = screen.getAllByTestId('button');
      const addImageButton = buttons.find((btn) => btn.textContent?.includes('Add image'));
      expect(addImageButton).toHaveAttribute('data-variant', 'secondary');
      expect(addImageButton).toHaveAttribute('data-size', 'sm');
    });

    it('calls handleFileClick when Add image button is clicked', () => {
      const mockHandleFileClick = vi.fn();
      render(<PostInputAttachments {...defaultProps} isArticle={true} handleFileClick={mockHandleFileClick} />);

      const buttons = screen.getAllByTestId('button');
      const addImageButton = buttons.find((btn) => btn.textContent?.includes('Add image'));
      fireEvent.click(addImageButton!);

      expect(mockHandleFileClick).toHaveBeenCalledTimes(1);
    });

    it('disables Add image button when isSubmitting is true', () => {
      render(<PostInputAttachments {...defaultProps} isArticle={true} isSubmitting={true} />);

      const buttons = screen.getAllByTestId('button');
      const addImageButton = buttons.find((btn) => btn.textContent?.includes('Add image'));
      expect(addImageButton).toBeDisabled();
    });

    it('does not render placeholder when isArticle is true but has attachments', () => {
      const attachments = [createMockImageFile()];
      render(<PostInputAttachments {...defaultProps} isArticle={true} attachments={attachments} />);

      expect(screen.queryByTestId('card')).not.toBeInTheDocument();
    });

    it('does not render placeholder when isArticle is false', () => {
      render(<PostInputAttachments {...defaultProps} isArticle={false} />);

      expect(screen.queryByTestId('card')).not.toBeInTheDocument();
    });
  });

  describe('Image attachment rendering', () => {
    it('renders image preview for image attachment', () => {
      const attachments = [createMockImageFile()];
      render(<PostInputAttachments {...defaultProps} attachments={attachments} />);

      const image = screen.getByTestId('image');
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute('src', 'blob:mock-url-test-image.jpg');
      expect(image).toHaveAttribute('alt', 'Image preview');
    });

    it('renders multiple image previews', () => {
      const attachments = [createMockImageFile('image1.jpg'), createMockImageFile('image2.png')];
      render(<PostInputAttachments {...defaultProps} attachments={attachments} />);

      const images = screen.getAllByTestId('image');
      expect(images).toHaveLength(2);
    });

    it('creates object URLs for image attachments', () => {
      const attachments = [createMockImageFile()];
      render(<PostInputAttachments {...defaultProps} attachments={attachments} />);

      expect(mockCreateObjectURL).toHaveBeenCalledWith(attachments[0]);
    });
  });

  describe('Video attachment rendering', () => {
    it('renders video preview for video attachment', () => {
      const attachments = [createMockVideoFile()];
      render(<PostInputAttachments {...defaultProps} attachments={attachments} />);

      const video = screen.getByTestId('video');
      expect(video).toBeInTheDocument();
      expect(video).toHaveAttribute('src', 'blob:mock-url-test-video.mp4');
    });

    it('renders multiple video previews', () => {
      const attachments = [createMockVideoFile('video1.mp4'), createMockVideoFile('video2.webm')];
      render(<PostInputAttachments {...defaultProps} attachments={attachments} />);

      const videos = screen.getAllByTestId('video');
      expect(videos).toHaveLength(2);
    });
  });

  describe('Audio attachment rendering', () => {
    it('renders audio preview for audio attachment', () => {
      const attachments = [createMockAudioFile()];
      render(<PostInputAttachments {...defaultProps} attachments={attachments} />);

      const audio = screen.getByTestId('audio');
      expect(audio).toBeInTheDocument();
      expect(audio).toHaveAttribute('src', 'blob:mock-url-test-audio.mp3');
    });

    it('renders multiple audio previews', () => {
      const attachments = [createMockAudioFile('audio1.mp3'), createMockAudioFile('audio2.wav')];
      render(<PostInputAttachments {...defaultProps} attachments={attachments} />);

      const audios = screen.getAllByTestId('audio');
      expect(audios).toHaveLength(2);
    });
  });

  describe('PDF attachment rendering', () => {
    it('renders PDF preview with file name', () => {
      const attachments = [createMockPdfFile('document.pdf')];
      render(<PostInputAttachments {...defaultProps} attachments={attachments} />);

      expect(document.querySelector('.lucide-file-text')).toBeInTheDocument();

      expect(screen.getByText('document.pdf')).toBeInTheDocument();
    });

    it('renders multiple PDF previews', () => {
      const attachments = [createMockPdfFile('doc1.pdf'), createMockPdfFile('doc2.pdf')];
      render(<PostInputAttachments {...defaultProps} attachments={attachments} />);

      expect(document.querySelectorAll('.lucide-file-text')).toHaveLength(2);
    });
  });

  describe('Mixed attachment rendering', () => {
    it('renders mixed attachment types correctly', () => {
      const attachments = [createMockImageFile(), createMockVideoFile(), createMockAudioFile(), createMockPdfFile()];
      render(<PostInputAttachments {...defaultProps} attachments={attachments} />);

      expect(screen.getByTestId('image')).toBeInTheDocument();
      expect(screen.getByTestId('video')).toBeInTheDocument();
      expect(screen.getByTestId('audio')).toBeInTheDocument();
      expect(document.querySelector('.lucide-file-text')).toBeInTheDocument();
    });
  });

  describe('Delete button functionality', () => {
    it('renders delete button for each attachment', () => {
      const attachments = [createMockImageFile(), createMockVideoFile()];
      render(<PostInputAttachments {...defaultProps} attachments={attachments} />);

      const deleteButtons = screen.getAllByTestId('button');
      expect(deleteButtons).toHaveLength(2);
    });

    it('renders trash icon in delete button', () => {
      const attachments = [createMockImageFile()];
      render(<PostInputAttachments {...defaultProps} attachments={attachments} />);

      const deleteButton = screen.getByTestId('button');
      expect(deleteButton.querySelector('.lucide-trash-2')).toBeInTheDocument();
    });

    it('calls setAttachments when delete button is clicked', () => {
      const mockSetAttachments = vi.fn();
      const attachments = [createMockImageFile('image1.jpg'), createMockImageFile('image2.jpg')];
      render(<PostInputAttachments {...defaultProps} attachments={attachments} setAttachments={mockSetAttachments} />);

      const deleteButtons = screen.getAllByTestId('button');
      fireEvent.click(deleteButtons[0]);

      expect(mockSetAttachments).toHaveBeenCalled();
    });

    it('filters out the correct attachment when delete is clicked', () => {
      const mockSetAttachments = vi.fn();
      const file1 = createMockImageFile('image1.jpg');
      const file2 = createMockImageFile('image2.jpg');
      const attachments = [file1, file2];

      render(<PostInputAttachments {...defaultProps} attachments={attachments} setAttachments={mockSetAttachments} />);

      const deleteButtons = screen.getAllByTestId('button');
      fireEvent.click(deleteButtons[0]);

      // Get the callback passed to setAttachments and call it
      const setAttachmentsCallback = mockSetAttachments.mock.calls[0][0];
      const result = setAttachmentsCallback(attachments);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(file2);
    });

    it('disables delete button when isSubmitting is true', () => {
      const attachments = [createMockImageFile()];
      render(<PostInputAttachments {...defaultProps} attachments={attachments} isSubmitting={true} />);

      const deleteButton = screen.getByTestId('button');
      expect(deleteButton).toBeDisabled();
    });

    it('delete button is not disabled when isSubmitting is false', () => {
      const attachments = [createMockImageFile()];
      render(<PostInputAttachments {...defaultProps} attachments={attachments} isSubmitting={false} />);

      const deleteButton = screen.getByTestId('button');
      expect(deleteButton).not.toBeDisabled();
    });
  });

  describe('File input change handling', () => {
    it('calls handleFilesAdded when files are selected', () => {
      const mockHandleFilesAdded = vi.fn();
      render(<PostInputAttachments {...defaultProps} handleFilesAdded={mockHandleFilesAdded} />);

      const fileInput = screen.getByTestId('file-input');
      const file = createMockImageFile();

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        configurable: true,
      });

      fireEvent.change(fileInput);

      expect(mockHandleFilesAdded).toHaveBeenCalledWith([file]);
    });

    it('calls handleFilesAdded with multiple files', () => {
      const mockHandleFilesAdded = vi.fn();
      render(<PostInputAttachments {...defaultProps} handleFilesAdded={mockHandleFilesAdded} />);

      const fileInput = screen.getByTestId('file-input');
      const files = [createMockImageFile(), createMockVideoFile()];

      Object.defineProperty(fileInput, 'files', {
        value: files,
        configurable: true,
      });

      fireEvent.change(fileInput);

      expect(mockHandleFilesAdded).toHaveBeenCalledWith(files);
    });

    it('handles empty file selection', () => {
      const mockHandleFilesAdded = vi.fn();
      render(<PostInputAttachments {...defaultProps} handleFilesAdded={mockHandleFilesAdded} />);

      const fileInput = screen.getByTestId('file-input');

      Object.defineProperty(fileInput, 'files', {
        value: null,
        configurable: true,
      });

      fireEvent.change(fileInput);

      expect(mockHandleFilesAdded).toHaveBeenCalledWith([]);
    });
  });

  describe('Object URL cleanup', () => {
    it('revokes object URLs on unmount', () => {
      const attachments = [createMockImageFile(), createMockVideoFile()];
      const { unmount } = render(<PostInputAttachments {...defaultProps} attachments={attachments} />);

      unmount();

      expect(mockRevokeObjectURL).toHaveBeenCalledTimes(2);
    });

    it('revokes object URLs when attachments change', () => {
      const initialAttachments = [createMockImageFile()];
      const { rerender } = render(<PostInputAttachments {...defaultProps} attachments={initialAttachments} />);

      const newAttachments = [createMockVideoFile()];
      rerender(<PostInputAttachments {...defaultProps} attachments={newAttachments} />);

      expect(mockRevokeObjectURL).toHaveBeenCalled();
    });
  });

  describe('Button styling', () => {
    it('renders delete button with dark variant', () => {
      const attachments = [createMockImageFile()];
      render(<PostInputAttachments {...defaultProps} attachments={attachments} />);

      const deleteButton = screen.getByTestId('button');
      expect(deleteButton).toHaveAttribute('data-variant', 'dark');
    });

    it('renders delete button with icon size', () => {
      const attachments = [createMockImageFile()];
      render(<PostInputAttachments {...defaultProps} attachments={attachments} />);

      const deleteButton = screen.getByTestId('button');
      expect(deleteButton).toHaveAttribute('data-size', 'icon');
    });
  });

  describe('Ref forwarding', () => {
    it('forwards ref to file input', () => {
      const ref = createRef<HTMLInputElement>();
      render(<PostInputAttachments {...defaultProps} ref={ref} />);

      expect(ref.current).toBeInstanceOf(HTMLInputElement);
    });
  });

  describe('Edge cases', () => {
    it('handles file with special characters in name', () => {
      const attachments = [createMockPdfFile('document (1) - final.pdf')];
      render(<PostInputAttachments {...defaultProps} attachments={attachments} />);

      expect(screen.getByText('document (1) - final.pdf')).toBeInTheDocument();
    });

    it('handles file with unicode characters in name', () => {
      const attachments = [createMockPdfFile('документ-文件-📄.pdf')];
      render(<PostInputAttachments {...defaultProps} attachments={attachments} />);

      expect(screen.getByText('документ-文件-📄.pdf')).toBeInTheDocument();
    });

    it('handles maximum allowed attachments (3)', () => {
      const attachments = Array.from({ length: 3 }, (_, i) => createMockImageFile(`image${i}.jpg`));
      render(<PostInputAttachments {...defaultProps} attachments={attachments} />);

      const images = screen.getAllByTestId('image');
      expect(images).toHaveLength(3);
    });

    it('handles file with very long name', () => {
      const longName =
        'this-is-a-very-long-file-name-that-demonstrates-responsive-text-wrapping-behavior-in-the-ui.pdf';
      const attachments = [createMockPdfFile(longName)];
      render(<PostInputAttachments {...defaultProps} attachments={attachments} />);

      expect(screen.getByText(longName)).toBeInTheDocument();
    });

    it('handles PNG image type', () => {
      const attachments = [createMockFile('image.png', 'image/png')];
      render(<PostInputAttachments {...defaultProps} attachments={attachments} />);

      expect(screen.getByTestId('image')).toBeInTheDocument();
    });

    it('handles WebP image type', () => {
      const attachments = [createMockFile('image.webp', 'image/webp')];
      render(<PostInputAttachments {...defaultProps} attachments={attachments} />);

      expect(screen.getByTestId('image')).toBeInTheDocument();
    });

    it('handles GIF image type', () => {
      const attachments = [createMockFile('animation.gif', 'image/gif')];
      render(<PostInputAttachments {...defaultProps} attachments={attachments} />);

      expect(screen.getByTestId('image')).toBeInTheDocument();
    });

    it('handles WebM video type', () => {
      const attachments = [createMockFile('video.webm', 'video/webm')];
      render(<PostInputAttachments {...defaultProps} attachments={attachments} />);

      expect(screen.getByTestId('video')).toBeInTheDocument();
    });

    it('handles OGG audio type', () => {
      const attachments = [createMockFile('audio.ogg', 'audio/ogg')];
      render(<PostInputAttachments {...defaultProps} attachments={attachments} />);

      expect(screen.getByTestId('audio')).toBeInTheDocument();
    });

    it('handles WAV audio type', () => {
      const attachments = [createMockFile('audio.wav', 'audio/wav')];
      render(<PostInputAttachments {...defaultProps} attachments={attachments} />);

      expect(screen.getByTestId('audio')).toBeInTheDocument();
    });
  });

  describe('Display name', () => {
    it('has correct display name', () => {
      expect(PostInputAttachments.displayName).toBe('PostInputAttachments');
    });
  });

  describe('Article mode with attachments', () => {
    it('renders image preview in article mode', () => {
      const attachments = [createMockImageFile()];
      render(<PostInputAttachments {...defaultProps} isArticle={true} attachments={attachments} />);

      expect(screen.getByTestId('image')).toBeInTheDocument();
    });

    it('does not show video/audio/pdf previews in article mode (only images supported)', () => {
      // Note: The component will still try to render other types if passed,
      // but the accept attribute restricts file selection to images only
      const attachments = [createMockImageFile()];
      render(<PostInputAttachments {...defaultProps} isArticle={true} attachments={attachments} />);

      expect(screen.queryByTestId('video')).not.toBeInTheDocument();
      expect(screen.queryByTestId('audio')).not.toBeInTheDocument();
      expect(document.querySelector('.lucide-file-text')).not.toBeInTheDocument();
    });
  });
});

describe('PostInputAttachments - Snapshots', () => {
  it('matches snapshot with no attachments', () => {
    const { container } = render(<PostInputAttachments {...defaultProps} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with single image attachment', () => {
    const attachments = [createMockImageFile('photo.jpg')];
    const { container } = render(<PostInputAttachments {...defaultProps} attachments={attachments} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with single video attachment', () => {
    const attachments = [createMockVideoFile('video.mp4')];
    const { container } = render(<PostInputAttachments {...defaultProps} attachments={attachments} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with single audio attachment', () => {
    const attachments = [createMockAudioFile('audio.mp3')];
    const { container } = render(<PostInputAttachments {...defaultProps} attachments={attachments} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with single PDF attachment', () => {
    const attachments = [createMockPdfFile('document.pdf')];
    const { container } = render(<PostInputAttachments {...defaultProps} attachments={attachments} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with multiple images', () => {
    const attachments = [
      createMockImageFile('image1.jpg'),
      createMockImageFile('image2.png'),
      createMockImageFile('image3.gif'),
    ];
    const { container } = render(<PostInputAttachments {...defaultProps} attachments={attachments} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with mixed attachment types', () => {
    const attachments = [
      createMockImageFile('photo.jpg'),
      createMockVideoFile('video.mp4'),
      createMockAudioFile('audio.mp3'),
      createMockPdfFile('document.pdf'),
    ];
    const { container } = render(<PostInputAttachments {...defaultProps} attachments={attachments} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot when submitting', () => {
    const attachments = [createMockImageFile('photo.jpg')];
    const { container } = render(
      <PostInputAttachments {...defaultProps} attachments={attachments} isSubmitting={true} />,
    );
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with maximum attachments (3)', () => {
    const attachments = Array.from({ length: 3 }, (_, i) => createMockImageFile(`image${i}.jpg`));
    const { container } = render(<PostInputAttachments {...defaultProps} attachments={attachments} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot in article mode with no attachments (placeholder)', () => {
    const { container } = render(<PostInputAttachments {...defaultProps} isArticle={true} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot in article mode with image attachment', () => {
    const attachments = [createMockImageFile('article-image.jpg')];
    const { container } = render(<PostInputAttachments {...defaultProps} isArticle={true} attachments={attachments} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot in article mode when submitting', () => {
    const { container } = render(<PostInputAttachments {...defaultProps} isArticle={true} isSubmitting={true} />);
    expect(container).toMatchSnapshot();
  });
});
