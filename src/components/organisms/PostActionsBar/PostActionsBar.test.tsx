import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostActionsBar } from './PostActionsBar';

// Mock hooks
const mockUsePostCounts = vi.fn();
const mockUseBookmark = vi.fn();

vi.mock('@/hooks', () => ({
  usePostCounts: (postId: string) => mockUsePostCounts(postId),
  useBookmark: (postId: string) => mockUseBookmark(postId),
  useRequireAuth: () => ({
    isAuthenticated: true,
    requireAuth: <T,>(action: () => T) => action(),
  }),
}));

// Use real libs - use actual implementations
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return { ...actual };
});

// Mock PostMenuActions
vi.mock('@/organisms', () => ({
  PostMenuActions: ({ postId, trigger }: { postId: string; trigger: React.ReactNode }) => (
    <div data-testid="post-menu-actions" data-post-id={postId}>
      {trigger}
    </div>
  ),
}));

// Minimal atoms used by PostActionsBar
vi.mock('@/atoms', () => ({
  Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="actions-container" data-class-name={className}>
      {children}
    </div>
  ),
  Button: ({
    children,
    onClick,
    className,
    variant,
    size,
    style,
    'aria-label': aria,
  }: {
    children: React.ReactNode;
    onClick?: React.MouseEventHandler;
    className?: string;
    variant?: string;
    size?: string;
    style?: React.CSSProperties;
    'aria-label'?: string;
  }) => (
    <button
      onClick={onClick}
      className={className}
      data-variant={variant}
      data-size={size}
      style={style}
      aria-label={aria}
    >
      {children}
    </button>
  ),
  Typography: ({
    children,
    as: Tag = 'span',
    className,
  }: {
    children: React.ReactNode;
    as?: React.ElementType;
    className?: string;
    overrideDefaults?: boolean;
  }) => (
    <Tag data-testid="typography" className={className}>
      {children}
    </Tag>
  ),
}));

describe('PostActionsBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations
    mockUseBookmark.mockReturnValue({
      isBookmarked: false,
      isLoading: false,
      isToggling: false,
      toggle: vi.fn(),
    });
  });

  it('shows loading state while counts are not available', () => {
    mockUsePostCounts.mockReturnValue({ postCounts: null, isLoading: true });

    const { container } = render(<PostActionsBar postId="post-1" />);
    expect(container.firstChild).toHaveTextContent('Loading actions...');
  });

  it('renders all action buttons with counts and aria labels', () => {
    mockUsePostCounts.mockReturnValue({
      postCounts: { tags: 3, unique_tags: 3, replies: 5, reposts: 2 },
      isLoading: false,
    });

    render(<PostActionsBar postId="post-2" />);

    expect(screen.getByRole('button', { name: 'Tag post (3)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reply to post (5)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Repost (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bookmark/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More options' })).toBeInTheDocument();
  });

  it('invokes callbacks when buttons are clicked', () => {
    mockUsePostCounts.mockReturnValue({
      postCounts: { tags: 1, unique_tags: 1, replies: 1, reposts: 1 },
      isLoading: false,
    });

    const onTagClick = vi.fn();
    const onReplyClick = vi.fn();
    const onRepostClick = vi.fn();

    render(
      <PostActionsBar
        postId="post-3"
        onTagClick={onTagClick}
        onReplyClick={onReplyClick}
        onRepostClick={onRepostClick}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tag post (1)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reply to post (1)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Repost (1)' }));

    expect(onTagClick).toHaveBeenCalledTimes(1);
    expect(onReplyClick).toHaveBeenCalledTimes(1);
    expect(onRepostClick).toHaveBeenCalledTimes(1);
  });

  it('calls toggle when bookmark button is clicked', () => {
    mockUsePostCounts.mockReturnValue({
      postCounts: { tags: 1, unique_tags: 1, replies: 1, reposts: 1 },
      isLoading: false,
    });
    const mockToggle = vi.fn();
    mockUseBookmark.mockReturnValue({
      isBookmarked: false,
      isLoading: false,
      isToggling: false,
      toggle: mockToggle,
    });

    render(<PostActionsBar postId="post-bookmark" />);

    fireEvent.click(screen.getByRole('button', { name: /bookmark/i }));
    expect(mockToggle).toHaveBeenCalledTimes(1);
  });

  it('applies the visual variant classes to the action buttons', () => {
    mockUsePostCounts.mockReturnValue({
      postCounts: { tags: 2, unique_tags: 2, replies: 3, reposts: 4 },
      isLoading: false,
    });

    render(<PostActionsBar postId="post-visual" variant="visual" />);

    expect(screen.getByRole('button', { name: 'Tag post (2)' })).toHaveClass(
      'border-white/10',
      'bg-black/40',
      'text-white',
    );
    expect(screen.getAllByTestId('typography')[0]).toHaveClass('text-white/80');
  });
});

describe('PostActionsBar - Snapshots', () => {
  beforeEach(() => {
    mockUseBookmark.mockReturnValue({
      isBookmarked: false,
      isLoading: false,
      isToggling: false,
      toggle: vi.fn(),
    });
  });

  it('matches snapshot with counts', () => {
    mockUsePostCounts.mockReturnValue({
      postCounts: { tags: 7, unique_tags: 3, replies: 8, reposts: 9 },
      isLoading: false,
    });

    const { container } = render(<PostActionsBar postId="post-4" className="extra" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot loading', () => {
    mockUsePostCounts.mockReturnValue({ postCounts: null, isLoading: true });

    const { container } = render(<PostActionsBar postId="post-5" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
