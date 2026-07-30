import { fireEvent, render, screen } from '@testing-library/react';
import type { ElementType, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePostArticle } from '@/hooks/usePostArticle/usePostArticle';
import { useHomeStore } from '@/stores/home/home.store';
import { LAYOUT } from '@/stores/home/home.types';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import type { AttachmentConstructed } from '../PostAttachments/PostAttachments.types';
import { PostArticleDetail } from './PostArticleDetail';

vi.mock('@/hooks/usePostArticle/usePostArticle', () => ({
  usePostArticle: vi.fn(),
}));

vi.mock('@/hooks/useLinkConfirmation/useLinkConfirmation', () => ({
  useLinkConfirmation: vi.fn().mockReturnValue({
    dialogOpen: false,
    setDialogOpen: vi.fn(),
    clickedLink: '',
    handleLinkClick: vi.fn(),
  }),
}));

vi.mock('@/stores/localFiles/localFiles.store', () => ({
  useLocalFilesStore: vi.fn(),
}));

vi.mock('@/atoms/Container/Container', () => ({
  Container: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div data-testid="container" className={className}>
      {children}
    </div>
  ),
}));

vi.mock('@/atoms/Image/Image', () => ({
  Image: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    <img data-testid="cover-image" src={src} alt={alt} className={className} />
  ),
}));

vi.mock('@/atoms/Typography/Typography', () => ({
  Typography: ({
    children,
    as: Tag = 'p',
    className,
  }: {
    children: ReactNode;
    as?: ElementType;
    className?: string;
  }) => (
    <Tag data-testid="typography" className={className}>
      {children}
    </Tag>
  ),
}));

vi.mock('@/molecules/PostText/PostText', () => ({
  PostText: ({ content, isArticle }: { content: string; isArticle?: boolean }) => (
    <div data-testid="post-text" data-is-article={isArticle}>
      {content}
    </div>
  ),
}));

vi.mock('../DialogCheckLink/DialogCheckLink', () => ({
  DialogCheckLink: ({ open }: { open: boolean }) => <div data-testid="dialog-check-link" data-open={open} />,
}));

vi.mock('../PostActionsBar/PostActionsBar', () => ({
  PostActionsBar: ({
    postId,
    onTagClick,
    onReplyClick,
    onRepostClick,
    className,
  }: {
    postId: string;
    onTagClick?: () => void;
    onReplyClick?: () => void;
    onRepostClick?: () => void;
    className?: string;
  }) => (
    <div data-testid="post-actions-bar" data-post-id={postId} className={className}>
      <button data-testid="tag-button" onClick={onTagClick}>
        Tag
      </button>
      <button data-testid="reply-button" onClick={onReplyClick}>
        Reply
      </button>
      <button data-testid="repost-button" onClick={onRepostClick}>
        Repost
      </button>
    </div>
  ),
}));

vi.mock('../PostContentBlurred/PostContentBlurred', () => ({
  PostContentBlurred: ({ postId }: { postId: string }) => (
    <div data-testid="post-content-blurred" data-post-id={postId} />
  ),
}));

vi.mock('../PostHeader/PostHeader', () => ({
  PostHeader: ({ postId, size, timeAgoPlacement }: { postId: string; size?: string; timeAgoPlacement?: string }) => (
    <div data-testid="post-header" data-post-id={postId} data-size={size} data-time-placement={timeAgoPlacement} />
  ),
}));

vi.mock('@/organisms/DialogReply/DialogReply', () => ({
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
}));

vi.mock('@/organisms/DialogRepost/DialogRepost', () => ({
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
}));

vi.mock('../PostTagsPanel/PostTagsPanel', () => ({
  PostTagsPanel: ({ postId, className }: { postId: string; className?: string }) => (
    <div data-testid="post-tags-panel" data-post-id={postId} className={className} />
  ),
}));

const mockUsePostArticle = vi.mocked(usePostArticle);
const mockUseLocalFilesStore = vi.mocked(useLocalFilesStore);

