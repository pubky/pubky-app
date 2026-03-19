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

// Mock the useFollowUser hook
vi.mock('@/hooks', async () => {
  const actual = await vi.importActual('@/hooks');
  return {
    ...actual,
    useUserStream: hooksMocks.useUserStream,
    useFollowUser: () => ({
      toggleFollow: vi.fn(),
      isUserLoading: () => false,
    }),
  };
});

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
