import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PostPreviewCard } from './PostPreviewCard';

// Mock hooks
const mockNavigateToPost = vi.fn();
const mockTtlRef = vi.fn();
vi.mock('@/hooks', () => ({
  usePostNavigation: () => ({
    navigateToPost: mockNavigateToPost,
  }),
  useTtlSubscription: () => ({
    ref: mockTtlRef,
    isVisible: false,
  }),
}));

// Mock organisms
vi.mock('@/organisms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/organisms')>();
  return {
    ...actual,
    PostHeader: vi.fn(({ postId }: { postId: string }) => (
      <div data-testid="post-header" data-post-id={postId}>
        PostHeader {postId}
      </div>
    )),
    PostContentBase: vi.fn(({ postId }: { postId: string }) => (
      <div data-testid="post-content-base" data-post-id={postId}>
        PostContentBase {postId}
      </div>
    )),
  };
});

// Mock atoms
vi.mock('@/atoms', () => ({
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
}));

describe('PostPreviewCard', () => {
  beforeEach(() => {
    mockNavigateToPost.mockClear();
  });

  it('renders with required props', () => {
    render(<PostPreviewCard postId="test-post-123" />);

    expect(screen.getByTestId('card')).toBeInTheDocument();
    expect(screen.getByTestId('card-content')).toBeInTheDocument();
    expect(screen.getByTestId('post-header')).toBeInTheDocument();
    expect(screen.getByTestId('post-content-base')).toBeInTheDocument();
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
  });

  it('navigates to post page on Enter key', () => {
    render(<PostPreviewCard postId="test-post-123" />);

    const card = screen.getByTestId('card');
    fireEvent.keyDown(card, { key: 'Enter' });

    expect(mockNavigateToPost).toHaveBeenCalledWith('test-post-123');
  });

  it('navigates to post page on Space key', () => {
    render(<PostPreviewCard postId="test-post-123" />);

    const card = screen.getByTestId('card');
    fireEvent.keyDown(card, { key: ' ' });

    expect(mockNavigateToPost).toHaveBeenCalledWith('test-post-123');
  });

  it('does not navigate on other keys', () => {
    render(<PostPreviewCard postId="test-post-123" />);

    const card = screen.getByTestId('card');
    fireEvent.keyDown(card, { key: 'Tab' });

    expect(mockNavigateToPost).not.toHaveBeenCalled();
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
