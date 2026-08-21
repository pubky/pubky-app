import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RepliesEmpty } from './RepliesEmpty';

const mocks = vi.hoisted(() => ({
  isOwnProfile: true,
  requireAuth: vi.fn(<T,>(action: () => T) => action()),
}));

vi.mock('@/providers/ProfileProvider/ProfileProvider', () => ({
  useProfileContext: () => ({
    pubky: 'test-pubky',
    isOwnProfile: mocks.isOwnProfile,
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    isAuthenticated: true,
    requireAuth: mocks.requireAuth,
  }),
}));

vi.mock('@/organisms/DialogNewPost/DialogNewPost', () => ({
  DialogNewPost: ({ open, onOpenChangeAction }: { open: boolean; onOpenChangeAction: (open: boolean) => void }) => (
    <div data-testid="dialog-new-post" data-open={open}>
      <button type="button" data-testid="mock-close-btn" onClick={() => onOpenChangeAction(false)}>
        Close
      </button>
    </div>
  ),
}));

vi.mock('@/molecules/IllustratedEmptyState/IllustratedEmptyState', () => {
  return {
    IllustratedEmptyState: ({
      imageSrc,
      imageAlt,
      icon: Icon,
      title,
      subtitle,
      children,
    }: {
      imageSrc: string;
      imageAlt: string;
      icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
      title: string;
      subtitle: React.ReactNode;
      children?: React.ReactNode;
    }) => (
      <div data-testid="empty-state">
        <div data-testid="image" data-src={imageSrc} data-alt={imageAlt} />
        <Icon data-testid="users-round-icon" />
        <h3>{title}</h3>
        <p>{subtitle}</p>
        {children}
      </div>
    ),
  };
});

describe('RepliesEmpty', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isOwnProfile = true;
    mocks.requireAuth.mockImplementation(<T,>(action: () => T) => action());
  });

  it('renders title', () => {
    render(<RepliesEmpty />);
    expect(screen.getByText(/No replies yet/i)).toBeInTheDocument();
  });

  it('renders own-profile subtitle and secondary Create a Post CTA', () => {
    render(<RepliesEmpty />);
    expect(screen.getByText(/Find a post in your feed to reply to/i)).toBeInTheDocument();
    const cta = screen.getByRole('button', { name: /Create a Post/i });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute('data-variant', 'secondary');
  });

  it('renders UsersRound icon and background image', () => {
    render(<RepliesEmpty />);
    expect(screen.getByTestId('users-round-icon')).toBeInTheDocument();
    const image = screen.getByTestId('image');
    expect(image).toHaveAttribute('data-src', '/images/posts-replies-empty-state.webp');
    expect(image).toHaveAttribute('data-alt', 'Replies - Empty state');
  });

  it('opens the new post dialog when Create a Post is clicked', () => {
    render(<RepliesEmpty />);

    expect(screen.getByTestId('dialog-new-post')).toHaveAttribute('data-open', 'false');

    fireEvent.click(screen.getByRole('button', { name: /Create a Post/i }));

    expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('dialog-new-post')).toHaveAttribute('data-open', 'true');
  });

  it('hides the CTA and uses visitor copy on another user profile', () => {
    mocks.isOwnProfile = false;
    render(<RepliesEmpty />);

    expect(screen.getByText(/No replies yet/i)).toBeInTheDocument();
    expect(screen.getByText(/This user hasn't replied yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create a Post/i })).not.toBeInTheDocument();
  });
});

describe('RepliesEmpty - Snapshots', () => {
  beforeEach(() => {
    mocks.isOwnProfile = true;
  });

  it('matches snapshot on own profile', () => {
    const { container } = render(<RepliesEmpty />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot on another user profile', () => {
    mocks.isOwnProfile = false;
    const { container } = render(<RepliesEmpty />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
