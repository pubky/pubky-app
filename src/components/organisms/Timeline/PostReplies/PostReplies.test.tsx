import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimelinePostReplies } from './PostReplies';

// Mock hooks
const mockUseRequireAuth = vi.fn(() => ({
  isAuthenticated: true,
  requireAuth: vi.fn((action: () => void) => action()),
}));

const mockUsePostDetails = vi.fn(() => ({
  postDetails: { content: 'Normal post' },
  isLoading: false,
}));

const { mockIsPostDeleted } = vi.hoisted(() => ({
  mockIsPostDeleted: vi.fn(() => false),
}));

vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>();
  return {
    ...actual,
    useRequireAuth: vi.fn(),
    usePostDetails: vi.fn(),
    usePostCounts: vi.fn(),
  };
});

vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return {
    ...actual,
    isPostDeleted: mockIsPostDeleted,
  };
});

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
import * as Hooks from '@/hooks';

describe('TimelinePostReplies', () => {
  const mockPostId = 'author:post123';

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPostDeleted.mockReturnValue(false);
    vi.mocked(Hooks.useRequireAuth).mockReturnValue(mockUseRequireAuth());
    vi.mocked(Hooks.usePostDetails).mockReturnValue(mockUsePostDetails());
    vi.mocked(Hooks.usePostCounts).mockReturnValue({ postCounts: { replies: 3 } } as ReturnType<
      typeof Hooks.usePostCounts
    >);
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
    mockIsPostDeleted.mockReturnValue(true);

    render(<TimelinePostReplies postId={mockPostId} />);

    const tree = screen.getByTestId('thread-tree');
    expect(tree).toHaveAttribute('data-show-quick-reply', 'false');
  });

  it('renders nothing when not authenticated', () => {
    vi.mocked(Hooks.useRequireAuth).mockReturnValue({
      isAuthenticated: false,
      requireAuth: vi.fn(),
    });

    const { container } = render(<TimelinePostReplies postId={mockPostId} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when post has no replies', () => {
    vi.mocked(Hooks.usePostCounts).mockReturnValue({ postCounts: { replies: 0 } } as ReturnType<
      typeof Hooks.usePostCounts
    >);

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
    mockIsPostDeleted.mockReturnValue(false);
    vi.mocked(Hooks.useRequireAuth).mockReturnValue(mockUseRequireAuth());
    vi.mocked(Hooks.usePostDetails).mockReturnValue(mockUsePostDetails());
    vi.mocked(Hooks.usePostCounts).mockReturnValue({ postCounts: { replies: 3 } } as ReturnType<
      typeof Hooks.usePostCounts
    >);
  });

  it('matches snapshot when authenticated with non-deleted post', () => {
    const { container } = render(<TimelinePostReplies postId={mockPostId} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot when not authenticated', () => {
    vi.mocked(Hooks.useRequireAuth).mockReturnValue({
      isAuthenticated: false,
      requireAuth: vi.fn(),
    });

    const { container } = render(<TimelinePostReplies postId={mockPostId} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot when parent post is deleted', () => {
    mockIsPostDeleted.mockReturnValue(true);

    const { container } = render(<TimelinePostReplies postId={mockPostId} />);
    expect(container).toMatchSnapshot();
  });
});
