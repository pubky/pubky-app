import { fireEvent, render, screen } from '@testing-library/react';
import type { ElementType, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePostArticle } from '@/hooks/usePostArticle/usePostArticle';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
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
  Image: ({ src, alt }: { src: string; alt: string }) => <img data-testid="cover-image" src={src} alt={alt} />,
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
    onReplyClick,
    onRepostClick,
  }: {
    postId: string;
    onReplyClick?: () => void;
    onRepostClick?: () => void;
  }) => (
    <div data-testid="post-actions-bar" data-post-id={postId}>
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
  PostHeader: ({ postId }: { postId: string }) => <div data-testid="post-header" data-post-id={postId} />,
}));

vi.mock('../PostReplyRepostDialogs/PostReplyRepostDialogs', () => ({
  PostReplyRepostDialogs: ({
    postId,
    replyDialogOpen,
    repostDialogOpen,
  }: {
    postId: string;
    replyDialogOpen: boolean;
    repostDialogOpen: boolean;
  }) => (
    <>
      <div data-testid="dialog-reply" data-post-id={postId} data-open={replyDialogOpen} />
      <div data-testid="dialog-repost" data-post-id={postId} data-open={repostDialogOpen} />
    </>
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

  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePostArticle.mockReturnValue({
      title: 'Test Article Title',
      body: 'Test article body content',
      coverImage: null,
    });
    mockUseLocalFilesStore.mockImplementation((selector) =>
      selector({
        profile: null,
        posts: {},
        setProfile: vi.fn(),
        setPostAttachments: vi.fn(),
        reset: vi.fn(),
      }),
    );
  });

  it('renders article detail content and both tag panels', () => {
    render(<PostArticleDetail {...defaultProps} />);

    expect(screen.getByText('Test Article Title')).toBeInTheDocument();
    expect(screen.getByTestId('post-header')).toHaveAttribute('data-post-id', 'user123:post456');
    expect(screen.getByTestId('post-text')).toHaveTextContent('Test article body content');
    expect(screen.getAllByTestId('post-tags-panel')).toHaveLength(2);
    expect(screen.getByText('Replies')).toBeInTheDocument();
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
});
