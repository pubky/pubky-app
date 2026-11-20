import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { useRepostInfo } from '@/hooks/useRepostInfo/useRepostInfo';
import { PostContent } from './PostContent';

// Mock hooks used by PostContent
vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: vi.fn(),
}));

vi.mock('@/hooks/useRepostInfo/useRepostInfo', () => ({
  useRepostInfo: vi.fn(),
}));

// Mock molecules - PostPreviewCard, PostText, PostLinkEmbeds
vi.mock('@/molecules/PostPreviewCard/PostPreviewCard', () => {
  return {
    PostPreviewCard: vi.fn(
      ({ postId, className, showTagsActions }: { postId: string; className?: string; showTagsActions?: boolean }) => (
        <div
          data-testid="post-preview-card"
          data-post-id={postId}
          data-show-tags-actions={String(showTagsActions ?? true)}
          className={className}
        >
          PostPreviewCard {postId}
        </div>
      ),
    ),
  };
});

vi.mock('../PostContentBase/PostContentBase', () => ({
  PostContentBase: vi.fn(
    ({ postId, className, embedUrl }: { postId: string; className?: string; embedUrl?: string | null }) => (
      <div data-testid="post-content-base" data-post-id={postId} data-embed-url={embedUrl ?? ''} className={className}>
        PostContentBase {postId}
      </div>
    ),
  ),
}));

const mockUsePostDetails = vi.mocked(usePostDetails);
const mockUseRepostInfo = vi.mocked(useRepostInfo);

// Helper to create complete PostDetails mock
const createMockPostDetails = (
  overrides: Partial<{ content: string; attachments: string[] | null }> = {},
): EnrichedPostDetails => ({
  id: 'test-author:test-post',
  indexed_at: Date.now(),
  kind: 'short' as const,
  uri: 'pubky://test-author/pub/pubky.app/posts/test-post',
  content: 'Mock content',
  attachments: null as string[] | null,
  is_moderated: false,
  is_blurred: false,
  ...overrides,
});

describe('PostContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails(),
      isLoading: false,
    });
    mockUseRepostInfo.mockReturnValue({
      isRepost: false,
      repostAuthorId: null,
      isReply: false,
      isCurrentUserRepost: false,
      originalPostId: null,
      embedUrl: null,
      isLoading: false,
      hasError: false,
    });
  });

  it('renders PostContentBase when postDetails are available', () => {
    render(<PostContent postId="post-123" />);

    expect(screen.getByTestId('post-content-base')).toBeInTheDocument();
    expect(screen.getByTestId('post-content-base')).toHaveAttribute('data-post-id', 'post-123');
  });

  it('calls useRepostInfo with correct id', () => {
    render(<PostContent postId="post-abc" />);

    expect(mockUseRepostInfo).toHaveBeenCalledWith('post-abc');
  });

  it('does not render repost preview when not a repost', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({ content: 'Regular post' }),
      isLoading: false,
    });
    mockUseRepostInfo.mockReturnValue({
      isRepost: false,
      repostAuthorId: null,
      isReply: false,
      isCurrentUserRepost: false,
      originalPostId: null,
      embedUrl: null,
      isLoading: false,
      hasError: false,
    });

    render(<PostContent postId="post-123" />);

    expect(screen.queryByTestId('post-preview-card')).not.toBeInTheDocument();
  });

  it('does not render repost preview when originalPostId is missing', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({ content: 'Quote' }),
      isLoading: false,
    });
    mockUseRepostInfo.mockReturnValue({
      isRepost: true,
      repostAuthorId: 'author',
      isReply: false,
      isCurrentUserRepost: false,
      originalPostId: null,
      embedUrl: null,
      isLoading: false,
      hasError: false,
    });

    render(<PostContent postId="repost-123" />);

    expect(screen.queryByTestId('post-preview-card')).not.toBeInTheDocument();
  });

  it('always renders PostContentBase even for plain reposts without content', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({ content: '' }),
      isLoading: false,
    });
    mockUseRepostInfo.mockReturnValue({
      isRepost: true,
      repostAuthorId: 'author',
      isReply: false,
      isCurrentUserRepost: false,
      originalPostId: 'orig-post',
      embedUrl: null,
      isLoading: false,
      hasError: false,
    });

    render(<PostContent postId="plain-repost-123" />);

    // PostContentBase should always be rendered as structural wrapper
    expect(screen.getByTestId('post-content-base')).toBeInTheDocument();
    expect(screen.getByTestId('post-content-base')).toHaveAttribute('data-post-id', 'plain-repost-123');
    // PostPreviewCard should also be rendered for reposts
    expect(screen.getByTestId('post-preview-card')).toBeInTheDocument();
  });

  it('gives a quote’s preview its own tags and actions: the quote’s footer acts on the quote', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({ content: 'Quoting this' }),
      isLoading: false,
    });
    mockUseRepostInfo.mockReturnValue({
      isRepost: true,
      repostAuthorId: 'author',
      isReply: false,
      isCurrentUserRepost: false,
      originalPostId: 'orig-author:orig-post',
      embedUrl: null,
      isLoading: false,
      hasError: false,
    });

    render(<PostContent postId="author:quote-1" />);

    expect(screen.getByTestId('post-preview-card')).toHaveAttribute('data-post-id', 'orig-author:orig-post');
    expect(screen.getByTestId('post-preview-card')).toHaveAttribute('data-show-tags-actions', 'true');
  });

  it('shows no second footer in a plain repost’s preview: the repost’s own acts on the original', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({ content: '' }),
      isLoading: false,
    });
    mockUseRepostInfo.mockReturnValue({
      isRepost: true,
      repostAuthorId: 'author',
      isReply: false,
      isCurrentUserRepost: false,
      originalPostId: 'orig-author:orig-post',
      embedUrl: null,
      isLoading: false,
      hasError: false,
    });

    render(<PostContent postId="author:repost-1" />);

    expect(screen.getByTestId('post-preview-card')).toHaveAttribute('data-show-tags-actions', 'false');
  });

  it('shows no footer in the preview until the repost is read (a plain repost’s would flash)', () => {
    mockUsePostDetails.mockReturnValue({ postDetails: undefined, isLoading: true });
    mockUseRepostInfo.mockReturnValue({
      isRepost: true,
      repostAuthorId: 'author',
      isReply: false,
      isCurrentUserRepost: false,
      originalPostId: 'orig-author:orig-post',
      embedUrl: null,
      isLoading: false,
      hasError: false,
    });

    render(<PostContent postId="author:repost-1" />);

    expect(screen.getByTestId('post-preview-card')).toHaveAttribute('data-show-tags-actions', 'false');
  });

  it('passes a web link embed to the post body and shows no repost preview', () => {
    mockUseRepostInfo.mockReturnValue({
      isRepost: false,
      repostAuthorId: null,
      isReply: false,
      isCurrentUserRepost: false,
      originalPostId: null,
      embedUrl: 'https://en.wikipedia.org/wiki/Bitcoin',
      isLoading: false,
      hasError: false,
    });

    render(<PostContent postId="test-author:test-post" />);

    expect(screen.getByTestId('post-content-base')).toHaveAttribute(
      'data-embed-url',
      'https://en.wikipedia.org/wiki/Bitcoin',
    );
    expect(screen.queryByTestId('post-preview-card')).not.toBeInTheDocument();
  });
});
