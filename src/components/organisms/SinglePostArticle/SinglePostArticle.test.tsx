import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SinglePostArticle } from './SinglePostArticle';
import * as Hooks from '@/hooks';
import * as Core from '@/core';
import type { AttachmentConstructed } from '../PostAttachments/PostAttachments.types';

// Mock hooks
vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>();
  return {
    ...actual,
    usePostArticle: vi.fn(),
    useLinkConfirmation: vi.fn().mockReturnValue({
      dialogOpen: false,
      setDialogOpen: vi.fn(),
      clickedLink: '',
      handleLinkClick: vi.fn(),
    }),
  };
});

// Mock atoms
vi.mock('@/atoms', () => ({
  Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="container" className={className}>
      {children}
    </div>
  ),
  Typography: ({
    children,
    as: Tag = 'p',
    size,
    className,
  }: {
    children: React.ReactNode;
    as?: React.ElementType;
    size?: string;
    className?: string;
  }) => (
    <Tag data-testid="typography" data-size={size} className={className}>
      {children}
    </Tag>
  ),
  Image: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    <img data-testid="cover-image" src={src} alt={alt} className={className} />
  ),
}));

// Mock molecules
vi.mock('@/molecules', () => ({
  PostText: ({
    content,
    isArticle,
    onLinkClick,
  }: {
    content: string;
    isArticle?: boolean;
    onLinkClick?: (url: string, e: React.MouseEvent) => void;
  }) => (
    <div data-testid="post-text" data-is-article={isArticle} data-has-link-click={!!onLinkClick}>
      {content}
    </div>
  ),
}));

// Mock organisms
vi.mock('@/organisms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/organisms')>();
  return {
    ...actual,
    PostHeader: ({ postId, size, timeAgoPlacement }: { postId: string; size?: string; timeAgoPlacement?: string }) => (
      <div data-testid="post-header" data-post-id={postId} data-size={size} data-time-placement={timeAgoPlacement}>
        PostHeader
      </div>
    ),
    PostActionsBar: ({
      postId,
      onReplyClick,
      onRepostClick,
      className,
    }: {
      postId: string;
      onReplyClick?: () => void;
      onRepostClick?: () => void;
      className?: string;
    }) => (
      <div data-testid="post-actions-bar" data-post-id={postId} className={className}>
        <button data-testid="reply-button" onClick={onReplyClick}>
          Reply
        </button>
        <button data-testid="repost-button" onClick={onRepostClick}>
          Repost
        </button>
      </div>
    ),
    PostContentBlurred: ({ postId }: { postId: string }) => (
      <div data-testid="post-content-blurred" data-post-id={postId}>
        Blurred Content
      </div>
    ),
    PostTagsPanel: ({ postId, className }: { postId: string; className?: string }) => (
      <div data-testid="post-tags-panel" data-post-id={postId} className={className}>
        Tags Panel
      </div>
    ),
    DialogReply: ({
      postId,
      open,
      onOpenChangeAction,
    }: {
      postId: string;
      open: boolean;
      onOpenChangeAction: (open: boolean) => void;
    }) => (
      <div data-testid="dialog-reply" data-post-id={postId} data-open={open}>
        <button data-testid="close-reply-dialog" onClick={() => onOpenChangeAction(false)}>
          Close Reply
        </button>
      </div>
    ),
    DialogRepost: ({
      postId,
      open,
      onOpenChangeAction,
    }: {
      postId: string;
      open: boolean;
      onOpenChangeAction: (open: boolean) => void;
    }) => (
      <div data-testid="dialog-repost" data-post-id={postId} data-open={open}>
        <button data-testid="close-repost-dialog" onClick={() => onOpenChangeAction(false)}>
          Close Repost
        </button>
      </div>
    ),
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
        <button data-testid="dialog-check-link-close" onClick={() => onOpenChangeAction(false)}>
          Close Check Link
        </button>
      </div>
    ),
  };
});

// Mock core with importOriginal to preserve all exports
vi.mock('@/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core')>();
  return {
    ...actual,
    useLocalFilesStore: vi.fn(),
  };
});

const mockUseLocalFilesStore = vi.mocked(Core.useLocalFilesStore);

// Helper to create a mock LocalFilesStore state with required actions
const createMockLocalFilesStore = (posts: Record<string, AttachmentConstructed[] | undefined> = {}) => ({
  profile: null,
  posts,
  setProfile: vi.fn(),
  setPostAttachments: vi.fn(),
  reset: vi.fn(),
});

// Use real libs
vi.mock('@/libs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs')>();
  return { ...actual };
});

const mockUsePostArticle = vi.mocked(Hooks.usePostArticle);

