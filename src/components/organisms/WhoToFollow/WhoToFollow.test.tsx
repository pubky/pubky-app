import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ElementType, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFollowUser } from '@/hooks/useFollowUser/useFollowUser';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { useUserStream } from '@/hooks/useUserStream/useUserStream';
import type { Pubky } from '@/models/models.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { WhoToFollow } from './WhoToFollow';

// Mock dependencies
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn((selector) => {
    const state = { currentUserPubky: 'current-user-123' as Pubky };
    return selector ? selector(state) : state;
  }),
}));
vi.mock('@/models/stream/user/userStream.types', () => ({
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

const mockToggleFollow = vi.fn();
const mockIsUserLoading = vi.fn(() => false);
const mockUseFollowUser = vi.fn(() => ({
  toggleFollow: mockToggleFollow,
  isUserLoading: mockIsUserLoading,
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
vi.mock('@/atoms/Container/Container', () => {
  return {
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
  };
});

vi.mock('@/atoms/Heading/Heading', () => {
  return {
    Heading: ({ children }: { children: ReactNode }) => <h5 data-testid="heading">{children}</h5>,
  };
});

vi.mock('@/atoms/Spinner/Spinner', () => {
  return {
    Spinner: () => <div data-testid="spinner">Loading...</div>,
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({ children, as: Tag = 'p' }: { children: ReactNode; as?: ElementType }) => {
      const Component = Tag;
      return <Component>{children}</Component>;
    },
  };
});

// Mock Organisms
vi.mock('@/organisms/FullUserListItemSkeleton/FullUserListItemSkeleton', () => {
  return {
    FullUserListItemSkeleton: () => <div data-testid="user-list-item-skeleton-full">Skeleton item</div>,
  };
});

vi.mock('@/organisms/UserListItem/UserListItem', () => {
  return {
    UserListItem: ({
      user,
      followButtonVariant = 'icon',
      onFollowClick,
    }: {
      user: { id: string; isFollowing?: boolean };
      followButtonVariant?: string;
      onFollowClick?: (userId: string, isFollowing: boolean) => void;
    }) => (
      <button
        data-testid="user-list-item"
        data-user-id={user.id}
        data-follow-button-variant={followButtonVariant}
        type="button"
        onClick={() => onFollowClick?.(user.id, user.isFollowing ?? false)}
      >
        User item
      </button>
    ),
  };
});

const mockUsers = [
  {
    id: 'user-1' as Pubky,
    name: 'John Doe',
    bio: 'Test bio',
    image: null,
    avatarUrl: null,
    status: null,
    counts: { tags: 10, posts: 5, followers: 100, following: 50 },
    isFollowing: false,
  },
  {
    id: 'user-2' as Pubky,
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

describe('WhoToFollow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToggleFollow.mockResolvedValue(undefined);
    vi.mocked(useUserStream).mockImplementation(mockUseUserStream);
    vi.mocked(useInfiniteScroll).mockReturnValue(
      asOpaque<ReturnType<typeof useInfiniteScroll>>(mockUseInfiniteScroll()),
    );
    vi.mocked(useFollowUser).mockReturnValue(asOpaque<ReturnType<typeof useFollowUser>>(mockUseFollowUser()));
  });

  it('renders empty state when no users', () => {
    render(<WhoToFollow />);
    expect(screen.getByTestId('who-to-follow-empty')).toBeInTheDocument();
    expect(screen.getByText('No recommendations yet')).toBeInTheDocument();
  });

  it('renders loading state when isLoading is true', () => {
    vi.mocked(useUserStream).mockReturnValue(mockLoadingResult);
    render(<WhoToFollow />);
    expect(screen.getAllByTestId('user-list-item-skeleton-full')).toHaveLength(30);
  });

  it('renders users when there are items', () => {
    vi.mocked(useUserStream).mockReturnValue(mockUsersResult);

    render(<WhoToFollow />);
    const userItems = screen.getAllByTestId('user-list-item');
    expect(userItems).toHaveLength(2);
    expect(userItems[0]).toHaveAttribute('data-user-id', 'user-1');
    expect(userItems[1]).toHaveAttribute('data-user-id', 'user-2');
  });

  it('uses default icon followButtonVariant for UserListItem', () => {
    vi.mocked(useUserStream).mockReturnValue(mockUsersResult);

    render(<WhoToFollow />);
    const userItems = screen.getAllByTestId('user-list-item');
    userItems.forEach((item) => {
      // should default to icon only without text
      expect(item).toHaveAttribute('data-follow-button-variant', 'icon');
    });
  });

  it('calls useUserStream with correct params', () => {
    vi.mocked(useUserStream).mockReturnValue(mockUsersResult);
    render(<WhoToFollow />);

    expect(useUserStream).toHaveBeenCalledWith({
      streamId: 'recommended',
      limit: 30,
      bufferSize: 30,
      refillThreshold: 30,
      paginated: true,
      includeRelationships: true,
      includeCounts: true,
      excludeFollowing: true,
      preserveFollowedUserIds: [],
    });
  });

  it('passes clicked users as preserved before follow resolves', async () => {
    mockToggleFollow.mockReturnValue(new Promise(() => {}));
    vi.mocked(useUserStream).mockReturnValue(mockUsersResult);

    render(<WhoToFollow />);
    fireEvent.click(screen.getAllByTestId('user-list-item')[0]);

    expect(mockToggleFollow).toHaveBeenCalledWith('user-1', false);
    await waitFor(() => {
      expect(useUserStream).toHaveBeenLastCalledWith(
        expect.objectContaining({
          preserveFollowedUserIds: ['user-1'],
        }),
      );
    });
  });
});

describe('WhoToFollow - Snapshots', () => {
  beforeEach(() => {
    vi.mocked(useUserStream).mockImplementation(mockUseUserStream);
    vi.mocked(useInfiniteScroll).mockReturnValue(
      asOpaque<ReturnType<typeof useInfiniteScroll>>(mockUseInfiniteScroll()),
    );
    vi.mocked(useFollowUser).mockReturnValue(asOpaque<ReturnType<typeof useFollowUser>>(mockUseFollowUser()));
  });

  it('matches snapshot with no users', () => {
    const { container } = render(<WhoToFollow />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot when loading', () => {
    vi.mocked(useUserStream).mockReturnValue(mockLoadingResult);
    const { container } = render(<WhoToFollow />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with users', () => {
    vi.mocked(useUserStream).mockReturnValue(mockUsersResult);

    const { container } = render(<WhoToFollow />);
    expect(container).toMatchSnapshot();
  });
});
