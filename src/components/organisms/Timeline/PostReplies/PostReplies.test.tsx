import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as Core from '@/core';
import type { UseRequireAuthResult } from '@/hooks/useRequireAuth/useRequireAuth.types';
import { TimelinePostReplies } from './PostReplies';
import { usePostCounts } from '@/hooks/usePostCounts/usePostCounts';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';

// Mock hooks
const mockUseRequireAuth = vi.fn(
  (): UseRequireAuthResult => ({
    isAuthenticated: true,
    requireAuth: <T,>(action: () => T) => action(),
  }),
);

const mockUsePostDetails = vi.fn(() => ({
  postDetails: {
    id: 'author:post123',
    indexed_at: Date.now(),
    kind: 'short' as const,
    uri: 'pubky://author/pub/pubky.app/posts/post123',
    content: 'Normal post',
    attachments: null,
    is_moderated: false,
    is_blurred: false,
  } satisfies Core.EnrichedPostDetails,
  isLoading: false,
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: vi.fn(),
}));

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: vi.fn(),
}));

vi.mock('@/hooks/usePostCounts/usePostCounts', () => ({
  usePostCounts: vi.fn(),
}));

// Mock atoms
vi.mock('@/atoms', () => ({
  Container: ({
    children,
    overrideDefaults: _overrideDefaults,
    ...props
  }: {
    children?: React.ReactNode;
    overrideDefaults?: boolean;
    [key: string]: unknown;
  }) => (
    <div data-testid="container" {...props}>
      {children}
    </div>
  ),
}));

// Mock ThreadTree organism
vi.mock('@/organisms', () => ({
  ThreadTree: ({ postId, showQuickReply }: { postId: string; showQuickReply?: boolean }) => (
    <div data-testid="thread-tree" data-post-id={postId} data-show-quick-reply={String(showQuickReply)} />
  ),
}));

// Import after mocks
describe('TimelinePostReplies', () => {
  const mockPostId = 'author:post123';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRequireAuth).mockReturnValue(mockUseRequireAuth());
    vi.mocked(usePostDetails).mockReturnValue(mockUsePostDetails());
    vi.mocked(usePostCounts).mockReturnValue({
      postCounts: {
        id: mockPostId,
        replies: 3,
        tags: 0,
        unique_tags: 0,
        reposts: 0,
      } satisfies Core.PostCountsModelSchema,
      isLoading: false,
    });
  });

  it('renders ThreadTree with correct postId', () => {
    render(<TimelinePostReplies postId={mockPostId} />);

    const tree = screen.getByTestId('thread-tree');
    expect(tree).toBeInTheDocument();
    expect(tree).toHaveAttribute('data-post-id', mockPostId);
  });

  it('passes showQuickReply=true when parent is not deleted', () => {
    render(<TimelinePostReplies postId={mockPostId} />);

    const tree = screen.getByTestId('thread-tree');
    expect(tree).toHaveAttribute('data-show-quick-reply', 'true');
  });

  it('passes showQuickReply=false when parent is deleted', () => {
    vi.mocked(usePostDetails).mockReturnValue({
      ...mockUsePostDetails(),
      postDetails: {
        ...mockUsePostDetails().postDetails,
        content: '[DELETED]',
      },
    });

    render(<TimelinePostReplies postId={mockPostId} />);

    const tree = screen.getByTestId('thread-tree');
    expect(tree).toHaveAttribute('data-show-quick-reply', 'false');
  });

  it('renders nothing when not authenticated', () => {
    vi.mocked(useRequireAuth).mockReturnValue({
      isAuthenticated: false,
      requireAuth: <T,>(_action: () => T) => undefined,
    });

    const { container } = render(<TimelinePostReplies postId={mockPostId} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when post has no replies', () => {
    vi.mocked(usePostCounts).mockReturnValue({
      postCounts: {
        id: mockPostId,
        replies: 0,
        tags: 0,
        unique_tags: 0,
        reposts: 0,
      } satisfies Core.PostCountsModelSchema,
      isLoading: false,
    });

    const { container } = render(<TimelinePostReplies postId={mockPostId} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders with ml-3 container styling', () => {
    render(<TimelinePostReplies postId={mockPostId} />);

    const containers = screen.getAllByTestId('container');
    expect(containers[0]).toBeInTheDocument();
  });
});

describe('TimelinePostReplies - Snapshots', () => {
  const mockPostId = 'author:post123';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRequireAuth).mockReturnValue(mockUseRequireAuth());
    vi.mocked(usePostDetails).mockReturnValue(mockUsePostDetails());
    vi.mocked(usePostCounts).mockReturnValue({
      postCounts: {
        id: mockPostId,
        replies: 3,
        tags: 0,
        unique_tags: 0,
        reposts: 0,
      } satisfies Core.PostCountsModelSchema,
      isLoading: false,
    });
  });

  it('matches snapshot when authenticated with non-deleted post', () => {
    const { container } = render(<TimelinePostReplies postId={mockPostId} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot when not authenticated', () => {
    vi.mocked(useRequireAuth).mockReturnValue({
      isAuthenticated: false,
      requireAuth: <T,>(_action: () => T) => undefined,
    });

    const { container } = render(<TimelinePostReplies postId={mockPostId} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot when parent post is deleted', () => {
    vi.mocked(usePostDetails).mockReturnValue({
      ...mockUsePostDetails(),
      postDetails: {
        ...mockUsePostDetails().postDetails,
        content: '[DELETED]',
      },
    });

    const { container } = render(<TimelinePostReplies postId={mockPostId} />);
    expect(container).toMatchSnapshot();
  });
});
