import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProfileFollowers } from './ProfileFollowers';
import { useFollowUser } from '@/hooks/useFollowUser/useFollowUser';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { useProfileConnections } from '@/hooks/useProfileConnections/useProfileConnections';
import { asOpaque } from '@/test-utils/type-assertions';
import type { Pubky } from '@/models/models.types';
// Mock Providers
vi.mock('@/providers/ProfileProvider/ProfileProvider', () => ({
  useProfileContext: vi.fn(() => ({
    pubky: 'user123',
    isOwnProfile: true,
    isLoading: false,
  })),
}));

// Mock dependencies
vi.mock('@/stores/auth/auth.store', () => ({
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

vi.mock('@/hooks/useProfileConnections/useProfileConnections', () => ({
  useProfileConnections: vi.fn(),
}));

vi.mock('@/hooks/useInfiniteScroll/useInfiniteScroll', () => ({
  useInfiniteScroll: vi.fn(),
}));

vi.mock('@/hooks/useFollowUser/useFollowUser', () => ({
  useFollowUser: vi.fn(),
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
  FollowersEmpty: () => <div data-testid="followers-empty">No followers</div>,
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
    id: 'user-1' as Pubky,
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
    id: 'user-2' as Pubky,
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

describe('ProfileFollowers', () => {
  beforeEach(() => {
    vi.mocked(useProfileConnections).mockReturnValue(mockUseProfileConnections());
    vi.mocked(useInfiniteScroll).mockReturnValue(
      asOpaque<ReturnType<typeof useInfiniteScroll>>(mockUseInfiniteScroll()),
    );
    vi.mocked(useFollowUser).mockReturnValue(asOpaque<ReturnType<typeof useFollowUser>>(mockUseFollowUser()));
  });

  it('renders empty state when no connections', () => {
    render(<ProfileFollowers />);
    expect(screen.getByTestId('followers-empty')).toBeInTheDocument();
  });

  it('renders loading state with skeleton list when isLoading is true', () => {
    vi.mocked(useProfileConnections).mockReturnValue(mockLoadingConnectionsResult);
    render(<ProfileFollowers />);
    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
    expect(screen.getByTestId('heading')).toHaveTextContent('Followers');
    const skeletons = screen.getAllByTestId('user-list-item-skeleton-full');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders connections when there are items', () => {
    vi.mocked(useProfileConnections).mockReturnValue(mockConnectionsResult);

    render(<ProfileFollowers />);
    const userItems = screen.getAllByTestId('user-list-item');
    expect(userItems).toHaveLength(2);
    expect(userItems[0]).toHaveAttribute('data-user-id', 'user-1');
    expect(userItems[1]).toHaveAttribute('data-user-id', 'user-2');
  });

  it('passes followButtonVariant="icon" to UserListItem', () => {
    vi.mocked(useProfileConnections).mockReturnValue(mockConnectionsResult);

    render(<ProfileFollowers />);
    const userItems = screen.getAllByTestId('user-list-item');
    userItems.forEach((item) => {
      expect(item).toHaveAttribute('data-follow-button-variant', 'icon');
    });
  });
});

describe('ProfileFollowers - Snapshots', () => {
  beforeEach(() => {
    vi.mocked(useProfileConnections).mockReturnValue(mockUseProfileConnections());
    vi.mocked(useInfiniteScroll).mockReturnValue(
      asOpaque<ReturnType<typeof useInfiniteScroll>>(mockUseInfiniteScroll()),
    );
    vi.mocked(useFollowUser).mockReturnValue(asOpaque<ReturnType<typeof useFollowUser>>(mockUseFollowUser()));
  });

  it('matches snapshot with no connections', () => {
    const { container } = render(<ProfileFollowers />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot when loading', () => {
    vi.mocked(useProfileConnections).mockReturnValue(mockLoadingConnectionsResult);
    const { container } = render(<ProfileFollowers />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with connections', () => {
    vi.mocked(useProfileConnections).mockReturnValue(mockConnectionsResult);

    const { container } = render(<ProfileFollowers />);
    expect(container).toMatchSnapshot();
  });
});
