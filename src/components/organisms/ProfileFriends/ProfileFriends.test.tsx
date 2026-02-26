import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProfileFriends } from './ProfileFriends';
import * as Hooks from '@/hooks';
import * as Core from '@/core';

// Mock Providers
vi.mock('@/providers', () => ({
  useProfileContext: vi.fn(() => ({
    pubky: 'user123',
    isOwnProfile: true,
    isLoading: false,
  })),
}));

// Mock Core
vi.mock('@/core', () => ({
  useAuthStore: vi.fn((selector) => {
    const state = { currentUserPubky: 'current-user-123' };
    return selector ? selector(state) : state;
  }),
}));

// Mock Hooks
const mockUseProfileConnections = vi.fn(() => ({
  connections: [],
  count: 0,
  isLoading: false,
  isLoadingMore: false,
  hasMore: false,
  loadMore: vi.fn(),
  refresh: vi.fn(),
  error: null,
}));

const mockUseInfiniteScroll = vi.fn(() => ({
  sentinelRef: { current: null },
}));

const mockUseFollowUser = vi.fn(() => ({
  toggleFollow: vi.fn(),
  isUserLoading: vi.fn(() => false),
  isLoading: false,
  error: null,
}));

vi.mock('@/hooks', () => ({
  useProfileConnections: vi.fn(),
  useInfiniteScroll: vi.fn(),
  useFollowUser: vi.fn(),
  CONNECTION_TYPE: {
    FOLLOWERS: 'followers',
    FOLLOWING: 'following',
    FRIENDS: 'friends',
  },
}));

// Mock Atoms
vi.mock('@/atoms', () => ({
  Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="container" className={className}>
      {children}
    </div>
  ),
  Heading: ({ children }: { children: React.ReactNode }) => <h5 data-testid="heading">{children}</h5>,
  Spinner: () => <div data-testid="spinner">Loading...</div>,
}));

// Mock Molecules
vi.mock('@/molecules', () => ({
  FriendsEmpty: () => <div data-testid="friends-empty">No friends</div>,
}));

// Mock Organisms
vi.mock('@/organisms', () => ({
  UserListItem: ({ user, followButtonVariant }: { user: { id: string }; followButtonVariant?: string }) => (
    <div data-testid="user-list-item" data-user-id={user.id} data-follow-button-variant={followButtonVariant}>
      User item
    </div>
  ),
  FullUserListItemSkeleton: () => <div data-testid="user-list-item-skeleton-full">Skeleton</div>,
}));

const mockConnections = [
  {
    id: 'user-1' as Core.Pubky,
    name: 'John Doe',
    bio: 'Test bio',
    image: null,
    status: 'active',
    links: null,
    indexed_at: 1704067200000,
    avatarUrl: null,
    tags: [],
    stats: { tags: 10, posts: 5 },
    isFollowing: false,
  },
  {
    id: 'user-2' as Core.Pubky,
    name: 'Jane Smith',
    bio: 'Another bio',
    image: null,
    status: 'active',
    links: null,
    indexed_at: 1704067200000,
    avatarUrl: null,
    tags: [],
    stats: { tags: 20, posts: 10 },
    isFollowing: true,
  },
];

const mockLoadingConnectionsResult = {
  connections: [],
  count: 0,
  isLoading: true,
  isLoadingMore: false,
  hasMore: false,
  loadMore: vi.fn(),
  refresh: vi.fn(),
  error: null,
};

const mockConnectionsResult = {
  connections: mockConnections,
  count: 2,
  isLoading: false,
  isLoadingMore: false,
  hasMore: false,
  loadMore: vi.fn(),
  refresh: vi.fn(),
  error: null,
};

describe('ProfileFriends', () => {
  beforeEach(() => {
    vi.mocked(Hooks.useProfileConnections).mockImplementation(mockUseProfileConnections);
    vi.mocked(Hooks.useInfiniteScroll).mockReturnValue(
      mockUseInfiniteScroll() as unknown as ReturnType<typeof Hooks.useInfiniteScroll>,
    );
    vi.mocked(Hooks.useFollowUser).mockReturnValue(
      mockUseFollowUser() as unknown as ReturnType<typeof Hooks.useFollowUser>,
    );
  });

  it('renders empty state when no connections', () => {
    render(<ProfileFriends />);
    expect(screen.getByTestId('friends-empty')).toBeInTheDocument();
  });

  it('renders loading state with skeleton list when isLoading is true', () => {
    vi.mocked(Hooks.useProfileConnections).mockReturnValue(mockLoadingConnectionsResult);
    render(<ProfileFriends />);
    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
    expect(screen.getByTestId('heading')).toHaveTextContent('Friends');
    const skeletons = screen.getAllByTestId('user-list-item-skeleton-full');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders connections when there are items', () => {
    vi.mocked(Hooks.useProfileConnections).mockReturnValue(mockConnectionsResult);

    render(<ProfileFriends />);
    const userItems = screen.getAllByTestId('user-list-item');
    expect(userItems).toHaveLength(2);
    expect(userItems[0]).toHaveAttribute('data-user-id', 'user-1');
    expect(userItems[1]).toHaveAttribute('data-user-id', 'user-2');
  });

  it('passes followButtonVariant="iconWithText" to UserListItem', () => {
    vi.mocked(Hooks.useProfileConnections).mockReturnValue(mockConnectionsResult);

    render(<ProfileFriends />);
    const userItems = screen.getAllByTestId('user-list-item');
    userItems.forEach((item) => {
      expect(item).toHaveAttribute('data-follow-button-variant', 'iconWithText');
    });
  });
});

describe('ProfileFriends - Snapshots', () => {
  beforeEach(() => {
    vi.mocked(Hooks.useProfileConnections).mockImplementation(mockUseProfileConnections);
    vi.mocked(Hooks.useInfiniteScroll).mockReturnValue(
      mockUseInfiniteScroll() as unknown as ReturnType<typeof Hooks.useInfiniteScroll>,
    );
    vi.mocked(Hooks.useFollowUser).mockReturnValue(
      mockUseFollowUser() as unknown as ReturnType<typeof Hooks.useFollowUser>,
    );
  });

  it('matches snapshot with no connections', () => {
    const { container } = render(<ProfileFriends />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot when loading', () => {
    vi.mocked(Hooks.useProfileConnections).mockReturnValue(mockLoadingConnectionsResult);
    const { container } = render(<ProfileFriends />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with connections', () => {
    vi.mocked(Hooks.useProfileConnections).mockReturnValue(mockConnectionsResult);

    const { container } = render(<ProfileFriends />);
    expect(container).toMatchSnapshot();
  });
});
