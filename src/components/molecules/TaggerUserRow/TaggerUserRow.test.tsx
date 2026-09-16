import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaggerWithAvatar } from '@/molecules/TaggedItem/TaggedItem.types';
import { TaggerUserRow } from './TaggerUserRow';

// Mock useIsFollowing hook
const mockUseIsFollowing = vi.fn();
vi.mock('@/hooks/useIsFollowing/useIsFollowing', () => ({
  useIsFollowing: (userId: string) => mockUseIsFollowing(userId),
}));

// Mock UserListItem organism
vi.mock('@/organisms/UserListItem/UserListItem', () => {
  return {
    UserListItem: ({
      user,
      variant,
      isFollowing,
      isLoading,
      isStatusLoading,
      isCurrentUser,
      onUserClick,
      onFollowClick,
    }: {
      user: { id: string; name?: string; avatarUrl?: string };
      variant?: string;
      isFollowing?: boolean;
      isLoading?: boolean;
      isStatusLoading?: boolean;
      isCurrentUser?: boolean;
      onUserClick?: (id: string) => void;
      onFollowClick?: (id: string, isFollowing: boolean) => void;
    }) => (
      <div
        data-testid="user-list-item"
        data-user-id={user.id}
        data-user-name={user.name}
        data-user-avatar={user.avatarUrl}
        data-variant={variant}
        data-is-following={isFollowing}
        data-is-loading={isLoading}
        data-is-status-loading={isStatusLoading}
        data-is-current-user={isCurrentUser}
      >
        <button data-testid="user-click" onClick={() => onUserClick?.(user.id)}>
          View Profile
        </button>
        <button data-testid="follow-click" onClick={() => onFollowClick?.(user.id, isFollowing ?? false)}>
          Follow
        </button>
      </div>
    ),
  };
});

const mockTagger: TaggerWithAvatar = {
  id: 'user-123',
  name: 'Test User',
  avatarUrl: 'https://cdn.example.com/avatar/user-123.jpg',
};

const defaultProps = {
  tagger: mockTagger,
  isLoading: false,
  isCurrentUser: false,
  onUserClick: vi.fn(),
  onFollowClick: vi.fn(),
};

describe('TaggerUserRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsFollowing.mockReturnValue({
      isFollowing: false,
      isLoading: false,
    });
  });

  it('renders with default props', () => {
    render(<TaggerUserRow {...defaultProps} />);
    const userListItem = screen.getByTestId('user-list-item');
    expect(userListItem).toBeInTheDocument();
  });

  it('calls useIsFollowing with the tagger id', () => {
    render(<TaggerUserRow {...defaultProps} />);
    expect(mockUseIsFollowing).toHaveBeenCalledWith('user-123');
  });

  it('passes correct user data to UserListItem', () => {
    render(<TaggerUserRow {...defaultProps} />);
    const userListItem = screen.getByTestId('user-list-item');
    expect(userListItem).toHaveAttribute('data-user-id', 'user-123');
    expect(userListItem).toHaveAttribute('data-user-name', 'Test User');
    expect(userListItem).toHaveAttribute('data-user-avatar', 'https://cdn.example.com/avatar/user-123.jpg');
  });

  it('passes compact variant to UserListItem', () => {
    render(<TaggerUserRow {...defaultProps} />);
    const userListItem = screen.getByTestId('user-list-item');
    expect(userListItem).toHaveAttribute('data-variant', 'compact');
  });

  it('passes isFollowing from hook to UserListItem', () => {
    mockUseIsFollowing.mockReturnValue({
      isFollowing: true,
      isLoading: false,
    });
    render(<TaggerUserRow {...defaultProps} />);
    const userListItem = screen.getByTestId('user-list-item');
    expect(userListItem).toHaveAttribute('data-is-following', 'true');
  });

  it('passes isLoading prop to UserListItem', () => {
    render(<TaggerUserRow {...defaultProps} isLoading={true} />);
    const userListItem = screen.getByTestId('user-list-item');
    expect(userListItem).toHaveAttribute('data-is-loading', 'true');
  });

  it('passes isStatusLoading from hook to UserListItem', () => {
    mockUseIsFollowing.mockReturnValue({
      isFollowing: false,
      isLoading: true,
    });
    render(<TaggerUserRow {...defaultProps} />);
    const userListItem = screen.getByTestId('user-list-item');
    expect(userListItem).toHaveAttribute('data-is-status-loading', 'true');
  });

  it('passes isCurrentUser prop to UserListItem', () => {
    render(<TaggerUserRow {...defaultProps} isCurrentUser={true} />);
    const userListItem = screen.getByTestId('user-list-item');
    expect(userListItem).toHaveAttribute('data-is-current-user', 'true');
  });

  it('calls onUserClick when user is clicked', () => {
    const onUserClick = vi.fn();
    render(<TaggerUserRow {...defaultProps} onUserClick={onUserClick} />);
    screen.getByTestId('user-click').click();
    expect(onUserClick).toHaveBeenCalledWith('user-123');
  });

  it('calls onFollowClick when follow button is clicked', () => {
    const onFollowClick = vi.fn();
    mockUseIsFollowing.mockReturnValue({
      isFollowing: true,
      isLoading: false,
    });
    render(<TaggerUserRow {...defaultProps} onFollowClick={onFollowClick} />);
    screen.getByTestId('follow-click').click();
    expect(onFollowClick).toHaveBeenCalledWith('user-123', true);
  });
});

describe('TaggerUserRow - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsFollowing.mockReturnValue({
      isFollowing: false,
      isLoading: false,
    });
  });

  it('matches snapshot with default state', () => {
    const { container } = render(<TaggerUserRow {...defaultProps} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when loading', () => {
    const { container } = render(<TaggerUserRow {...defaultProps} isLoading={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when current user', () => {
    const { container } = render(<TaggerUserRow {...defaultProps} isCurrentUser={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when following', () => {
    mockUseIsFollowing.mockReturnValue({
      isFollowing: true,
      isLoading: false,
    });
    const { container } = render(<TaggerUserRow {...defaultProps} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when status is loading', () => {
    mockUseIsFollowing.mockReturnValue({
      isFollowing: false,
      isLoading: true,
    });
    const { container } = render(<TaggerUserRow {...defaultProps} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with tagger without name', () => {
    const taggerWithoutName: TaggerWithAvatar = {
      id: 'user-456',
      avatarUrl: 'https://cdn.example.com/avatar/user-456.jpg',
    };
    const { container } = render(<TaggerUserRow {...defaultProps} tagger={taggerWithoutName} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
