import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { PostPreviewCard } from './PostPreviewCard';

// Mock hooks
const mockNavigateToPost = vi.fn();
const mockNavigateToCollection = vi.fn();
const mockTtlRef = vi.fn();
vi.mock('@/hooks/usePostNavigation/usePostNavigation', () => ({
  usePostNavigation: () => ({
    navigateToPost: mockNavigateToPost,
    navigateToCollection: mockNavigateToCollection,
  }),
}));

vi.mock('@/hooks/useTtlSubscription/useTtlSubscription', () => ({
  useTtlSubscription: () => ({
    ref: mockTtlRef,
    isVisible: false,
  }),
}));

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: vi.fn(),
}));

vi.mock('@/molecules/PostMissing/PostMissing', () => ({
  PostMissing: () => <div data-testid="post-missing" />,
}));

// Mock organisms
vi.mock('@/organisms/PostContentBase/PostContentBase', () => {
  return {
    PostContentBase: vi.fn(({ postId }: { postId: string }) => (
      <div data-testid="post-content-base" data-post-id={postId}>
        PostContentBase {postId}
      </div>
    )),
  };
});

vi.mock('@/organisms/PostHeader/PostHeader', () => {
  return {
    PostHeader: vi.fn(({ postId, timeAgoPlacement }: { postId: string; timeAgoPlacement?: string }) => (
      <div data-testid="post-header" data-post-id={postId} data-time-ago-placement={timeAgoPlacement}>
        PostHeader {postId}
      </div>
    )),
  };
});

// Mock atoms
vi.mock('@/atoms/Card/Card', () => {
  return {
    Card: ({
      children,
      className,
      onClick,
      onKeyDown,
      role,
      tabIndex,
      'aria-label': ariaLabel,
      ref,
    }: {
      children: React.ReactNode;
      className?: string;
      onClick?: (e: React.MouseEvent) => void;
      onKeyDown?: (e: React.KeyboardEvent) => void;
      role?: string;
      tabIndex?: number;
      'aria-label'?: string;
      ref?: React.Ref<HTMLDivElement>;
    }) => (
      <div
        data-testid="card"
        className={className}
        onClick={onClick}
        onKeyDown={onKeyDown}
        role={role}
        tabIndex={tabIndex}
        aria-label={ariaLabel}
        ref={ref}
      >
        {children}
      </div>
    ),
    CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="card-content" className={className}>
        {children}
      </div>
    ),
  };
});

const mockUsePostDetails = vi.mocked(usePostDetails);

// Minimal resolved post — PostHeader / PostContentBase are mocked, so only the
// non-null `postDetails` (and `isLoading: false`) matters for the missing check.
const resolvedPost = {
  postDetails: { id: 'test-post-123' } as never,
  isLoading: false,
};

const resolvedCollectionPost = {
  postDetails: { id: 'owner123:collection456', kind: 'collection' } as never,
  isLoading: false,
};

