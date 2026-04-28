import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ElementType, ReactNode } from 'react';
import { WhoToFollowPageMain } from './WhoToFollowPageMain';
import { useFollowUser } from '@/hooks/useFollowUser/useFollowUser';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { useUserStream } from '@/hooks/useUserStream/useUserStream';
import * as Core from '@/core';
import { asOpaque } from '@/test-utils';

// Mock Core
vi.mock('@/core', () => ({
  useAuthStore: vi.fn((selector) => {
    const state = { currentUserPubky: 'current-user-123' as Core.Pubky };
    return selector ? selector(state) : state;
  }),
  UserStreamTypes: {
    RECOMMENDED: 'recommended',
  },
}));

// Mock Hooks
const mockUseUserStream = vi.fn(() => ({
  users: [],
  userIds: [],
  isLoading: false,
  isLoadingMore: false,
  hasMore: false,
  error: null,
  loadMore: vi.fn(),
  refetch: vi.fn(),
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

vi.mock('@/hooks/useUserStream/useUserStream', () => ({
  useUserStream: vi.fn(),
}));

vi.mock('@/hooks/useInfiniteScroll/useInfiniteScroll', () => ({
  useInfiniteScroll: vi.fn(),
}));

vi.mock('@/hooks/useFollowUser/useFollowUser', () => ({
  useFollowUser: vi.fn(),
}));

// Mock Atoms
vi.mock('@/atoms', () => ({
  Container: ({
    children,
    className,
    'data-testid': dataTestId,
  }: {
    children: ReactNode;
    className?: string;
    'data-testid'?: string;
  }) => (
    <div data-testid={dataTestId || 'container'} className={className}>
      {children}
    </div>
  ),
  Heading: ({ children }: { children: ReactNode }) => <h5 data-testid="heading">{children}</h5>,
  Spinner: () => <div data-testid="spinner">Loading...</div>,
  Typography: ({ children, as: Tag = 'p' }: { children: ReactNode; as?: ElementType }) => {
    const Component = Tag;
    return <Component>{children}</Component>;
  },
}));

// Mock Organisms
vi.mock('@/organisms', () => ({
  UserListItem: ({ user, followButtonVariant = 'icon' }: { user: { id: string }; followButtonVariant?: string }) => (
    <div data-testid="user-list-item" data-user-id={user.id} data-follow-button-variant={followButtonVariant}>
      User item
    </div>
  ),
  FullUserListItemSkeleton: () => <div data-testid="user-list-item-skeleton-full">Skeleton item</div>,
}));

const mockUsers = [
  {
    id: 'user-1' as Core.Pubky,
    name: 'John Doe',
    bio: 'Test bio',
    image: null,
    avatarUrl: null,
    status: null,
    counts: { tags: 10, posts: 5, followers: 100, following: 50 },
    isFollowing: false,
  },
  {
    id: 'user-2' as Core.Pubky,
    name: 'Jane Smith',
    bio: 'Another bio',
    image: null,
    avatarUrl: null,
    status: null,
    counts: { tags: 20, posts: 10, followers: 200, following: 100 },
    isFollowing: true,
  },
];

const mockLoadingResult = {
  users: [],
  userIds: [],
  isLoading: true,
  isLoadingMore: false,
  hasMore: false,
  error: null,
  loadMore: vi.fn(),
  refetch: vi.fn(),
};

const mockUsersResult = {
  users: mockUsers,
  userIds: mockUsers.map((u) => u.id),
  isLoading: false,
  isLoadingMore: false,
  hasMore: true,
  error: null,
  loadMore: vi.fn(),
  refetch: vi.fn(),
};

describe('WhoToFollowPageMain', () => {
  beforeEach(() => {
    vi.mocked(useUserStream).mockImplementation(mockUseUserStream);
    vi.mocked(useInfiniteScroll).mockReturnValue(
      asOpaque<ReturnType<typeof useInfiniteScroll>>(mockUseInfiniteScroll()),
    );
    vi.mocked(useFollowUser).mockReturnValue(asOpaque<ReturnType<typeof useFollowUser>>(mockUseFollowUser()));
  });

  it('renders empty state when no users', () => {
    render(<WhoToFollowPageMain />);
    expect(screen.getByTestId('who-to-follow-empty')).toBeInTheDocument();
    expect(screen.getByText('No recommendations yet')).toBeInTheDocument();
  });

  it('renders loading state when isLoading is true', () => {
    vi.mocked(useUserStream).mockReturnValue(mockLoadingResult);
    render(<WhoToFollowPageMain />);
    expect(screen.getAllByTestId('user-list-item-skeleton-full')).toHaveLength(30);
  });

  it('renders users when there are items', () => {
    vi.mocked(useUserStream).mockReturnValue(mockUsersResult);

    render(<WhoToFollowPageMain />);
    const userItems = screen.getAllByTestId('user-list-item');
    expect(userItems).toHaveLength(2);
    expect(userItems[0]).toHaveAttribute('data-user-id', 'user-1');
    expect(userItems[1]).toHaveAttribute('data-user-id', 'user-2');
  });

  it('uses default icon followButtonVariant for UserListItem', () => {
    vi.mocked(useUserStream).mockReturnValue(mockUsersResult);

    render(<WhoToFollowPageMain />);
    const userItems = screen.getAllByTestId('user-list-item');
    userItems.forEach((item) => {
      // should default to icon only without text
      expect(item).toHaveAttribute('data-follow-button-variant', 'icon');
    });
  });

  it('calls useUserStream with correct params', () => {
    vi.mocked(useUserStream).mockReturnValue(mockUsersResult);
    render(<WhoToFollowPageMain />);

    expect(useUserStream).toHaveBeenCalledWith({
      streamId: 'recommended',
      limit: 30,
      paginated: true,
      includeRelationships: true,
      includeCounts: true,
    });
  });
});

describe('WhoToFollowPageMain - Snapshots', () => {
  beforeEach(() => {
    vi.mocked(useUserStream).mockImplementation(mockUseUserStream);
    vi.mocked(useInfiniteScroll).mockReturnValue(
      asOpaque<ReturnType<typeof useInfiniteScroll>>(mockUseInfiniteScroll()),
    );
    vi.mocked(useFollowUser).mockReturnValue(asOpaque<ReturnType<typeof useFollowUser>>(mockUseFollowUser()));
  });

  it('matches snapshot with no users', () => {
    const { container } = render(<WhoToFollowPageMain />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot when loading', () => {
    vi.mocked(useUserStream).mockReturnValue(mockLoadingResult);
    const { container } = render(<WhoToFollowPageMain />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with users', () => {
    vi.mocked(useUserStream).mockReturnValue(mockUsersResult);

    const { container } = render(<WhoToFollowPageMain />);
    expect(container).toMatchSnapshot();
  });
});
