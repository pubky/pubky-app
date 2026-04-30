import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostContent } from './PostContent';
import * as Organisms from '@/organisms';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { useRepostInfo } from '@/hooks/useRepostInfo/useRepostInfo';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
// Mock hooks used by PostContent
vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: vi.fn(),
}));

vi.mock('@/hooks/useRepostInfo/useRepostInfo', () => ({
  useRepostInfo: vi.fn(),
}));

// Mock PostContentBase
vi.mock('@/organisms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/organisms')>();
  return {
    ...actual,
    PostContentBase: vi.fn(({ postId, className }: { postId: string; className?: string }) => (
      <div data-testid="post-content-base" data-post-id={postId} className={className}>
        PostContentBase {postId}
      </div>
    )),
  };
});

// Mock molecules - PostPreviewCard, PostText, PostLinkEmbeds
vi.mock('@/molecules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/molecules')>();
  return {
    ...actual,
    PostPreviewCard: vi.fn(({ postId, className }: { postId: string; className?: string }) => (
      <div data-testid="post-preview-card" data-post-id={postId} className={className}>
        PostPreviewCard {postId}
      </div>
    )),
  };
});

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
      isCurrentUserRepost: false,
      originalPostId: null,
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
      isCurrentUserRepost: false,
      originalPostId: null,
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
      isCurrentUserRepost: false,
      originalPostId: null,
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
      isCurrentUserRepost: false,
      originalPostId: 'orig-post',
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
});

describe('PostContent - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Organisms.PostContentBase).mockImplementation(
      ({ postId, className }: { postId: string; className?: string }) => (
        <div data-testid="post-content-base" data-post-id={postId} className={className}>
          PostContentBase {postId}
        </div>
      ),
    );
  });

  it('matches snapshot with single-line content', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({ content: 'One liner' }),
      isLoading: false,
    });
    mockUseRepostInfo.mockReturnValue({
      isRepost: false,
      repostAuthorId: null,
      isCurrentUserRepost: false,
      originalPostId: null,
      isLoading: false,
      hasError: false,
    });

    const { container } = render(<PostContent postId="post-1" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot as repost with content', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({ content: 'Quote' }),
      isLoading: false,
    });
    mockUseRepostInfo.mockReturnValue({
      isRepost: true,
      repostAuthorId: 'author',
      isCurrentUserRepost: false,
      originalPostId: 'orig-post',
      isLoading: false,
      hasError: false,
    });

    const { container } = render(<PostContent postId="repost-1" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot as repost without content', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({ content: '' }),
      isLoading: false,
    });
    mockUseRepostInfo.mockReturnValue({
      isRepost: true,
      repostAuthorId: 'author',
      isCurrentUserRepost: false,
      originalPostId: 'orig-post',
      isLoading: false,
      hasError: false,
    });

    const { container } = render(<PostContent postId="repost-2" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