describe('PostPreviewCard', () => {
  beforeEach(() => {
    mockNavigateToPost.mockClear();
    mockNavigateToCollection.mockClear();
    mockUsePostDetails.mockReturnValue(resolvedPost);
  });

  it('renders with required props', () => {
    render(<PostPreviewCard postId="test-post-123" />);

    expect(screen.getByTestId('card')).toBeInTheDocument();
    expect(screen.getByTestId('card-content')).toBeInTheDocument();
    expect(screen.getByTestId('post-header')).toBeInTheDocument();
    expect(screen.getByTestId('post-content-base')).toBeInTheDocument();
  });

  it('places the timestamp under user info for narrow preview cards', () => {
    render(<PostPreviewCard postId="test-post-123" />);

    expect(screen.getByTestId('post-header')).toHaveAttribute('data-time-ago-placement', 'bottom-left');
  });

  it('has correct accessibility attributes', () => {
    render(<PostPreviewCard postId="test-post-123" />);

    const card = screen.getByTestId('card');
    expect(card).toHaveAttribute('role', 'link');
    expect(card).toHaveAttribute('tabIndex', '0');
    expect(card).toHaveAttribute('aria-label', 'View original post');
  });

  it('navigates to post page on click', () => {
    render(<PostPreviewCard postId="test-post-123" />);

    const card = screen.getByTestId('card');
    fireEvent.click(card);

    expect(mockNavigateToPost).toHaveBeenCalledWith('test-post-123');
    expect(mockNavigateToCollection).not.toHaveBeenCalled();
  });

  it('navigates to post page on Enter key', () => {
    render(<PostPreviewCard postId="test-post-123" />);

    const card = screen.getByTestId('card');
    fireEvent.keyDown(card, { key: 'Enter' });

    expect(mockNavigateToPost).toHaveBeenCalledWith('test-post-123');
    expect(mockNavigateToCollection).not.toHaveBeenCalled();
  });

  it('navigates to post page on Space key', () => {
    render(<PostPreviewCard postId="test-post-123" />);

    const card = screen.getByTestId('card');
    fireEvent.keyDown(card, { key: ' ' });

    expect(mockNavigateToPost).toHaveBeenCalledWith('test-post-123');
    expect(mockNavigateToCollection).not.toHaveBeenCalled();
  });

  it('navigates collection previews to the collection page on click', () => {
    mockUsePostDetails.mockReturnValue(resolvedCollectionPost);
    render(<PostPreviewCard postId="owner123:collection456" />);

    const card = screen.getByTestId('card');
    fireEvent.click(card);

    expect(mockNavigateToCollection).toHaveBeenCalledWith('owner123:collection456');
    expect(mockNavigateToPost).not.toHaveBeenCalled();
  });

  it('navigates collection previews to the collection page on Enter key', () => {
    mockUsePostDetails.mockReturnValue(resolvedCollectionPost);
    render(<PostPreviewCard postId="owner123:collection456" />);

    const card = screen.getByTestId('card');
    fireEvent.keyDown(card, { key: 'Enter' });

    expect(mockNavigateToCollection).toHaveBeenCalledWith('owner123:collection456');
    expect(mockNavigateToPost).not.toHaveBeenCalled();
  });

  it('navigates collection previews to the collection page on Space key', () => {
    mockUsePostDetails.mockReturnValue(resolvedCollectionPost);
    render(<PostPreviewCard postId="owner123:collection456" />);

    const card = screen.getByTestId('card');
    fireEvent.keyDown(card, { key: ' ' });

    expect(mockNavigateToCollection).toHaveBeenCalledWith('owner123:collection456');
    expect(mockNavigateToPost).not.toHaveBeenCalled();
  });

  it('labels collection previews as collection links', () => {
    mockUsePostDetails.mockReturnValue(resolvedCollectionPost);
    render(<PostPreviewCard postId="owner123:collection456" />);

    expect(screen.getByTestId('card')).toHaveAttribute('aria-label', 'View collection');
  });

  it('does not navigate on other keys', () => {
    render(<PostPreviewCard postId="test-post-123" />);

    const card = screen.getByTestId('card');
    fireEvent.keyDown(card, { key: 'Tab' });

    expect(mockNavigateToPost).not.toHaveBeenCalled();
  });

  it('renders PostMissing (not header/content) when the original post is not found', () => {
    mockUsePostDetails.mockReturnValue({ postDetails: null, isLoading: false });

    render(<PostPreviewCard postId="missing-post" />);

    // PostMissing replaces the inner CardContent so the header doesn't skeleton.
    expect(screen.getByTestId('post-missing')).toBeInTheDocument();
    expect(screen.queryByTestId('card-content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('post-header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('post-content-base')).not.toBeInTheDocument();
  });

  it('renders header/content (not PostMissing) while the original post is still loading', () => {
    mockUsePostDetails.mockReturnValue({ postDetails: null, isLoading: true });

    render(<PostPreviewCard postId="loading-post" />);

    expect(screen.queryByTestId('post-missing')).not.toBeInTheDocument();
    expect(screen.getByTestId('post-header')).toBeInTheDocument();
    expect(screen.getByTestId('post-content-base')).toBeInTheDocument();
  });
});

describe('PostPreviewCard - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<PostPreviewCard postId="snapshot-post-id" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with extra className', () => {
    const { container } = render(<PostPreviewCard postId="snapshot-post-id" className="bg-muted" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
