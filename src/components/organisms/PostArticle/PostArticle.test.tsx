import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileVariant } from '@/services/nexus/file/file.types';
import type { AttachmentConstructed } from '../PostAttachments/PostAttachments.types';
import { PostArticle } from './PostArticle';

// Mock hooks
const mockUsePostArticle = vi.fn();
const mockHandleLinkClick = vi.fn();
const mockSetDialogOpen = vi.fn();

vi.mock('@/hooks/usePostArticle/usePostArticle', () => ({
  usePostArticle: (params: { content: string; attachments: string[]; coverImageVariant: FileVariant }) =>
    mockUsePostArticle(params),
}));

vi.mock('@/hooks/useLinkConfirmation/useLinkConfirmation', () => ({
  useLinkConfirmation: () => ({
    dialogOpen: false,
    setDialogOpen: mockSetDialogOpen,
    clickedLink: '',
    handleLinkClick: mockHandleLinkClick,
  }),
}));

// Mock atoms
vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="container" className={className}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Image/Image', () => {
  return {
    Image: ({
      src,
      alt,
      className,
      width,
      height,
    }: {
      src: string;
      alt: string;
      className?: string;
      width?: number;
      height?: number;
    }) => <img data-testid="cover-image" src={src} alt={alt} className={className} width={width} height={height} />,
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({ children, size, className }: { children: React.ReactNode; size?: string; className?: string }) => (
      <span data-testid="typography" data-size={size} className={className}>
        {children}
      </span>
    ),
  };
});

// Mock molecules
vi.mock('@/molecules/PostText/PostText', () => {
  return {
    PostText: ({
      content,
      isArticle,
      onLinkClick,
      className,
    }: {
      content: string;
      isArticle?: boolean;
      onLinkClick?: (url: string, e: React.MouseEvent) => void;
      className?: string;
    }) => (
      <div
        data-testid="post-text"
        data-is-article={isArticle}
        data-has-link-click={!!onLinkClick}
        className={className}
      >
        {content}
      </div>
    ),
  };
});

// Mock organisms
vi.mock('@/organisms/DialogCheckLink/DialogCheckLink', () => {
  return {
    DialogCheckLink: ({
      open,
      onOpenChangeAction,
      linkUrl,
    }: {
      open: boolean;
      onOpenChangeAction: (open: boolean) => void;
      linkUrl: string;
    }) => (
      <div data-testid="dialog-check-link" data-open={open} data-link-url={linkUrl}>
        <button data-testid="dialog-close" onClick={() => onOpenChangeAction(false)}>
          Close
        </button>
      </div>
    ),
  };
});

