import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActiveUsers } from './ActiveUsers';

const hooksMocks = vi.hoisted(() => ({
  useUserStream: vi.fn(),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock('@/hooks/useUserStream/useUserStream', () => ({
  useUserStream: hooksMocks.useUserStream,
}));

vi.mock('@/hooks/useFollowUser/useFollowUser', () => ({
  useFollowUser: () => ({
    toggleFollow: vi.fn(),
    isUserLoading: () => false,
  }),
}));

describe('ActiveUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooksMocks.useUserStream.mockReset();
  });

  describe('Data Flow - Issue #967', () => {
    it('shows loading skeletons while stream is loading', () => {
      hooksMocks.useUserStream.mockReturnValue({
        users: [],
        userIds: [],
        isLoading: true,
        isLoadingMore: false,
        hasMore: false,
        error: null,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      });

      render(<ActiveUsers />);

      expect(screen.getAllByTestId('user-list-item-skeleton-compact')).toHaveLength(3);
      expect(screen.queryByText('No users to show')).not.toBeInTheDocument();
    });

    it('should display users when stream returns user details', () => {
      hooksMocks.useUserStream.mockReturnValue({
        users: [
          {
            id: 'user-1',
            name: 'User One',
            bio: 'Bio 1',
            image: null,
            avatarUrl: null,
            status: null,
            isFollowing: false,
          },
          {
            id: 'user-2',
            name: 'User Two',
            bio: 'Bio 2',
            image: null,
            avatarUrl: null,
            status: null,
            isFollowing: false,
          },
          {
            id: 'user-3',
            name: 'User Three',
            bio: 'Bio 3',
            image: null,
            avatarUrl: null,
            status: null,
            isFollowing: false,
          },
        ],
        userIds: ['user-1', 'user-2', 'user-3'],
        isLoading: false,
        isLoadingMore: false,
        hasMore: false,
        error: null,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      });

      render(<ActiveUsers />);

      expect(screen.getByText('User One')).toBeInTheDocument();
      expect(screen.getByText('User Two')).toBeInTheDocument();
      expect(screen.getByText('User Three')).toBeInTheDocument();
    });

    it('should show "No users to show" when stream is empty', () => {
      hooksMocks.useUserStream.mockReturnValue({
        users: [],
        userIds: [],
        isLoading: false,
        isLoadingMore: false,
        hasMore: false,
        error: null,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      });

      render(<ActiveUsers />);

      expect(screen.getByText('No users to show')).toBeInTheDocument();
    });

    it('should show "No users to show" when stream has IDs but user details are missing from cache', () => {
      hooksMocks.useUserStream.mockReturnValue({
        users: [],
        userIds: ['missing-user-1', 'missing-user-2'],
        isLoading: false,
        isLoadingMore: false,
        hasMore: false,
        error: null,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      });

      render(<ActiveUsers />);

      expect(screen.getByText('No users to show')).toBeInTheDocument();
    });
  });
});

describe('ActiveUsers - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooksMocks.useUserStream.mockReset();
  });

  it('matches snapshot when loading', () => {
    hooksMocks.useUserStream.mockReturnValue({
      users: [],
      userIds: [],
      isLoading: true,
      isLoadingMore: false,
      hasMore: false,
      error: null,
      loadMore: vi.fn(),
      refetch: vi.fn(),
    });

    const { container } = render(<ActiveUsers />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with users', () => {
    hooksMocks.useUserStream.mockReturnValue({
      users: [
        { id: 'user-1', name: 'User One', image: null, avatarUrl: null, isFollowing: false },
        { id: 'user-2', name: 'User Two', image: null, avatarUrl: null, isFollowing: true },
      ],
      userIds: ['user-1', 'user-2'],
      isLoading: false,
      isLoadingMore: false,
      hasMore: false,
      error: null,
      loadMore: vi.fn(),
      refetch: vi.fn(),
    });

    const { container } = render(<ActiveUsers />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when empty', () => {
    hooksMocks.useUserStream.mockReturnValue({
      users: [],
      userIds: [],
      isLoading: false,
      isLoadingMore: false,
      hasMore: false,
      error: null,
      loadMore: vi.fn(),
      refetch: vi.fn(),
    });

    const { container } = render(<ActiveUsers />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