describe('SinglePostArticle', () => {
  const defaultProps = {
    postId: 'user123:post456',
    content: '{"title":"Test Article Title","body":"Test article body content"}',
    attachments: null,
    isBlurred: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePostArticle.mockReturnValue({
      title: 'Test Article Title',
      body: 'Test article body content',
      coverImage: null,
    });
    // Default: no local attachments
    mockUseLocalFilesStore.mockImplementation((selector) => selector(createMockLocalFilesStore()));
  });

  it('renders with required props', () => {
    render(<SinglePostArticle {...defaultProps} />);

    expect(screen.getByText('Test Article Title')).toBeInTheDocument();
    expect(screen.getByTestId('post-header')).toBeInTheDocument();
    expect(screen.getByTestId('post-actions-bar')).toBeInTheDocument();
    expect(screen.getByTestId('post-text')).toBeInTheDocument();
  });

  it('renders the article title as h1', () => {
    render(<SinglePostArticle {...defaultProps} />);

    const title = screen.getByText('Test Article Title');
    expect(title.tagName).toBe('H1');
  });

  it('renders PostHeader with correct props', () => {
    render(<SinglePostArticle {...defaultProps} />);

    const header = screen.getByTestId('post-header');
    expect(header).toHaveAttribute('data-post-id', 'user123:post456');
    expect(header).toHaveAttribute('data-size', 'large');
    expect(header).toHaveAttribute('data-time-placement', 'bottom-left');
  });

  it('renders PostActionsBar with correct postId', () => {
    render(<SinglePostArticle {...defaultProps} />);

    const actionsBar = screen.getByTestId('post-actions-bar');
    expect(actionsBar).toHaveAttribute('data-post-id', 'user123:post456');
  });

  it('renders PostText with body content and isArticle flag', () => {
    render(<SinglePostArticle {...defaultProps} />);

    const postText = screen.getByTestId('post-text');
    expect(postText).toHaveTextContent('Test article body content');
    expect(postText).toHaveAttribute('data-is-article', 'true');
  });

  it('renders PostTagsPanel twice (always visible on both mobile and desktop)', () => {
    render(<SinglePostArticle {...defaultProps} />);

    const tagsPanels = screen.getAllByTestId('post-tags-panel');
    expect(tagsPanels).toHaveLength(2);
    tagsPanels.forEach((panel) => {
      expect(panel).toHaveAttribute('data-post-id', 'user123:post456');
    });
  });

  it('renders Replies section heading', () => {
    render(<SinglePostArticle {...defaultProps} />);

    expect(screen.getByText('Replies')).toBeInTheDocument();
  });

  it('renders dialogs in closed state initially', () => {
    render(<SinglePostArticle {...defaultProps} />);

    expect(screen.getByTestId('dialog-reply')).toHaveAttribute('data-open', 'false');
    expect(screen.getByTestId('dialog-repost')).toHaveAttribute('data-open', 'false');
    expect(screen.getByTestId('dialog-check-link')).toHaveAttribute('data-open', 'false');
  });

  it('passes onLinkClick handler to PostText', () => {
    render(<SinglePostArticle {...defaultProps} />);

    const postText = screen.getByTestId('post-text');
    expect(postText).toHaveAttribute('data-has-link-click', 'true');
  });

  describe('cover image', () => {
    it('renders cover image when available', () => {
      mockUsePostArticle.mockReturnValue({
        title: 'Test Title',
        body: 'Test body',
        coverImage: {
          src: 'https://example.com/image.jpg',
          alt: 'Cover image',
        },
      });

      render(<SinglePostArticle {...defaultProps} />);

      const coverImage = screen.getByTestId('cover-image');
      expect(coverImage).toBeInTheDocument();
      expect(coverImage).toHaveAttribute('src', 'https://example.com/image.jpg');
      expect(coverImage).toHaveAttribute('alt', 'Cover image');
    });

    it('does not render cover image when not available', () => {
      mockUsePostArticle.mockReturnValue({
        title: 'Test Title',
        body: 'Test body',
        coverImage: null,
      });

      render(<SinglePostArticle {...defaultProps} />);

      expect(screen.queryByTestId('cover-image')).not.toBeInTheDocument();
    });

    it('does not render cover image when content is blurred', () => {
      mockUsePostArticle.mockReturnValue({
        title: 'Test Title',
        body: 'Test body',
        coverImage: {
          src: 'https://example.com/image.jpg',
          alt: 'Cover image',
        },
      });

      render(<SinglePostArticle {...defaultProps} isBlurred={true} />);

      expect(screen.queryByTestId('cover-image')).not.toBeInTheDocument();
    });

    it('renders local cover image when available', () => {
      mockUsePostArticle.mockReturnValue({
        title: 'Test Title',
        body: 'Test body',
        coverImage: null,
      });

      mockUseLocalFilesStore.mockImplementation((selector) =>
        selector(
          createMockLocalFilesStore({
            'user123:post456': [
              {
                type: 'image/jpeg',
                name: 'local-cover.jpg',
                urls: { main: 'blob:http://localhost/local-cover' },
              },
            ],
          }),
        ),
      );

      render(<SinglePostArticle {...defaultProps} />);

      const coverImage = screen.getByTestId('cover-image');
      expect(coverImage).toBeInTheDocument();
      expect(coverImage).toHaveAttribute('src', 'blob:http://localhost/local-cover');
      expect(coverImage).toHaveAttribute('alt', 'local-cover.jpg');
    });

    it('prefers local cover image over remote cover image', () => {
      mockUsePostArticle.mockReturnValue({
        title: 'Test Title',
        body: 'Test body',
        coverImage: {
          src: 'https://example.com/remote-image.jpg',
          alt: 'Remote cover',
        },
      });

      mockUseLocalFilesStore.mockImplementation((selector) =>
        selector(
          createMockLocalFilesStore({
            'user123:post456': [
              {
                type: 'image/png',
                name: 'local-priority.png',
                urls: { main: 'blob:http://localhost/local-priority' },
              },
            ],
          }),
        ),
      );

      render(<SinglePostArticle {...defaultProps} />);

      const coverImage = screen.getByTestId('cover-image');
      expect(coverImage).toHaveAttribute('src', 'blob:http://localhost/local-priority');
      expect(coverImage).toHaveAttribute('alt', 'local-priority.png');
    });

    it('does not render local cover image when first attachment is not an image', () => {
      mockUsePostArticle.mockReturnValue({
        title: 'Test Title',
        body: 'Test body',
        coverImage: null,
      });

      mockUseLocalFilesStore.mockImplementation((selector) =>
        selector(
          createMockLocalFilesStore({
            'user123:post456': [
              {
                type: 'video/mp4',
                name: 'video.mp4',
                urls: { main: 'blob:http://localhost/video' },
              },
            ],
          }),
        ),
      );

      render(<SinglePostArticle {...defaultProps} />);

      expect(screen.queryByTestId('cover-image')).not.toBeInTheDocument();
    });

    it('falls back to remote cover image when local attachment is not an image', () => {
      mockUsePostArticle.mockReturnValue({
        title: 'Test Title',
        body: 'Test body',
        coverImage: {
          src: 'https://example.com/remote.jpg',
          alt: 'Remote fallback',
        },
      });

      mockUseLocalFilesStore.mockImplementation((selector) =>
        selector(
          createMockLocalFilesStore({
            'user123:post456': [
              {
                type: 'application/pdf',
                name: 'document.pdf',
                urls: { main: 'blob:http://localhost/document' },
              },
            ],
          }),
        ),
      );

      render(<SinglePostArticle {...defaultProps} />);

      const coverImage = screen.getByTestId('cover-image');
      expect(coverImage).toHaveAttribute('src', 'https://example.com/remote.jpg');
      expect(coverImage).toHaveAttribute('alt', 'Remote fallback');
    });

    it('does not render local cover image when content is blurred', () => {
      mockUsePostArticle.mockReturnValue({
        title: 'Test Title',
        body: 'Test body',
        coverImage: null,
      });

      mockUseLocalFilesStore.mockImplementation((selector) =>
        selector(
          createMockLocalFilesStore({
            'user123:post456': [
              {
                type: 'image/jpeg',
                name: 'local.jpg',
                urls: { main: 'blob:http://localhost/local' },
              },
            ],
          }),
        ),
      );

      render(<SinglePostArticle {...defaultProps} isBlurred={true} />);

      expect(screen.queryByTestId('cover-image')).not.toBeInTheDocument();
    });
  });

  describe('blurred state', () => {
    it('renders PostContentBlurred when isBlurred is true', () => {
      render(<SinglePostArticle {...defaultProps} isBlurred={true} />);

      expect(screen.getByTestId('post-content-blurred')).toBeInTheDocument();
      expect(screen.getByTestId('post-content-blurred')).toHaveAttribute('data-post-id', 'user123:post456');
    });

    it('does not render PostText when isBlurred is true', () => {
      render(<SinglePostArticle {...defaultProps} isBlurred={true} />);

      expect(screen.queryByTestId('post-text')).not.toBeInTheDocument();
    });

    it('renders PostText when isBlurred is false', () => {
      render(<SinglePostArticle {...defaultProps} isBlurred={false} />);

      expect(screen.getByTestId('post-text')).toBeInTheDocument();
      expect(screen.queryByTestId('post-content-blurred')).not.toBeInTheDocument();
    });
  });

  describe('dialog interactions', () => {
    it('opens reply dialog when reply button is clicked', () => {
      render(<SinglePostArticle {...defaultProps} />);

      const replyButton = screen.getByTestId('reply-button');
      fireEvent.click(replyButton);

      expect(screen.getByTestId('dialog-reply')).toHaveAttribute('data-open', 'true');
    });

    it('opens repost dialog when repost button is clicked', () => {
      render(<SinglePostArticle {...defaultProps} />);

      const repostButton = screen.getByTestId('repost-button');
      fireEvent.click(repostButton);

      expect(screen.getByTestId('dialog-repost')).toHaveAttribute('data-open', 'true');
    });

    it('closes reply dialog when onOpenChangeAction is called with false', () => {
      render(<SinglePostArticle {...defaultProps} />);

      // Open the dialog first
      const replyButton = screen.getByTestId('reply-button');
      fireEvent.click(replyButton);
      expect(screen.getByTestId('dialog-reply')).toHaveAttribute('data-open', 'true');

      // Close the dialog
      const closeButton = screen.getByTestId('close-reply-dialog');
      fireEvent.click(closeButton);
      expect(screen.getByTestId('dialog-reply')).toHaveAttribute('data-open', 'false');
    });

    it('closes repost dialog when onOpenChangeAction is called with false', () => {
      render(<SinglePostArticle {...defaultProps} />);

      // Open the dialog first
      const repostButton = screen.getByTestId('repost-button');
      fireEvent.click(repostButton);
      expect(screen.getByTestId('dialog-repost')).toHaveAttribute('data-open', 'true');

      // Close the dialog
      const closeButton = screen.getByTestId('close-repost-dialog');
      fireEvent.click(closeButton);
      expect(screen.getByTestId('dialog-repost')).toHaveAttribute('data-open', 'false');
    });
  });

  describe('tags visibility', () => {
    it('always shows both mobile and desktop tags panels (no toggle)', () => {
      render(<SinglePostArticle {...defaultProps} />);

      const tagsPanels = screen.getAllByTestId('post-tags-panel');
      expect(tagsPanels).toHaveLength(2);
      // Mobile tags panel
      expect(tagsPanels[0]).toHaveClass('lg:hidden');
      // Desktop tags panel
      expect(tagsPanels[1]).toHaveClass('hidden');
      expect(tagsPanels[1]).toHaveClass('lg:flex');
    });
  });

  describe('usePostArticle hook integration', () => {
    it('calls usePostArticle with correct parameters', () => {
      const propsWithAttachments = {
        ...defaultProps,
        attachments: ['pubky://user/pub/pubky.app/files/file-123'],
      };

      render(<SinglePostArticle {...propsWithAttachments} />);

      expect(mockUsePostArticle).toHaveBeenCalledWith({
        content: defaultProps.content,
        attachments: propsWithAttachments.attachments,
        coverImageVariant: 'main',
      });
    });

    it('calls usePostArticle with null attachments', () => {
      render(<SinglePostArticle {...defaultProps} />);

      expect(mockUsePostArticle).toHaveBeenCalledWith({
        content: defaultProps.content,
        attachments: null,
        coverImageVariant: 'main',
      });
    });
  });
});