describe('PostArticle', () => {
  const defaultProps = {
    content: '{"title":"Test Article Title","body":"This is the article body content."}',
    attachments: ['pubky://user/pub/pubky.app/files/file-123'],
    localAttachments: undefined,
  };

  const mockLocalImageAttachment: AttachmentConstructed = {
    type: 'image/png',
    name: 'Local Cover Image',
    urls: {
      main: 'blob:http://localhost/local-cover-image',
    },
  } as AttachmentConstructed;

  const mockLocalVideoAttachment: AttachmentConstructed = {
    type: 'video/mp4',
    name: 'Local Video',
    urls: {
      main: 'blob:http://localhost/local-video',
    },
  } as AttachmentConstructed;

  const mockHookReturnWithImage = {
    title: 'Test Article Title',
    body: 'This is the article body content.',
    coverImage: {
      src: 'https://example.com/cover-image.jpg',
      alt: 'Cover Image',
    },
  };

  const mockHookReturnWithoutImage = {
    title: 'Test Article Title',
    body: 'This is the article body content.',
    coverImage: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePostArticle.mockReturnValue(mockHookReturnWithImage);
  });

  describe('Rendering', () => {
    it('renders article with title and body', () => {
      render(<PostArticle {...defaultProps} />);

      expect(screen.getByTestId('typography')).toBeInTheDocument();
      expect(screen.getByText('Test Article Title')).toBeInTheDocument();
      expect(screen.getByTestId('post-text')).toBeInTheDocument();
      expect(screen.getByText('This is the article body content.')).toBeInTheDocument();
    });

    it('renders cover image when available', () => {
      render(<PostArticle {...defaultProps} />);

      const image = screen.getByTestId('cover-image');
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute('src', 'https://example.com/cover-image.jpg');
      expect(image).toHaveAttribute('alt', 'Cover Image');
    });

    it('does not render cover image when not available', () => {
      mockUsePostArticle.mockReturnValue(mockHookReturnWithoutImage);

      render(<PostArticle {...defaultProps} />);

      expect(screen.queryByTestId('cover-image')).not.toBeInTheDocument();
    });

    it('applies custom className to container', () => {
      render(<PostArticle {...defaultProps} className="custom-class" />);

      const containers = screen.getAllByTestId('container');
      expect(containers[0]).toHaveClass('custom-class');
    });

    it('passes isArticle prop to PostText', () => {
      render(<PostArticle {...defaultProps} />);

      const postText = screen.getByTestId('post-text');
      expect(postText).toHaveAttribute('data-is-article', 'true');
    });

    it('passes onLinkClick handler to PostText', () => {
      render(<PostArticle {...defaultProps} />);

      const postText = screen.getByTestId('post-text');
      expect(postText).toHaveAttribute('data-has-link-click', 'true');
    });

    it('renders DialogCheckLink dialog', () => {
      render(<PostArticle {...defaultProps} />);

      const dialog = screen.getByTestId('dialog-check-link');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('data-open', 'false');
    });

    it('renders typography with large size', () => {
      render(<PostArticle {...defaultProps} />);

      const typography = screen.getByTestId('typography');
      expect(typography).toHaveAttribute('data-size', 'lg');
    });
  });

  describe('Hook Integration', () => {
    it('calls usePostArticle with correct parameters', () => {
      render(<PostArticle {...defaultProps} />);

      expect(mockUsePostArticle).toHaveBeenCalledWith({
        content: defaultProps.content,
        attachments: defaultProps.attachments,
        coverImageVariant: FileVariant.FEED,
      });
    });

    it('calls usePostArticle with empty attachments', () => {
      render(<PostArticle content={defaultProps.content} attachments={[]} localAttachments={undefined} />);

      expect(mockUsePostArticle).toHaveBeenCalledWith({
        content: defaultProps.content,
        attachments: [],
        coverImageVariant: FileVariant.FEED,
      });
    });

    it('calls usePostArticle with multiple attachments', () => {
      const multipleAttachments = [
        'pubky://user/pub/pubky.app/files/file-123',
        'pubky://user/pub/pubky.app/files/file-456',
      ];

      render(
        <PostArticle content={defaultProps.content} attachments={multipleAttachments} localAttachments={undefined} />,
      );

      expect(mockUsePostArticle).toHaveBeenCalledWith({
        content: defaultProps.content,
        attachments: multipleAttachments,
        coverImageVariant: FileVariant.FEED,
      });
    });
  });

  describe('Local Attachments', () => {
    it('renders local cover image when localAttachments has an image', () => {
      render(<PostArticle {...defaultProps} localAttachments={[mockLocalImageAttachment]} />);

      const image = screen.getByTestId('cover-image');
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute('src', 'blob:http://localhost/local-cover-image');
      expect(image).toHaveAttribute('alt', 'Local Cover Image');
    });

    it('prioritizes local cover image over hook cover image', () => {
      mockUsePostArticle.mockReturnValue(mockHookReturnWithImage);

      render(<PostArticle {...defaultProps} localAttachments={[mockLocalImageAttachment]} />);

      const image = screen.getByTestId('cover-image');
      expect(image).toHaveAttribute('src', 'blob:http://localhost/local-cover-image');
      expect(image).not.toHaveAttribute('src', 'https://example.com/cover-image.jpg');
    });

    it('falls back to hook cover image when localAttachments is not an image', () => {
      mockUsePostArticle.mockReturnValue(mockHookReturnWithImage);

      render(<PostArticle {...defaultProps} localAttachments={[mockLocalVideoAttachment]} />);

      const image = screen.getByTestId('cover-image');
      expect(image).toHaveAttribute('src', 'https://example.com/cover-image.jpg');
    });

    it('does not render cover image when localAttachments is not an image and hook has no image', () => {
      mockUsePostArticle.mockReturnValue(mockHookReturnWithoutImage);

      render(<PostArticle {...defaultProps} localAttachments={[mockLocalVideoAttachment]} />);

      expect(screen.queryByTestId('cover-image')).not.toBeInTheDocument();
    });

    it('renders hook cover image when localAttachments is undefined', () => {
      mockUsePostArticle.mockReturnValue(mockHookReturnWithImage);

      render(<PostArticle {...defaultProps} localAttachments={undefined} />);

      const image = screen.getByTestId('cover-image');
      expect(image).toHaveAttribute('src', 'https://example.com/cover-image.jpg');
    });

    it('renders hook cover image when localAttachments is empty array', () => {
      mockUsePostArticle.mockReturnValue(mockHookReturnWithImage);

      render(<PostArticle {...defaultProps} localAttachments={[]} />);

      const image = screen.getByTestId('cover-image');
      expect(image).toHaveAttribute('src', 'https://example.com/cover-image.jpg');
    });
  });

  describe('Cover Image Styling', () => {
    it('renders cover image with correct dimensions', () => {
      render(<PostArticle {...defaultProps} />);

      const image = screen.getByTestId('cover-image');
      expect(image).toHaveAttribute('width', '180');
      expect(image).toHaveAttribute('height', '100');
    });

    it('renders cover image with correct styling classes', () => {
      render(<PostArticle {...defaultProps} />);

      const image = screen.getByTestId('cover-image');
      expect(image).toHaveClass('h-25');
      expect(image).toHaveClass('w-45');
      expect(image).toHaveClass('rounded-md');
      expect(image).toHaveClass('object-cover');
      expect(image).toHaveClass('object-center');
    });
  });

  describe('Snapshots', () => {
    it('matches snapshot with cover image', () => {
      const { container } = render(<PostArticle {...defaultProps} />);

      expect(container).toMatchSnapshot();
    });

    it('matches snapshot without cover image', () => {
      mockUsePostArticle.mockReturnValue(mockHookReturnWithoutImage);

      const { container } = render(<PostArticle {...defaultProps} />);

      expect(container).toMatchSnapshot();
    });

    it('matches snapshot with custom className', () => {
      const { container } = render(<PostArticle {...defaultProps} className="custom-article-class" />);

      expect(container).toMatchSnapshot();
    });

    it('matches snapshot with long title and body', () => {
      mockUsePostArticle.mockReturnValue({
        title: 'This is a very long article title that might wrap to multiple lines in the UI',
        body: 'This is a much longer article body content that contains multiple sentences. It should properly handle long text content and display it correctly within the component boundaries.',
        coverImage: mockHookReturnWithImage.coverImage,
      });

      const { container } = render(<PostArticle {...defaultProps} />);

      expect(container).toMatchSnapshot();
    });

    it('matches snapshot with local cover image', () => {
      const { container } = render(<PostArticle {...defaultProps} localAttachments={[mockLocalImageAttachment]} />);

      expect(container).toMatchSnapshot();
    });

    it('matches snapshot with local video attachment falling back to hook image', () => {
      mockUsePostArticle.mockReturnValue(mockHookReturnWithImage);

      const { container } = render(<PostArticle {...defaultProps} localAttachments={[mockLocalVideoAttachment]} />);

      expect(container).toMatchSnapshot();
    });
  });
});