describe('PostArticleDetail', () => {
  const defaultProps = {
    postId: 'user123:post456',
    content: '{"title":"Test Article Title","body":"Test article body content"}',
    attachments: null,
    isBlurred: false,
  };

  const createMockLocalFilesStore = (posts: Record<string, AttachmentConstructed[] | undefined> = {}) => ({
    profile: null,
    posts,
    collections: {},
    setProfile: vi.fn(),
    setPostAttachments: vi.fn(),
    setCollectionCover: vi.fn(),
    reset: vi.fn(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useHomeStore.getState().reset();
    mockUsePostArticle.mockReturnValue({
      title: 'Test Article Title',
      body: 'Test article body content',
      coverImage: null,
    });
    mockUseLocalFilesStore.mockImplementation((selector) => selector(createMockLocalFilesStore()));
  });

  it('renders article detail content and both tag panels', () => {
    render(<PostArticleDetail {...defaultProps} />);

    expect(screen.getByText('Test Article Title')).toBeInTheDocument();
    expect(screen.getByTestId('post-header')).toHaveAttribute('data-post-id', 'user123:post456');
    expect(screen.getByTestId('post-text')).toHaveTextContent('Test article body content');
    expect(screen.getAllByTestId('post-tags-panel')).toHaveLength(2);
    expect(screen.queryByText('Replies')).not.toBeInTheDocument();
  });

  it('uses the stacked columns layout by default', () => {
    render(<PostArticleDetail {...defaultProps} />);

    const containers = screen.getAllByTestId('container');
    expect(containers.some((el) => el.className.includes('mb-6 gap-6'))).toBe(true);
    expect(containers.some((el) => el.className.includes('lg:grid-cols-3'))).toBe(false);
    expect(containers.some((el) => el.className.includes('max-w-2/4'))).toBe(true);
  });

  it('keeps the side tags grid layout in wide mode', () => {
    useHomeStore.getState().setLayout(LAYOUT.WIDE);

    render(<PostArticleDetail {...defaultProps} />);

    const containers = screen.getAllByTestId('container');
    expect(containers.some((el) => el.className.includes('lg:grid-cols-3'))).toBe(true);
    expect(containers.some((el) => el.className.includes('max-w-2/4'))).toBe(false);
  });

  it('renders the article title as h1', () => {
    render(<PostArticleDetail {...defaultProps} />);

    expect(screen.getByText('Test Article Title').tagName).toBe('H1');
  });

  it('renders PostHeader with the article detail props', () => {
    render(<PostArticleDetail {...defaultProps} />);

    expect(screen.getByTestId('post-header')).toHaveAttribute('data-post-id', 'user123:post456');
    expect(screen.getByTestId('post-header')).toHaveAttribute('data-size', 'large');
    expect(screen.getByTestId('post-header')).toHaveAttribute('data-time-placement', 'bottom-left');
  });

  it('passes body content and article mode to PostText', () => {
    render(<PostArticleDetail {...defaultProps} />);

    expect(screen.getByTestId('post-text')).toHaveTextContent('Test article body content');
    expect(screen.getByTestId('post-text')).toHaveAttribute('data-is-article', 'true');
  });

  it('renders dialogs in closed state initially', () => {
    render(<PostArticleDetail {...defaultProps} />);

    expect(screen.getByTestId('dialog-reply')).toHaveAttribute('data-open', 'false');
    expect(screen.getByTestId('dialog-repost')).toHaveAttribute('data-open', 'false');
    expect(screen.getByTestId('dialog-check-link')).toHaveAttribute('data-open', 'false');
  });

  it('renders the cover image when one is available', () => {
    mockUsePostArticle.mockReturnValue({
      title: 'Test Title',
      body: 'Test body',
      coverImage: {
        src: 'https://example.com/image.jpg',
        alt: 'Cover image',
      },
    });

    render(<PostArticleDetail {...defaultProps} />);

    expect(screen.getByTestId('cover-image')).toHaveAttribute('src', 'https://example.com/image.jpg');
    expect(screen.getByTestId('cover-image')).toHaveAttribute('alt', 'Cover image');
  });

  it('renders the cover image at a 16:9 ratio filling the frame', () => {
    mockUsePostArticle.mockReturnValue({
      title: 'Test Title',
      body: 'Test body',
      coverImage: {
        src: 'https://example.com/image.jpg',
        alt: 'Cover image',
      },
    });

    render(<PostArticleDetail {...defaultProps} />);

    expect(screen.getByTestId('cover-image')).toHaveClass('aspect-video', 'w-full', 'object-cover', 'object-center');
  });

  it('does not render cover image when not available', () => {
    mockUsePostArticle.mockReturnValue({
      title: 'Test Title',
      body: 'Test body',
      coverImage: null,
    });

    render(<PostArticleDetail {...defaultProps} />);

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

    render(<PostArticleDetail {...defaultProps} isBlurred />);

    expect(screen.queryByTestId('cover-image')).not.toBeInTheDocument();
  });

  it('renders local cover image when available', () => {
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

    render(<PostArticleDetail {...defaultProps} />);

    expect(screen.getByTestId('cover-image')).toHaveAttribute('src', 'blob:http://localhost/local-cover');
    expect(screen.getByTestId('cover-image')).toHaveAttribute('alt', 'local-cover.jpg');
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

    render(<PostArticleDetail {...defaultProps} />);

    expect(screen.getByTestId('cover-image')).toHaveAttribute('src', 'blob:http://localhost/local-priority');
    expect(screen.getByTestId('cover-image')).toHaveAttribute('alt', 'local-priority.png');
  });

  it('ignores local cover image when first attachment is not an image', () => {
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

    render(<PostArticleDetail {...defaultProps} />);

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

    render(<PostArticleDetail {...defaultProps} />);

    expect(screen.getByTestId('cover-image')).toHaveAttribute('src', 'https://example.com/remote.jpg');
    expect(screen.getByTestId('cover-image')).toHaveAttribute('alt', 'Remote fallback');
  });

  it('does not render local cover image when content is blurred', () => {
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

    render(<PostArticleDetail {...defaultProps} isBlurred />);

    expect(screen.queryByTestId('cover-image')).not.toBeInTheDocument();
  });

  it('renders blurred content instead of article body when blurred', () => {
    render(<PostArticleDetail {...defaultProps} isBlurred />);

    expect(screen.getByTestId('post-content-blurred')).toHaveAttribute('data-post-id', 'user123:post456');
    expect(screen.queryByTestId('post-text')).not.toBeInTheDocument();
  });

  it('opens reply and repost dialogs from the actions bar', () => {
    render(<PostArticleDetail {...defaultProps} />);

    fireEvent.click(screen.getByTestId('reply-button'));
    expect(screen.getByTestId('dialog-reply')).toHaveAttribute('data-open', 'true');

    fireEvent.click(screen.getByTestId('repost-button'));
    expect(screen.getByTestId('dialog-repost')).toHaveAttribute('data-open', 'true');
  });

  it('closes reply dialog when the dialog open state changes', () => {
    render(<PostArticleDetail {...defaultProps} />);

    fireEvent.click(screen.getByTestId('reply-button'));
    expect(screen.getByTestId('dialog-reply')).toHaveAttribute('data-open', 'true');

    fireEvent.click(screen.getByTestId('close-reply-dialog'));
    expect(screen.getByTestId('dialog-reply')).toHaveAttribute('data-open', 'false');
  });

  it('closes repost dialog when the dialog open state changes', () => {
    render(<PostArticleDetail {...defaultProps} />);

    fireEvent.click(screen.getByTestId('repost-button'));
    expect(screen.getByTestId('dialog-repost')).toHaveAttribute('data-open', 'true');

    fireEvent.click(screen.getByTestId('close-repost-dialog'));
    expect(screen.getByTestId('dialog-repost')).toHaveAttribute('data-open', 'false');
  });

  it('calls usePostArticle with the main cover image variant', () => {
    const propsWithAttachments = {
      ...defaultProps,
      attachments: ['pubky://user/pub/pubky.app/files/file-123'],
    };

    render(<PostArticleDetail {...propsWithAttachments} />);

    expect(mockUsePostArticle).toHaveBeenCalledWith({
      content: defaultProps.content,
      attachments: propsWithAttachments.attachments,
      coverImageVariant: 'main',
    });
  });

  it('matches snapshot with default props', () => {
    const { container } = render(<PostArticleDetail {...defaultProps} />);

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
      <PostArticleDetail
        postId="snapshot-user:cover-post"
        content='{"title":"Article With Cover","body":"Article body with cover image"}'
        attachments={['pubky://user/pub/pubky.app/files/file-123']}
        isBlurred={false}
      />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when blurred', () => {
    const { container } = render(<PostArticleDetail {...defaultProps} isBlurred />);

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot in wide layout', () => {
    useHomeStore.getState().setLayout(LAYOUT.WIDE);

    const { container } = render(<PostArticleDetail {...defaultProps} />);

    expect(container.firstChild).toMatchSnapshot();
  });
});