describe('SinglePostArticle - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no local attachments for snapshots
    mockUseLocalFilesStore.mockImplementation((selector) => selector(createMockLocalFilesStore()));
  });

  it('matches snapshot with default props (no cover image, not blurred)', () => {
    mockUsePostArticle.mockReturnValue({
      title: 'Snapshot Article Title',
      body: 'Snapshot article body content',
      coverImage: null,
    });

    const { container } = render(
      <SinglePostArticle
        postId="snapshot-user:snapshot-post"
        content='{"title":"Snapshot Article Title","body":"Snapshot article body content"}'
        attachments={null}
        isBlurred={false}
      />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with cover image', () => {
    mockUsePostArticle.mockReturnValue({
      title: 'Article With Cover',
      body: 'Article body with cover image',
      coverImage: {
        src: 'https://example.com/cover.jpg',
        alt: 'Article cover',
      },
    });

    const { container } = render(
      <SinglePostArticle
        postId="snapshot-user:cover-post"
        content='{"title":"Article With Cover","body":"Article body with cover image"}'
        attachments={['pubky://user/pub/pubky.app/files/file-123']}
        isBlurred={false}
      />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when blurred', () => {
    mockUsePostArticle.mockReturnValue({
      title: 'Blurred Article',
      body: 'This content is blurred',
      coverImage: {
        src: 'https://example.com/cover.jpg',
        alt: 'Should not show',
      },
    });

    const { container } = render(
      <SinglePostArticle
        postId="snapshot-user:blurred-post"
        content='{"title":"Blurred Article","body":"This content is blurred"}'
        attachments={null}
        isBlurred={true}
      />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
